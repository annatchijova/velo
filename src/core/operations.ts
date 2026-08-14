import { runAllDetectors, type DetectorResult } from "../engine/detectors.js";
import type { Artifact, CoverageGap } from "../engine/evidence.js";
import { score, type ScoreResult } from "../engine/scorer.js";
import { computeArtifactTrust, type ArtifactTrust } from "../engine/trust_fusion.js";
import { sealBundle, verifyBundle, type BundleVerification, type SealedBundle } from "../seal/bundle.js";
import {
  appendCustodyEvent,
  createCustodyChain,
  verifyCustodyChain,
  type CustodyChain,
  type CustodyEventType,
} from "../seal/custody.js";
import { listBundles, loadBundle, saveBundle, toSummary, type CaseListing, type CaseSummary } from "../mcp/store.js";
import { narrate, type NarrativeRecord, type NarratorBackend } from "../narrative/narrator.js";
import { resolveNarrator } from "../narrative/backends.js";

/**
 * The operations every interface calls.
 *
 * There are three ways into VELO — the MCP server (agents), the Next.js
 * API routes (the browser UI), and the CLI simulation — and they must not
 * each grow their own copy of the rules. Red team F8 was exactly that
 * failure in miniature: two copies of one function, already diverged
 * before anyone noticed. Interfaces stay thin; the behaviour lives here.
 *
 * Two things in particular must never be reimplemented per-interface,
 * because getting either subtly wrong changes a verdict:
 *   - how the custody chain is assembled from caller-supplied events;
 *   - how `custodyValid` is DERIVED from that chain rather than asserted.
 */

export interface CustodyEventInput {
  eventType: CustodyEventType;
  timestamp: string;
  detail: string;
}

export interface AnalyzeCaseInput {
  caseId: string;
  artifacts: Artifact[];
  devilAdvocate: string;
  custodyEvents: CustodyEventInput[];
  /** Sources that should have been examined and were not — see scorer.ts. */
  coverageGaps?: CoverageGap[];
}

export interface AnalysisResult {
  detectorResults: DetectorResult[];
  scoreResult: ScoreResult;
  custodyChain: CustodyChain;
  custodyValid: boolean;
  custodyReason: string;
  /**
   * Per-artifact effective-trust audit (VIGIA trust_fusion port, exact
   * Fractions serialized as strings). Reported BESIDE the verdict, never
   * an input to it — see src/engine/trust_fusion.ts for why the VIGIA
   * verdict gates were deliberately not adopted.
   */
  artifactTrust: ArtifactTrust[];
}

/**
 * Run the engine without sealing anything — what the UI shows before the
 * user commits to a seal.
 */
export function analyzeCase(input: AnalyzeCaseInput): AnalysisResult {
  const { caseId, artifacts, devilAdvocate, custodyEvents, coverageGaps } = input;

  let custodyChain = createCustodyChain(caseId);
  for (const ev of custodyEvents) {
    custodyChain = appendCustodyEvent(custodyChain, ev.eventType, ev.timestamp, ev.detail);
  }
  custodyChain = appendCustodyEvent(custodyChain, "ANALYZED", new Date().toISOString(), "deterministic engine ran");

  // Derived, never asserted. Evidence with no acquisition history cannot
  // support an admissible verdict, whatever it shows.
  const custodyCheck = verifyCustodyChain(custodyChain);
  const hasAcquisitionHistory = custodyEvents.length > 0;
  const custodyValid = custodyCheck.valid && hasAcquisitionHistory;

  const detectorResults = runAllDetectors(artifacts);
  const scoreResult = score({ detectorResults, artifacts, devilAdvocate, custodyValid, coverageGaps });
  const artifactTrust = computeArtifactTrust(artifacts, detectorResults);

  return {
    detectorResults,
    scoreResult,
    artifactTrust,
    custodyChain,
    custodyValid,
    custodyReason: hasAcquisitionHistory
      ? custodyCheck.reason
      : "No custody events supplied — treated as no chain of custody, so the verdict is ABSTAIN.",
  };
}

/** Seal an analysis that has already been run. Does not touch disk. */
export function sealAnalysis(caseId: string, artifacts: Artifact[], analysis: AnalysisResult): SealedBundle {
  return sealBundle(
    caseId,
    new Date().toISOString(),
    analysis.scoreResult,
    { caseId, artifacts },
    analysis.custodyChain,
  );
}

export interface SealCaseResult {
  savedTo: string;
  summary: CaseSummary;
  reasoning: string;
  custodyValid: boolean;
  custodyNote: string;
  corroboratingSources: string[];
  detectorsFired: string[];
}

/** Analyze, seal, and persist — the MCP server's `seal_case`. */
export function sealCase(input: AnalyzeCaseInput): SealCaseResult {
  const analysis = analyzeCase(input);
  const bundle = sealAnalysis(input.caseId, input.artifacts, analysis);
  const savedTo = saveBundle(bundle);

  return {
    savedTo,
    summary: toSummary(bundle),
    reasoning: analysis.scoreResult.reasoning,
    custodyValid: analysis.custodyValid,
    custodyNote: analysis.custodyReason,
    corroboratingSources: analysis.scoreResult.corroboratingSources,
    detectorsFired: analysis.scoreResult.detectorsFired,
  };
}

export function listCases(): CaseListing {
  return listBundles();
}

/** Public summary only — never the evidence manifest or the custody detail. */
export function getCase(caseId: string): CaseSummary | null {
  const bundle = loadBundle(caseId);
  return bundle ? toSummary(bundle) : null;
}

export function verifyCase(caseId: string): BundleVerification | null {
  const bundle = loadBundle(caseId);
  return bundle ? verifyBundle(bundle) : null;
}

export interface NarrateCaseResult {
  narrative: NarrativeRecord | null;
  /** Why the narrative is absent or flagged — honest degradation, stated. */
  note: string;
}

/**
 * Narrate an already-sealed case. STRICTLY POST-SEAL and read-only: the
 * narrator can only be invoked on a bundle loaded from disk, after
 * sealing, and nothing it returns feeds back into any sealed value. If no
 * backend is configured or the backend fails, the case remains complete
 * and valid — the narrative is a feature, never the core.
 */
export async function narrateCase(caseId: string, backend?: NarratorBackend | null): Promise<NarrateCaseResult | null> {
  const bundle = loadBundle(caseId);
  if (!bundle) return null;

  const narrator = backend ?? resolveNarrator();
  if (!narrator) {
    return {
      narrative: null,
      note: "No narrator configured (set VELO_NARRATOR=ollama or VELO_NARRATOR=anthropic). The sealed analysis is complete without prose.",
    };
  }
  try {
    const narrative = await narrate(bundle, narrator);
    return {
      narrative,
      note: narrative.proseConsistentWithVerdict
        ? "Narrative generated beside the seal. The prose is decorative; the sealed verdict is authoritative."
        : `Narrative generated but flagged: ${narrative.consistencyNote}`,
    };
  } catch (err) {
    // A narrator failure must not destroy or degrade the sealed analysis.
    return {
      narrative: null,
      note: `Narrator ${narrator.name} (${narrator.model}) failed: ${err instanceof Error ? err.message : String(err)}. The sealed analysis is unaffected.`,
    };
  }
}

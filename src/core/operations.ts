import { runAllDetectors } from "../engine/detectors.js";
import type { Artifact } from "../engine/evidence.js";
import { score } from "../engine/scorer.js";
import { sealBundle, verifyBundle, type BundleVerification } from "../seal/bundle.js";
import {
  appendCustodyEvent,
  createCustodyChain,
  verifyCustodyChain,
  type CustodyEventType,
} from "../seal/custody.js";
import { listBundles, loadBundle, saveBundle, toSummary, type CaseListing, type CaseSummary } from "../mcp/store.js";

/**
 * The operations both frontends call.
 *
 * There are two ways into VELO — an MCP server (agents) and a loopback
 * HTTP server (the browser UI) — and they must not drift apart. Red team
 * F8 was exactly that failure in miniature: two copies of one function,
 * already diverged before anyone noticed. Interfaces are thin; the
 * behaviour lives here, once.
 */

export interface CustodyEventInput {
  eventType: CustodyEventType;
  timestamp: string;
  detail: string;
}

export interface SealCaseInput {
  caseId: string;
  artifacts: Artifact[];
  devilAdvocate: string;
  custodyEvents: CustodyEventInput[];
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

export function sealCase(input: SealCaseInput): SealCaseResult {
  const { caseId, artifacts, devilAdvocate, custodyEvents } = input;

  let chain = createCustodyChain(caseId);
  for (const ev of custodyEvents) {
    chain = appendCustodyEvent(chain, ev.eventType, ev.timestamp, ev.detail);
  }
  chain = appendCustodyEvent(chain, "ANALYZED", new Date().toISOString(), "deterministic engine ran");

  // Derived, never asserted: evidence with no acquisition history cannot
  // support an admissible verdict, whatever it shows.
  const custodyCheck = verifyCustodyChain(chain);
  const hasAcquisitionHistory = custodyEvents.length > 0;
  const custodyValid = custodyCheck.valid && hasAcquisitionHistory;

  const detectorResults = runAllDetectors(artifacts);
  const scoreResult = score({ detectorResults, artifacts, devilAdvocate, custodyValid });

  const bundle = sealBundle(caseId, new Date().toISOString(), scoreResult, { caseId, artifacts }, chain);
  const savedTo = saveBundle(bundle);

  return {
    savedTo,
    summary: toSummary(bundle),
    reasoning: scoreResult.reasoning,
    custodyValid,
    custodyNote: hasAcquisitionHistory
      ? custodyCheck.reason
      : "No custody events supplied — treated as no chain of custody, so the verdict is ABSTAIN.",
    corroboratingSources: scoreResult.corroboratingSources,
    detectorsFired: scoreResult.detectorsFired,
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

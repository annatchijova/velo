import { createHash } from "node:crypto";
import type { EvidenceManifest } from "../engine/evidence.js";
import type { ScoreResult } from "../engine/scorer.js";
import { canonicalize } from "./canonical.js";
import { type CustodyChain, appendCustodyEvent, chainTip, verifyCustodyChain } from "./custody.js";

/**
 * Two distinct hashes, on purpose (a lesson learned the hard way in an
 * earlier project, EBS v1): a "bundle hash" that identifies THIS
 * particular execution — it changes every time, because it includes the
 * seal timestamp and the custody chain — and an "analysis fingerprint"
 * that identifies the ANALYSIS ITSELF, independent of when or how many
 * times it was replayed. Re-running the same deterministic engine on the
 * same evidence twice must produce the same fingerprint but two different
 * bundle hashes. Conflating the two makes reproducibility impossible to
 * demonstrate: you'd never be able to tell "this is the same analysis run
 * again" from "this is a different analysis" by comparing hashes.
 */

export interface SealedBundle {
  caseId: string;
  sealedAt: string;
  verdict: ScoreResult["verdict"];
  score: string;
  corroborationCount: number;
  detectorsFired: string[];
  devilAdvocate: string;
  reasoning: string;
  evidenceManifest: EvidenceManifest;
  custodyChain: CustodyChain;
  bundleHash: string;
  analysisFingerprint: string;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function sealBundle(
  caseId: string,
  sealedAt: string,
  scoreResult: ScoreResult,
  evidenceManifest: EvidenceManifest,
  custodyChainBeforeSeal: CustodyChain,
): SealedBundle {
  // The SEALED event is the last thing appended, so the custody chain
  // itself testifies to the moment of sealing.
  const custodyChain = appendCustodyEvent(custodyChainBeforeSeal, "SEALED", sealedAt, `bundle sealed for ${caseId}`);

  const deterministicCore = {
    caseId,
    verdict: scoreResult.verdict,
    score: scoreResult.score.toString(),
    corroborationCount: scoreResult.corroborationCount,
    detectorsFired: scoreResult.detectorsFired,
    devilAdvocate: scoreResult.devilAdvocate,
    reasoning: scoreResult.reasoning,
    evidenceManifest,
  };

  // No timestamp, no custody chain — reproducible by re-running the engine.
  const analysisFingerprint = sha256Hex(canonicalize(deterministicCore));

  // Includes sealedAt and the custody chain tip — unique to this execution.
  const bundleHash = sha256Hex(
    canonicalize({
      ...deterministicCore,
      sealedAt,
      custodyTip: chainTip(custodyChain),
    }),
  );

  return {
    caseId,
    sealedAt,
    verdict: scoreResult.verdict,
    score: scoreResult.score.toString(),
    corroborationCount: scoreResult.corroborationCount,
    detectorsFired: scoreResult.detectorsFired,
    devilAdvocate: scoreResult.devilAdvocate,
    reasoning: scoreResult.reasoning,
    evidenceManifest,
    custodyChain,
    bundleHash,
    analysisFingerprint,
  };
}

export interface BundleVerification {
  valid: boolean;
  reasons: string[];
}

/** Recomputes both hashes and the custody chain independently — trusts nothing stored in the bundle. */
export function verifyBundle(bundle: SealedBundle): BundleVerification {
  const reasons: string[] = [];

  const custodyResult = verifyCustodyChain(bundle.custodyChain);
  if (!custodyResult.valid) {
    reasons.push(`Custody chain: ${custodyResult.reason}`);
  }

  const deterministicCore = {
    caseId: bundle.caseId,
    verdict: bundle.verdict,
    score: bundle.score,
    corroborationCount: bundle.corroborationCount,
    detectorsFired: bundle.detectorsFired,
    devilAdvocate: bundle.devilAdvocate,
    reasoning: bundle.reasoning,
    evidenceManifest: bundle.evidenceManifest,
  };

  const expectedFingerprint = sha256Hex(canonicalize(deterministicCore));
  if (expectedFingerprint !== bundle.analysisFingerprint) {
    reasons.push("Analysis fingerprint does not match recomputed value — the analysis content was altered after sealing.");
  }

  const expectedBundleHash = sha256Hex(
    canonicalize({ ...deterministicCore, sealedAt: bundle.sealedAt, custodyTip: chainTip(bundle.custodyChain) }),
  );
  if (expectedBundleHash !== bundle.bundleHash) {
    reasons.push("Bundle hash does not match recomputed value — either the timestamp or the custody chain was altered.");
  }

  if (bundle.verdict === "MALICE" && bundle.corroborationCount < 2) {
    reasons.push("MALICE verdict without the required minimum of 2 corroborating sources — Daubert gate violated.");
  }
  if (bundle.verdict === "MALICE" && bundle.devilAdvocate.trim().length === 0) {
    reasons.push("MALICE verdict without a devil's-advocate counter-argument.");
  }

  return { valid: reasons.length === 0, reasons };
}

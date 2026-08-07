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
  /**
   * Red team F4: this field was previously named `valid`. A judge reading
   * "valid: true" understands "this is authentic" — but what is actually
   * established is only that the bundle is self-consistent. Anyone can
   * fabricate a bundle from scratch that passes this check, because
   * everything here is SHA-256 over public data with no secret anywhere.
   * The name now says what the check means.
   */
  internallyConsistent: boolean;
  reasons: string[];
  /** Stated in every result so the limitation travels with the answer, not just the docs. */
  doesNotEstablish: string;
}

const DOES_NOT_ESTABLISH =
  "This does not establish who produced this bundle, or when. It proves only that the bundle " +
  "is internally consistent with itself. Authenticity is anchored by the on-chain attestation (Capa 2), " +
  "which is not part of this build.";

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

  return { internallyConsistent: reasons.length === 0, reasons, doesNotEstablish: DOES_NOT_ESTABLISH };
}

/**
 * What actually goes on-chain (Capa 2).
 *
 * Red team F3: the docs said the analysis fingerprint is what gets
 * committed, and custody.ts pointed at "the on-chain commitment" as the
 * defense against truncation — but the fingerprint excludes the custody
 * chain by design, so that anchor did not cover custody at all. An
 * attacker could truncate custody events, recompute the (public)
 * bundleHash, and the fingerprint would be unchanged.
 *
 * The commitment now covers both: the fingerprint (so a deterministic
 * replay of the same analysis still matches, which is the whole point of
 * having a separate fingerprint) AND the custody tip (so the custody
 * history is anchored too). Both are needed; neither alone is sufficient.
 */
export interface AttestationPayload {
  analysisFingerprint: string;
  custodyTip: string;
}

/**
 * The bundle-derived values the Compact circuit's witnesses must return
 * (`bundleFingerprint()` and `custodyTip()` in contracts/velo.compact).
 * The salt is generated per-case, not derived from the bundle, and the
 * corroboration count is read straight off the score result.
 *
 * The on-chain commitment covers MORE than these two: it is
 * `persistentHash(domain, fingerprint, custodyTip, verdict,
 * corroborationCount, salt)`, computed inside the circuit. The verdict
 * and the count are in there deliberately — without them, the circuit
 * proved knowledge of a preimage while the verdict it wrote to the
 * ledger floated free of it, so a sealed NOISE analysis could be
 * attested as MALICE with a fabricated count.
 *
 * Deliberately NOT recomputed here: Compact's `persistentHash` is not
 * SHA-256 and cannot be reproduced from TypeScript. A "commitment"
 * computed in this file would merely look like the on-chain one while
 * never matching it — worse than not having the function at all. The
 * real value comes from the generated bindings once the contract
 * compiles.
 */
export function attestationPayload(bundle: SealedBundle): AttestationPayload {
  return { analysisFingerprint: bundle.analysisFingerprint, custodyTip: chainTip(bundle.custodyChain) };
}

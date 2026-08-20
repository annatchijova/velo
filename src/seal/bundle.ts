import { createHash } from "node:crypto";
import type { Artifact, EvidenceManifest } from "../engine/evidence.js";
import type { ScoreResult } from "../engine/scorer.js";
import type { CoverageGap } from "../engine/evidence.js";
import { canonicalize } from "./canonical.js";
import { type CustodyChain, appendCustodyEvent, chainTip, verifyCustodyChain } from "./custody.js";
import { inclusionProof, merkleRoot, verifyInclusion, type InclusionProof, type InclusionVerification } from "./merkle.js";

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
  coverageGaps: CoverageGap[];
  devilAdvocate: string;
  reasoning: string;
  evidenceManifest: EvidenceManifest;
  custodyChain: CustodyChain;
  bundleHash: string;
  analysisFingerprint: string;
  /**
   * Merkle root over the canonical bytes of each artifact (src/seal/merkle.ts),
   * enabling selective disclosure: prove one artifact was in the sealed set
   * without revealing the others. DERIVED from evidenceManifest, so the
   * verifier recomputes it and the fingerprint composition is unchanged —
   * bundles sealed before this field existed still verify, with the absence
   * reported as a caveat rather than a failure (continuum KL-009 doctrine:
   * absence of a guarantee is a caveat, silence would be a lie).
   */
  evidenceRoot?: string;
}

/** Leaf bytes for the evidence Merkle tree: the canonical v2 encoding of each artifact. */
function artifactLeaves(manifest: EvidenceManifest): Buffer[] {
  return manifest.artifacts.map((a) => Buffer.from(canonicalize(a), "utf8"));
}

export function evidenceMerkleRoot(manifest: EvidenceManifest): string {
  return merkleRoot(artifactLeaves(manifest));
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
    // In the fingerprint on purpose: a declared gap is what turns
    // "nothing found" into ABSTAIN, so leaving it outside would let
    // anyone strip the gaps and silently promote the verdict to NOISE —
    // the same shape as red team F3, where the custody tip sat outside
    // the commitment it was supposed to anchor.
    coverageGaps: scoreResult.coverageGaps,
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
    coverageGaps: scoreResult.coverageGaps,
    devilAdvocate: scoreResult.devilAdvocate,
    reasoning: scoreResult.reasoning,
    evidenceManifest,
    custodyChain,
    bundleHash,
    analysisFingerprint,
    evidenceRoot: evidenceMerkleRoot(evidenceManifest),
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
  /**
   * Degradations that do not make the bundle inconsistent but that the
   * reader must know about — the WARN of a PASS/WARN/FAIL verdict. Today:
   * a legacy bundle sealed before evidenceRoot existed.
   */
  caveats: string[];
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
  const caveats: string[] = [];

  if (bundle.evidenceRoot === undefined) {
    caveats.push(
      "Bundle predates the evidence Merkle root: per-artifact inclusion proofs are not available for it. " +
        "The evidence manifest is still covered whole by the analysis fingerprint.",
    );
  } else if (bundle.evidenceRoot !== evidenceMerkleRoot(bundle.evidenceManifest)) {
    reasons.push("Evidence Merkle root does not match the manifest — an artifact was altered, added or removed after sealing.");
  }

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
    coverageGaps: bundle.coverageGaps,
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

  return { internallyConsistent: reasons.length === 0, reasons, caveats, doesNotEstablish: DOES_NOT_ESTABLISH };
}

/**
 * Selective disclosure, producer side: the proof that ONE artifact was in
 * the sealed evidence set. Hand a verifier { evidenceRoot, artifact, proof }
 * and nothing else — the remaining artifacts stay undisclosed.
 */
export function artifactInclusionProof(
  bundle: SealedBundle,
  artifactId: string,
): { evidenceRoot: string; artifact: Artifact; proof: InclusionProof } | null {
  if (bundle.evidenceRoot === undefined) return null; // legacy bundle: no root to prove against
  const index = bundle.evidenceManifest.artifacts.findIndex((a) => a.id === artifactId);
  if (index === -1) return null;
  const artifact = bundle.evidenceManifest.artifacts[index]!;
  return {
    evidenceRoot: bundle.evidenceRoot,
    artifact,
    proof: inclusionProof(artifactLeaves(bundle.evidenceManifest), index),
  };
}

/**
 * Selective disclosure, verifier side: needs only the root, the disclosed
 * artifact and its proof. Canonicalizes the artifact itself — it never
 * trusts pre-serialized bytes handed to it.
 */
export function verifyArtifactInclusion(
  evidenceRoot: string,
  artifact: Artifact,
  proof: InclusionProof,
): InclusionVerification {
  return verifyInclusion(evidenceRoot, Buffer.from(canonicalize(artifact), "utf8"), proof);
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

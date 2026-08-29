/**
 * Layer 7 — blind second opinion (commit-reveal + nullifier).
 *
 * Two accredited peritos independently attest the SAME case_commitment. The
 * system records only whether they AGREE or CONTRADICT — never either
 * examiner's identity (that is Layer 6's anonymity) nor their analysis. This
 * is the off-chain deterministic engine; the on-chain truth is the
 * commit/reveal circuits in contracts/velo_perito.compact. The two are
 * parallel structures (SHA-256 canonical here, persistentCommit on-chain) and
 * are not required to share bytes — the same framing as Layer 6's two trees.
 *
 * WHY COMMIT-REVEAL (blindness must be cryptographic, not policy): if the
 * first opinion were published in the clear, the second examiner could simply
 * copy it, and "two examiners who never communicated" would be a claim with
 * nothing enforcing it. Instead each examiner first publishes a HIDING
 * commitment to their verdict; neither may reveal until BOTH have committed.
 * The second examiner commits without being able to see the first's verdict,
 * so agreement, when it happens, is real independent convergence.
 *
 * WHY A NULLIFIER (two opinions must be two examiners): without it, one
 * examiner could submit both "independent" opinions and manufacture a fake
 * corroboration. A deterministic nullifier per (examiner, case) — with a
 * domain separator DISTINCT from the credential leaf — makes the same
 * credential unable to opine twice on one case, while never revealing which
 * credential it is (compact skill, commitment/nullifier pattern).
 *
 * DETERMINISM BOUNDARY: the commit `nonce` is a per-opinion CSPRNG secret
 * (like bundleSalt in witnesses.ts), persisted so its owner can reveal. The
 * verdict COMMITMENT is hiding — it changes with the nonce — so it is not
 * something that gets sealed into the evidence tree; it is a published,
 * owner-reproducible value. The NULLIFIER is deterministic and reproducible.
 */

import { createHash, randomBytes } from "node:crypto";
import { canonicalizeToBytes } from "../seal/canonical.js";
import { evidenceMerkleRoot } from "../seal/bundle.js";
import { artifactSchema, type Artifact } from "../engine/evidence.js";
import type { Verdict } from "../engine/scorer.js";

export const SECOND_OPINION_VERSION = 1;

const COMMIT_DOMAIN = "velo:perito:opinion-commit:v1";
const NULLIFIER_DOMAIN = "velo:perito:opinion-nullifier:v1";
const NONCE_BYTES = 32;

export type Agreement = "PENDING" | "AGREE" | "CONTRADICT";

export class SecondOpinionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecondOpinionError";
  }
}

export interface CaseCommitment {
  hex: string;
  bytes: Uint8Array;
}

/**
 * The case_commitment two blind opinions bind to: the REAL Layer 2 evidence
 * Merkle root over the case's artifacts — the same `evidenceRoot` a sealed
 * bundle carries (src/seal/bundle.ts) — NOT a synthetic hash of the caseId.
 *
 * Why the evidence root and not the analysis fingerprint: the fingerprint
 * includes the verdict/devil_advocate/reasoning, so two independent peritos
 * would differ; the evidence root is over the ARTIFACTS only, so two peritos
 * examining the same evidence share it. Their verdicts may diverge — the
 * evidence they opine on does not. That is exactly what a second opinion is.
 *
 * The artifacts are parsed through the SHARED artifactSchema first, so unknown
 * corpus fields (description_es, ...) are stripped identically to how the MCP
 * seal path parses them — otherwise the root computed here would not match a
 * real seal. Returns the 64-hex root and its 32 bytes (a drop-in Bytes<32>).
 */
export function evidenceCaseCommitment(caseObj: { case_id?: string; caseId?: string; artifacts?: unknown }): CaseCommitment {
  const caseId = caseObj.case_id ?? caseObj.caseId ?? "";
  const rawArtifacts = Array.isArray(caseObj.artifacts) ? caseObj.artifacts : [];
  if (rawArtifacts.length === 0) {
    throw new SecondOpinionError(
      `case ${JSON.stringify(caseId)} has no artifacts — refusing to bind a case_commitment to an empty evidence set`,
    );
  }
  const artifacts = rawArtifacts.map((a) => artifactSchema.parse(a)) as unknown as Artifact[];
  const hex = evidenceMerkleRoot({ caseId, artifacts });
  return { hex, bytes: Uint8Array.from(Buffer.from(hex, "hex")) };
}

function assertHex64(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new SecondOpinionError(`${field}: expected a lowercase 64-hex (32-byte) value, got ${JSON.stringify(value)}`);
  }
}

/** Fresh 32-byte opinion nonce, hex-encoded. Generated once, kept until reveal. */
export function generateOpinionNonce(): string {
  return randomBytes(NONCE_BYTES).toString("hex");
}

/**
 * Hiding + binding commitment to a verdict. The 32-byte random nonce is the
 * blinding factor: a verdict has only four possible values, so a bare hash
 * would be trivially brute-forcible — the nonce is what makes the commitment
 * reveal nothing until it is opened. Returns a lowercase 64-hex SHA-256 digest.
 */
export function makeVerdictCommitment(verdict: Verdict, nonceHex: string): string {
  assertHex64(nonceHex, "opinion nonce");
  const bytes = canonicalizeToBytes({
    v: SECOND_OPINION_VERSION,
    domain: COMMIT_DOMAIN,
    verdict,
    nonce: nonceHex,
  });
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Deterministic nullifier for (examiner, case). Domain-separated DISTINCTLY
 * from the credential leaf (secret.ts) and from the verdict commitment, so no
 * two of these hashes can ever collide across purposes. The same leafSecretKey
 * on the same caseCommitment always yields the same nullifier — that is what
 * blocks a second opinion from the same examiner — while the leafSecretKey
 * stays secret, so the nullifier never reveals which examiner it belongs to.
 */
export function opinionNullifier(leafSecretKeyHex: string, caseCommitment: string): string {
  assertHex64(leafSecretKeyHex.toLowerCase(), "leafSecretKey");
  assertHex64(caseCommitment.toLowerCase(), "caseCommitment");
  const bytes = canonicalizeToBytes({
    v: SECOND_OPINION_VERSION,
    domain: NULLIFIER_DOMAIN,
    leafSecretKey: leafSecretKeyHex.toLowerCase(),
    caseCommitment: caseCommitment.toLowerCase(),
  });
  return createHash("sha256").update(bytes).digest("hex");
}

interface CommittedOpinion {
  verdictCommitment: string;
  nullifier: string;
  revealed: boolean;
  verdict?: Verdict;
}

export interface SecondOpinionStatus {
  caseCommitment: string;
  commitCount: number;
  revealCount: number;
  agreement: Agreement;
  /** Revealed verdicts, in reveal order. Empty until at least one reveal. */
  revealedVerdicts: Verdict[];
}

/**
 * The off-chain parallel of the on-chain per-case opinion state. Exactly two
 * opinions per case; every rule fails closed.
 */
export class SecondOpinionBoard {
  readonly caseCommitment: string;
  private readonly opinions: CommittedOpinion[] = [];
  private readonly usedNullifiers = new Set<string>();

  constructor(caseCommitment: string) {
    assertHex64(caseCommitment.toLowerCase(), "caseCommitment");
    this.caseCommitment = caseCommitment.toLowerCase();
  }

  /**
   * Commit phase. Registers a hiding verdict commitment plus the examiner's
   * nullifier. Rejects a third opinion and a repeat from the same examiner.
   */
  commit(verdictCommitment: string, nullifier: string): void {
    assertHex64(verdictCommitment, "verdictCommitment");
    assertHex64(nullifier, "nullifier");
    if (this.opinions.length >= 2) {
      throw new SecondOpinionError("this case already has two opinions — a blind second opinion is exactly a pair");
    }
    if (this.usedNullifiers.has(nullifier)) {
      throw new SecondOpinionError("this examiner has already opined on this case — the two opinions must come from two distinct examiners");
    }
    this.usedNullifiers.add(nullifier);
    this.opinions.push({ verdictCommitment, nullifier, revealed: false });
  }

  /**
   * Reveal phase. Allowed ONLY once both opinions are committed — this is where
   * blindness is enforced: the second examiner could not have seen the first's
   * verdict, because no verdict is revealable until both commitments are in.
   * Opens the committed, not-yet-revealed slot whose commitment matches
   * (verdict, nonce); rejects a wrong nonce or a double reveal.
   */
  reveal(verdict: Verdict, nonceHex: string): void {
    if (this.opinions.length < 2) {
      throw new SecondOpinionError("cannot reveal until both opinions are committed — that is what keeps the second opinion blind");
    }
    const expected = makeVerdictCommitment(verdict, nonceHex);
    const slot = this.opinions.find((o) => !o.revealed && o.verdictCommitment === expected);
    if (slot === undefined) {
      throw new SecondOpinionError("no committed, unrevealed opinion opens to this (verdict, nonce)");
    }
    slot.revealed = true;
    slot.verdict = verdict;
  }

  /**
   * Public status. AGREE iff both revealed verdicts are identical — an ABSTAIN
   * against a MALICE is a CONTRADICTion, not agreement, because an abstention
   * is not a matching opinion. PENDING until both are revealed.
   */
  status(): SecondOpinionStatus {
    const revealed = this.opinions.filter((o) => o.revealed);
    const revealedVerdicts = revealed.map((o) => o.verdict!) as Verdict[];
    let agreement: Agreement = "PENDING";
    if (revealed.length === 2) {
      agreement = revealedVerdicts[0] === revealedVerdicts[1] ? "AGREE" : "CONTRADICT";
    }
    return {
      caseCommitment: this.caseCommitment,
      commitCount: this.opinions.length,
      revealCount: revealed.length,
      agreement,
      revealedVerdicts,
    };
  }
}

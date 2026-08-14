import { createHash, randomBytes } from "node:crypto";

/**
 * Contract seam — Capa 2 (the Compact gate).
 *
 * STATUS (MVP Phase 4): RETIRED. Nothing imports this module anymore. The
 * browser `/api/attest` route that used `computeCommitment` was deleted:
 * attestation happens on the expert's machine via the local CLI
 * (`deploy/attest-case.ts`), and the web app reads the real on-chain state
 * through `GET /api/chain` and the `/verify` panel. This placeholder is kept
 * only because the future browser-signed path (post-MVP, ADR-003 evolution)
 * may plug back in here; until then it is dead code by design, and its
 * F24-fixed return shape (no salt) is pinned by contract.test.ts.
 *
 * The Compact contract (`contracts/velo.compact`) is compiled AND deployed
 * to Midnight `preview` (address
 * `46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d`), and a
 * real attestation already exists on that ledger — proved and submitted by
 * the local CLI (`deploy/attest-case.ts`), where the wallet seed and proof
 * server live. The hosted UI reads that live on-chain state through
 * `GET /api/chain`. What this module still stands in for is only the
 * *browser-signed write*: signing an attestation from the connected 1AM/Lace
 * wallet in the page instead of from the CLI. This is the single seam where
 * that last piece plugs in.
 *
 * Red team F3 in the main repo changed what the on-chain commitment covers.
 * It is no longer just the fingerprint — it is
 * `persistentHash(domain, fingerprint, custodyTip, verdict,
 * corroborationCount, salt)`, computed inside the circuit. The verdict and
 * count are bound in deliberately, so a sealed NOISE analysis cannot be
 * attested as MALICE with a fabricated count, and the custody tip anchors
 * the custody history (the fingerprint excludes custody by design).
 *
 * Compact's `persistentHash` is NOT SHA-256 and cannot be reproduced from
 * TypeScript. So this seam does not fake it: `computeCommitment` derives a
 * deterministic, documented placeholder commitment for the demo build so the
 * UI has a value to show, and it is clearly labelled as the seam. The real
 * on-chain value is the one the deployed contract already computes; wiring
 * the browser-signed path changes only `computeCommitment` (and the attest
 * route's call to it), not the UI.
 *
 * Nothing in this module ever ships the evidence manifest or the salt —
 * only the commitment travels.
 */

const COMMITMENT_SCHEME = "VELO_COMMITMENT:v1";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function sha256BytesHex(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export interface CommitmentInput {
  /** Sealed analysis fingerprint (hex). */
  bundleFingerprint: string;
  /** Custody chain tip (hex) — anchors custody history. */
  custodyTip: string;
  verdict: string;
  corroborationCount: number;
  /** Hex salt — generated if omitted. The witness, never exposed. */
  salt?: string;
}

export interface Commitment {
  fingerprint: string;
  commitment: string;
  covers: string[];
}

/**
 * Placeholder commitment for the demo build, following the F3 shape:
 * sha256(SCHEME || fingerprint || custodyTip || verdict || count || salt).
 *
 * The salt is generated inside this function (or taken from the input when a
 * caller supplies one) and NEVER leaves it: red team round 6 (F24) pinned the
 * rule that no return type of this seam may carry the salt — it is a witness
 * value, folded into the commitment and discarded.
 *
 * NOTE (honesty): the compiled Compact `persistentHash` is not SHA-256 and
 * will produce different bytes. This function exists so the demo UI has a
 * concrete commitment to show; the note on every attestation says so. When
 * the contract artifacts exist, this function is replaced by a call into
 * the compiled circuit — the UI and the response shape stay unchanged.
 */
export function computeCommitment({
  bundleFingerprint,
  custodyTip,
  verdict,
  corroborationCount,
  salt,
}: CommitmentInput): Commitment {
  const saltHex = salt ?? Buffer.from(randomBytes(32)).toString("hex");
  const preimage = Buffer.concat([
    Buffer.from(COMMITMENT_SCHEME, "utf8"),
    Buffer.from(hexToBytes(bundleFingerprint)),
    Buffer.from(hexToBytes(custodyTip)),
    Buffer.from(verdict, "utf8"),
    Buffer.from(String(corroborationCount), "utf8"),
    Buffer.from(hexToBytes(saltHex)),
  ]);
  const commitment = sha256BytesHex(preimage);
  return {
    fingerprint: bundleFingerprint,
    commitment,
    covers: ["fingerprint", "custodyTip", "verdict", "corroborationCount", "salt"],
  };
}

export function randomSalt(): string {
  return Buffer.from(randomBytes(32)).toString("hex");
}

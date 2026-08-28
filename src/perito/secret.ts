/**
 * Layer 6 — the perito's private identity and its deterministic commitment.
 *
 * A perito holds a secret the network never sees: their real name, their
 * license number, and a 32-byte `leafSecretKey`. The accredited-examiners
 * Merkle tree commits to a one-way hash of that secret, so membership can be
 * proven without revealing who the examiner is.
 *
 * TWO HASHES, ON PURPOSE — do not confuse them:
 *
 *  1. `peritoSecretCommitment` (this file) is our OWN SHA-256 canonical
 *     construction. It is fully reproducible off-chain and feeds the
 *     off-chain deterministic registry (registry.ts) that MCP and the
 *     frontend use to answer "accredited + valid at date" without the chain.
 *
 *  2. The ON-CHAIN leaf key is computed INSIDE the Compact circuit with
 *     `persistentHash` (see contracts/velo_perito.compact). Its exact
 *     preimage encoding (`pad()`, `Field -> Bytes` casts) is not exported
 *     from the runtime, so — exactly as src/witness/witnesses.ts warns for
 *     the attestation commitment — it is NOT recomputed here. A commitment
 *     computed from a guessed encoding "would look correct everywhere and
 *     simply never match what the circuit publishes."
 *
 * These two trees are parallel by design and are NOT required to share a
 * root (the repo already keeps the off-chain evidence Merkle root separate
 * from the on-chain attestation commitment). See docs/layer6-perito-credential.md.
 *
 * DETERMINISM BOUNDARY: the commitment here is deterministic (no random
 * nonce). The at-rest vault (vault.ts) encrypts the SAME secret with a
 * random nonce and is therefore NON-deterministic; its output must never
 * enter a leaf or a seal. The bridge from secret into the tree is this
 * one-way deterministic hash, and only this.
 */

import { createHash, randomBytes } from "node:crypto";
import { canonicalizeToBytes } from "../seal/canonical.js";

export const PERITO_SECRET_VERSION = 1;

const LEAF_SECRET_BYTES = 32;
const COMMITMENT_DOMAIN = "velo:perito:secret-commitment:v1";

export interface PeritoSecret {
  peritoId: string;
  realName: string;
  licenseId: string;
  /**
   * 32-byte CSPRNG key, hex-encoded. Generated ONCE per perito and
   * persisted (see perito_witnesses.ts). If it is regenerated, the
   * commitment changes and the examiner is no longer the same leaf in the
   * tree — the same "salt must survive" discipline as witnesses.ts.
   */
  leafSecretKey: string;
}

/** Fresh 32-byte leaf secret key from a CSPRNG, hex-encoded. */
export function generateLeafSecretKey(): string {
  return randomBytes(LEAF_SECRET_BYTES).toString("hex");
}

/**
 * Deterministic, domain-separated commitment to a perito's secret.
 *
 * The 32-byte high-entropy `leafSecretKey` acts as the commitment's
 * blinding factor: even though `licenseId` and `peritoId` are low-entropy
 * and guessable, the commitment cannot be brute-forced without the key.
 * This is the `persistentCommit`-style "hash of value + secret", not a bare
 * `persistentHash` of guessable fields (compact skill, section 6).
 *
 * Returns a lowercase 64-hex-char SHA-256 digest.
 */
export function peritoSecretCommitment(secret: PeritoSecret): string {
  if (!/^[0-9a-fA-F]{64}$/.test(secret.leafSecretKey)) {
    throw new Error(
      `peritoSecretCommitment: leafSecretKey must be 64 hex chars (32 bytes), got ${secret.leafSecretKey.length} chars`,
    );
  }
  const bytes = canonicalizeToBytes({
    v: PERITO_SECRET_VERSION,
    domain: COMMITMENT_DOMAIN,
    peritoId: secret.peritoId,
    licenseId: secret.licenseId,
    realName: secret.realName,
    leafSecretKey: secret.leafSecretKey.toLowerCase(),
  });
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Layer 6 — the off-chain, deterministic registry of accredited peritos.
 *
 * This is the MEMBERSHIP half of the credential (validity.ts is the other
 * half). It builds a single SHA-256 Merkle tree over one leaf per
 * (examiner, validity-span) pair, REUSING src/seal/merkle.ts — there is no
 * second tree implementation here.
 *
 * ONE LEAF PER SPAN (see credential.ts): an examiner with K spans occupies
 * K leaves. `credentialProof` then selects the leaf whose window covers the
 * attestation date; if none does (VELO-PERITO-005 attesting inside its gap),
 * the proof is reported as "not covered" here, mirroring the on-circuit
 * validity assert. Membership of a span and validity of that span at a date
 * are still two distinct facts — a leaf can be in the tree while no leaf
 * covers the date.
 *
 * PARALLEL TREE, NOT THE ON-CHAIN ONE. The authoritative accredited-examiners
 * tree lives on-chain as a Compact `MerkleTree` whose leaves are
 * `persistentHash` values; membership proofs there read paths from the
 * ledger. This off-chain SHA-256 tree is a separate audit/answer structure
 * so the frontend and MCP can decide accreditation without the chain. The
 * two roots are not required to be equal. See secret.ts and
 * docs/layer6-perito-credential.md.
 */

import { canonicalizeToBytes } from "../seal/canonical.js";
import { merkleRoot, inclusionProof, verifyInclusion, type InclusionProof, type InclusionVerification } from "../seal/merkle.js";
import type { ValiditySpan } from "./credential.js";
import { checkValidity } from "./validity.js";

export const PERITO_REGISTRY_VERSION = 1;

const LEAF_KIND = "perito-credential";

/**
 * One examiner's contribution to the registry: their deterministic secret
 * commitment (from secret.ts) plus every validity span they hold. The real
 * identity is NOT here — only the one-way commitment.
 */
export interface PeritoRegistryEntry {
  peritoId: string;
  peritoCommitment: string;
  spans: ValiditySpan[];
}

/** A single leaf, after flattening spans and sorting the tree. */
export interface RegistryLeaf {
  peritoId: string;
  peritoCommitment: string;
  span: ValiditySpan;
  /** Canonical leaf bytes (what the Merkle tree hashes). */
  leafBytes: Buffer;
  /** Index of this leaf in the sorted tree — the index inclusion proofs use. */
  leafIndex: number;
}

export interface PeritoRegistry {
  version: number;
  root: string;
  leafCount: number;
  leaves: RegistryLeaf[];
}

/**
 * Canonical leaf preimage for one (commitment, span) pair.
 *
 * Domain-tagged with `kind: "perito-credential"` so a perito leaf can never
 * collide with an evidence-artifact leaf even though both are hashed by the
 * same `leafHash` (SHA-256(0x00 || bytes)) construction in merkle.ts. Every
 * field is integer or string — no float reaches the tree.
 */
export function peritoLeafBytes(peritoCommitment: string, span: ValiditySpan): Buffer {
  if (!/^[0-9a-f]{64}$/.test(peritoCommitment)) {
    throw new Error(`peritoLeafBytes: peritoCommitment must be a lowercase 64-hex SHA-256 digest, got ${JSON.stringify(peritoCommitment)}`);
  }
  return Buffer.from(
    canonicalizeToBytes({
      v: PERITO_REGISTRY_VERSION,
      kind: LEAF_KIND,
      peritoCommitment,
      validFromEpoch: span.validFromEpoch,
      validUntilEpoch: span.validUntilEpoch,
    }),
  );
}

/**
 * Build the registry from a set of entries. Leaves are sorted by their
 * canonical bytes so the root is a function of the leaf SET, independent of
 * the order entries were supplied in — a caller that lists examiners in a
 * different order still gets the same root.
 */
export function buildRegistry(entries: PeritoRegistryEntry[]): PeritoRegistry {
  const flattened = entries.flatMap((entry) =>
    entry.spans.map((span) => ({
      peritoId: entry.peritoId,
      peritoCommitment: entry.peritoCommitment,
      span,
      leafBytes: peritoLeafBytes(entry.peritoCommitment, span),
    })),
  );

  // Deterministic order: sort by the leaf bytes themselves. Buffer.compare
  // is a total byte-order, so the result is reproducible on any machine and
  // independent of input order.
  flattened.sort((a, b) => Buffer.compare(a.leafBytes, b.leafBytes));

  const leaves: RegistryLeaf[] = flattened.map((f, leafIndex) => ({ ...f, leafIndex }));
  const root = merkleRoot(leaves.map((l) => l.leafBytes));

  return { version: PERITO_REGISTRY_VERSION, root, leafCount: leaves.length, leaves };
}

export type CredentialProofResult =
  | {
      covered: true;
      leafIndex: number;
      leafBytes: Buffer;
      span: ValiditySpan;
      proof: InclusionProof;
    }
  | {
      covered: false;
      /** Why no proof was produced: examiner absent, or no span covers the date. */
      reason: string;
    };

/**
 * Produce an inclusion proof for the leaf that (a) belongs to
 * `peritoCommitment` and (b) whose validity window covers `attestationEpoch`.
 *
 * This is the off-chain analogue of the on-circuit witness path selection:
 * the prover picks the ONE covering-span leaf. When no leaf covers the date
 * — the VELO-006 gap case — this returns `{ covered: false }` rather than a
 * proof, which is the honest off-chain mirror of the circuit's validity
 * assert failing. Membership alone (the examiner IS in the tree) is not
 * enough; the covering-span requirement is where the gap is rejected.
 */
export function credentialProof(registry: PeritoRegistry, peritoCommitment: string, attestationEpoch: number): CredentialProofResult {
  const owned = registry.leaves.filter((l) => l.peritoCommitment === peritoCommitment);
  if (owned.length === 0) {
    return { covered: false, reason: `No leaf for this commitment — the examiner is not in the registry.` };
  }
  const covering = owned.find((l) => checkValidity([l.span], attestationEpoch).status === "VALID");
  if (covering === undefined) {
    return {
      covered: false,
      reason: `The examiner is in the registry, but none of their ${owned.length} span(s) covers attestation epoch ${attestationEpoch} — rejected on validity, not membership.`,
    };
  }
  const proof = inclusionProof(
    registry.leaves.map((l) => l.leafBytes),
    covering.leafIndex,
  );
  return { covered: true, leafIndex: covering.leafIndex, leafBytes: covering.leafBytes, span: covering.span, proof };
}

/**
 * Verify a credential inclusion proof against a registry root. Thin wrapper
 * over merkle.ts `verifyInclusion` so callers do not reach across modules;
 * a passing result establishes only that these exact leaf bytes were in the
 * tree with this root — not who, not when, not that the date is covered
 * (that is checkValidity's job).
 */
export function verifyCredentialInclusion(rootHex: string, leafBytes: Buffer, proof: InclusionProof): InclusionVerification {
  return verifyInclusion(rootHex, leafBytes, proof);
}

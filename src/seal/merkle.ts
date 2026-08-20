import { createHash } from "node:crypto";

/**
 * Deterministic SHA-256 Merkle tree over evidence artifacts.
 *
 * Purpose: selective disclosure. The sealed bundle commits to the whole
 * evidence set with one root; a verifier holding only the root, ONE
 * artifact's canonical bytes and an inclusion proof can confirm that
 * artifact was inside the sealed set without seeing any other artifact —
 * the same shape as the on-chain attestation story (commit publicly,
 * disclose privately).
 *
 * Design notes, each a deliberate choice:
 *
 * - DOMAIN SEPARATION (RFC 6962 style): leaves hash as
 *   SHA-256(0x00 || bytes), interior nodes as SHA-256(0x01 || L || R).
 *   Without the prefixes, 64 bytes of leaf content that happen to equal
 *   two concatenated child hashes would collide a leaf with an interior
 *   node (second-preimage attack on the tree).
 *
 * - NO ODD-NODE DUPLICATION: an odd trailing node is promoted to the next
 *   level unchanged, never paired with a copy of itself. Bitcoin's
 *   duplicate-last-node construction made [A, B, C] and [A, B, C, C]
 *   collide (CVE-2012-2459) — two different evidence sets must never
 *   share a root.
 *
 * - VERIFICATION ACCUMULATES EVERY ERROR (pattern taken from continuum's
 *   legacy/core/hash_chain.py): the auditor sees the complete damage map,
 *   not only the first broken invariant.
 *
 * - The empty tree has a defined, versioned sentinel root rather than an
 *   exception: a case with zero artifacts still seals, and its root says
 *   explicitly that it commits to nothing.
 *
 * Continuum's KL-008b is the reason this exists at the bundle level: an
 * event log (the custody chain) does not commit to state. Anchoring the
 * evidence set's Merkle root inside the sealed bundle turns the seal into
 * a state commitment with per-item proofs, at O(log n) proof size.
 */

export const MERKLE_VERSION = 1;

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

/** Root of the empty tree — versioned sentinel, not an error. */
export const EMPTY_TREE_ROOT = createHash("sha256")
  .update(`velo:merkle:empty:v${MERKLE_VERSION}`, "utf8")
  .digest("hex");

function sha256(...parts: Buffer[]): Buffer {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}

export function leafHash(leafBytes: Buffer): Buffer {
  return sha256(LEAF_PREFIX, leafBytes);
}

function nodeHash(left: Buffer, right: Buffer): Buffer {
  return sha256(NODE_PREFIX, left, right);
}

function buildLevels(leaves: Buffer[]): Buffer[][] {
  const levels: Buffer[][] = [leaves.map((l) => leafHash(l))];
  while (levels[levels.length - 1]!.length > 1) {
    const prev = levels[levels.length - 1]!;
    const next: Buffer[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i]!;
      const right = prev[i + 1];
      // Odd trailing node: promoted unchanged, never duplicated.
      next.push(right === undefined ? left : nodeHash(left, right));
    }
    levels.push(next);
  }
  return levels;
}

export function merkleRoot(leaves: Buffer[]): string {
  if (leaves.length === 0) return EMPTY_TREE_ROOT;
  const levels = buildLevels(leaves);
  return levels[levels.length - 1]![0]!.toString("hex");
}

export interface ProofStep {
  /** Hex hash of the sibling at this level. */
  hash: string;
  /** Which side the SIBLING sits on when hashing upward. */
  position: "left" | "right";
}

export interface InclusionProof {
  version: number;
  leafIndex: number;
  leafCount: number;
  siblings: ProofStep[];
}

export function inclusionProof(leaves: Buffer[], leafIndex: number): InclusionProof {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(`inclusionProof: leafIndex ${leafIndex} out of range for ${leaves.length} leaves`);
  }
  const levels = buildLevels(leaves);
  const siblings: ProofStep[] = [];
  let index = leafIndex;
  for (let depth = 0; depth < levels.length - 1; depth++) {
    const level = levels[depth]!;
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const sibling = level[siblingIndex];
    // No sibling: this node was promoted unchanged; the proof has no step
    // at this level and the index simply moves up.
    if (sibling !== undefined) {
      siblings.push({ hash: sibling.toString("hex"), position: isRight ? "left" : "right" });
    }
    index = Math.floor(index / 2);
  }
  return { version: MERKLE_VERSION, leafIndex, leafCount: leaves.length, siblings };
}

export interface InclusionVerification {
  valid: boolean;
  /** Complete damage map — every violated invariant, not just the first. */
  reasons: string[];
  /** What a passing check does and does not establish. */
  establishes: string;
}

const ESTABLISHES =
  "A passing proof establishes only that these exact bytes were a leaf of the tree with this root. " +
  "It does not establish who built the tree, when, or that the root itself is anchored anywhere — " +
  "for sealed bundles that anchoring is the bundle seal and the on-chain attestation.";

/**
 * Stdlib-only verification: recomputes the path from the leaf bytes up and
 * compares against the expected root. Trusts nothing in the proof beyond
 * the sibling hashes it is explicitly told to fold in.
 */
export function verifyInclusion(expectedRootHex: string, leafBytes: Buffer, proof: InclusionProof): InclusionVerification {
  const reasons: string[] = [];

  if (proof.version !== MERKLE_VERSION) {
    reasons.push(`Proof version ${proof.version} is not the supported version ${MERKLE_VERSION}.`);
  }
  if (!Number.isInteger(proof.leafIndex) || proof.leafIndex < 0 || proof.leafIndex >= proof.leafCount) {
    reasons.push(`Leaf index ${proof.leafIndex} is out of range for a tree of ${proof.leafCount} leaves.`);
  }
  const maxSiblings = proof.leafCount > 0 ? Math.ceil(Math.log2(Math.max(2, proof.leafCount))) : 0;
  if (proof.siblings.length > maxSiblings) {
    reasons.push(`Proof carries ${proof.siblings.length} siblings but a tree of ${proof.leafCount} leaves has depth ${maxSiblings}.`);
  }

  let current = leafHash(leafBytes);
  for (const [i, step] of proof.siblings.entries()) {
    if (!/^[0-9a-f]{64}$/.test(step.hash)) {
      reasons.push(`Sibling ${i} is not a lowercase 64-hex-char SHA-256 digest.`);
      continue;
    }
    const sibling = Buffer.from(step.hash, "hex");
    current = step.position === "left" ? nodeHash(sibling, current) : nodeHash(current, sibling);
  }

  if (current.toString("hex") !== expectedRootHex) {
    reasons.push("Recomputed root does not match the expected root — the leaf is not part of this tree, or the proof was altered.");
  }

  return { valid: reasons.length === 0, reasons, establishes: ESTABLISHES };
}

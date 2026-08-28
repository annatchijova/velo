# Layer 6 — the perito (examiner) anonymous credential

## What it is

Today VELO seals an analysis and attests a verdict on-chain
(`contracts/velo.compact`, Capa 2). Nothing yet proves the author is an
accredited forensic examiner. Layer 6 is the credential that closes that gap:
a ZK proof that, **at the exact date of an attestation**, *some* accredited
examiner held a **currently-valid** license — without revealing which examiner.

It answers a different question from Capa 2. Capa 2 proves "this verdict was
sealed and has not been altered." Layer 6 proves "the person who sealed it was
authorized to." Two separate claims, two separate proofs.

## Two checks, deliberately separate

The credential makes two checks that must stay distinguishable:

1. **Membership** — the examiner is a leaf in the tree of accredited peritos.
2. **Validity at the attestation date** — the license window covers the exact
   date of *this* attestation, not a global "is this person ever licensed."

The synthetic corpus (`peritos-syntetic/`) was built to force this
distinction. `VELO-PERITO-005` is the adversarial fixture: it belongs to the
tree (membership always passes) but has a licensing **gap** between
`2026-02-01` and `2026-06-01`. It attests three cases:

| Case | Attestation date (ANALYZED) | Which span | Outcome |
|------|------------------------------|------------|---------|
| VELO-009 | 2026-01-16 | period 1 `[2025-06-01, 2026-02-01]` | **VALID** |
| VELO-006 | 2026-04-10 | none — in the gap | **INVALID** (rejected on validity, not membership) |
| VELO-010 | 2026-07-20 | period 2 `[2026-06-01, 2029-06-01]` | **VALID** |

Same examiner, three dates, three outcomes. VELO-006 is the Layer-6 analogue of
`VELO-004-cadena-rota` returning ABSTAIN for a broken chain of custody: the
rejection is for validity, not for the verdict and not for membership.

## Design decision: one Merkle leaf per validity span

A credential with K validity spans becomes **K leaves**, not one leaf carrying
an in-circuit array of periods. `VELO-PERITO-005` gets two leaves; every other
examiner gets one.

Why this shape:

- **The gap falls out for free.** A leaf commits to
  `(peritoSecretCommitment, validFrom, validUntil)`. The prover proves
  membership of the leaf whose window covers the attestation date, and the
  circuit range-checks that window. VELO-006 at `2026-04-10` has no such leaf,
  so whichever span leaf the prover supplies, the validity assert rejects it.
- **The circuit shape is identical for single- and multi-span examiners** —
  "find the one leaf that covers this date." No variable-length in-circuit
  loop, no `Vector<N,...>` whose N would leak the maximum period count.
- **Re-licensing is an append.** A lapse-and-re-licensing genuinely *is* a new
  credential span, so modeling it as an appended leaf matches the append-only
  doctrine the repo already uses for the custody chain and the tamper-evident
  log.

Trade-off, stated plainly: an examiner with K spans occupies K leaves, so the
tree is slightly larger and re-issuance appends rather than mutates. That is
the correct semantics, not a workaround.

## The determinism boundary (why the vault never enters a seal)

The perito holds a secret: real name, license number, and a 32-byte
`leafSecretKey`. That secret has two representations, and they must never
cross:

```
 perito secret ──(deterministic SHA-256 commitment)──▶ Merkle leaf   (sealed path)
 perito secret ──(AES-256-GCM, random nonce)─────────▶ vault at rest (NOT sealed)
```

- The **leaf** commits to a *deterministic* hash of the secret
  (`src/perito/secret.ts`, `peritoSecretCommitment`). Reproducible bit-for-bit,
  so the registry root is stable — the no-float / canonical-serialization
  discipline (CLAUDE.md 5.2).
- The **vault** (`src/perito/vault.ts`, ported from continuum's
  `dbcrypto.py`) encrypts the *plaintext* secret at rest with a fresh random
  nonce per value. Its output is **non-deterministic by design** and MUST NEVER
  be canonicalized, sealed, or placed in a leaf. `peritoLeafBytes` rejects any
  non-hex input, so a ciphertext token cannot be smuggled into the tree.

The bridge from secret into the tree is the one-way deterministic hash, and
only that. This is enforced by `tests/perito-determinism.test.ts`.

## Two parallel Merkle trees (this is intentional, not a bug)

There are two trees, serving two purposes, and they are **not required to
share a root**:

- **On-chain** — `accreditedPeritos: MerkleTree<16, Bytes<32>>` in
  `contracts/velo_perito.compact`. Leaves are `persistentHash` values; the
  authoritative membership proof reads its path from the ledger. This is the
  real credential.
- **Off-chain** — the SHA-256/RFC6962 tree in `src/perito/registry.ts`
  (reusing `src/seal/merkle.ts`). A deterministic audit/answer structure so the
  MCP tools and the frontend can decide "accredited + valid at date" without
  the chain.

The repo already keeps the off-chain evidence Merkle root separate from the
on-chain attestation commitment; this mirrors that. If a single shared root is
ever wanted, the off-chain side must adopt the runtime's `persistentHash`
encoding — which is not exported, the same caveat `src/witness/witnesses.ts`
records for the attestation commitment.

## What a passing Layer 6 proof establishes — and what it does not

- It establishes that **some** accredited examiner whose credential window
  covered the attestation date produced this attestation.
- It does **not** reveal **which** examiner. The `public_alias` is the ceiling
  of what could ever leak; the real name never goes on-chain.
- It does **not**, by itself, establish that the underlying analysis is
  admissible — that is Capa 2 (the seal + the Daubert corroboration gate) and
  the chain of custody. Membership, validity, and admissibility are three
  separate facts.

## Compile status (honest)

`contracts/velo_perito.compact` **compiled** with compact 0.5.1 on 2026-08-28:
both circuits (`registerCredential`, `proveCredential`), prover + verifier keys
and zkir generated under `contracts/managed/velo_perito/`, exit 0, on a CPU with
AVX2. The compiler forced one disclosure to be declared (the witness Merkle
path where it feeds `merkleTreePathRoot`); `disclose()` there is a compile-time
annotation, not publication — the path stays a witness and anonymity holds.

**Not yet done:** the transaction write path is not wired to a wallet or a
deployment (same status as velo.compact's attest path). What the tests and MCP
exercise today is the off-chain TypeScript engine in `src/perito/`. No live
proving session has been run.

## Out of scope this iteration

Layer 7 — the blind second opinion (two examiners attesting the same
`case_commitment` independently, exercised by `VELO-PERITO-003`/`-004` on
`VELO-005`) — is **not** built here. The corpus supports it; this iteration is
the credential only.

## A note on layer numbering (unresolved — for the maintainer)

The numbering is **not consistent across the repo**, and this document does not
silently resolve it:

- `peritos-syntetic/README.md` (the corpus this work follows): **Layer 6 = the
  examiner credential**, Layer 7 = the blind second opinion.
- `docs/IDENTITY.md`: **Layer 7 = the anonymous expert credential**, Layer 6 =
  tiered disclosure for evidence.

This work follows the **corpus** scheme (Layer 6 = credential) because the
corpus is the fixture set that defines the acceptance criteria. `IDENTITY.md`
was left unchanged rather than rewritten on inference — reconciling the two
schemes into one canonical numbering is a maintainer decision, flagged here.

## Files

- `src/perito/credential.ts` — parse/normalize profiles; single/multi-span → `NormalizedPerito`.
- `src/perito/validity.ts` — three-state validity (VALID/INVALID/ABSTAIN) at an epoch.
- `src/perito/secret.ts` — perito secret + deterministic commitment (the bridge into the tree).
- `src/perito/registry.ts` — off-chain deterministic Merkle registry (reuses `src/seal/merkle.ts`).
- `src/perito/vault.ts` — AES-256-GCM encrypted-at-rest vault (ported from continuum `dbcrypto.py`).
- `src/perito/visibility.ts` — own-vs-others "my cases" data shaping.
- `src/perito/case_adapter.ts` — attestation date (ANALYZED custody event) from a case.
- `src/witness/perito_witnesses.ts` — the circuit's private inputs, reconciled to the generated bindings.
- `contracts/velo_perito.compact` — the Layer 6 circuit (membership + validity).
- `src/core/perito_operations.ts` + `src/mcp/server.ts` — the shared operations and MCP tools.
- `tests/perito-*.test.ts` — parsing, the VELO-PERITO-005 trio, membership, vault, visibility, determinism, witnesses.

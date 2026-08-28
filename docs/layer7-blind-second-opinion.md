# Layer 7 — the blind second opinion

## What it is

Layer 6 proves *one* accredited examiner attested a case. Layer 7 is the next
claim: **two accredited peritos independently attest the same `case_commitment`,
and the system records only whether they AGREE or CONTRADICT — never either
examiner's identity or their analysis.** The pitch: two examiners who never
communicated converge on MALICE, and the ledger can show that convergence while
revealing neither who they are nor how they reasoned.

The corpus fixture (`VELO-PERITO-003`, AR, and `VELO-PERITO-004`, US) is built
for exactly this: both hold a VALID credential at `VELO-005`'s attestation date
(2026-04-10), both reach **MALICE** (VELO-005 has three engine-corroborated
sources), so the pair resolves to **AGREE / MALICE**.

## Why blindness must be cryptographic, not policy

If the first opinion were published in the clear, the second examiner could just
copy it — and "two examiners who never communicated" would be a claim with
nothing enforcing it. So Layer 7 uses **commit-reveal**:

1. **Commit** — each examiner publishes a *hiding* commitment to their verdict,
   `commit(verdict, nonce)`. A verdict has only four values, so a bare hash
   would be trivially brute-forcible; the 32-byte random nonce is the blinding
   factor that makes the commitment reveal nothing. The examiner also proves
   their Layer 6 credential and registers a nullifier (below).
2. **Reveal** — allowed *only* once **both** opinions are committed
   (`commitCount == 2`). Each examiner publishes `(verdict, nonce)`; the contract
   checks it opens a stored, not-yet-revealed commitment.
3. **Agreement** — once both are open, **AGREE** iff the two verdicts are
   identical, else **CONTRADICT**. Integer/enum equality, deterministic, no float.

The second examiner commits without being able to see the first's verdict, so
agreement, when it happens, is real independent convergence — not an echo.

## Why a nullifier (two opinions must be two examiners)

Without it, one examiner could submit both "independent" opinions and manufacture
a fake corroboration. Each opinion carries a deterministic **nullifier**:

```
nullifier = H("velo:perito:opinion-nullifier:v1", leafSecretKey, case_commitment)
```

Deterministic per (examiner, case), with a domain separator **distinct** from
the credential leaf and the verdict commitment (so these hashes can never
collide across purposes). The same credential cannot opine twice on one case;
two distinct examiners have distinct `leafSecretKey`s and therefore distinct
nullifiers — while the nullifier never reveals which examiner it belongs to.
This is the compact skill's commitment/nullifier pattern.

## What Layer 7 composes on

`commitOpinion` reuses the **exact** Layer 6 credential proof
(`assertValidCredential`: membership in the accredited tree + the two validity
asserts). So every opinion is, by construction, from an accredited examiner
whose license was valid at the attestation date — the Layer 6 guarantee — plus
the Layer 7 blindness and distinct-examiner guarantees.

## What a passing pair establishes — and what it does not

- It establishes that **two distinct accredited examiners**, each valid at the
  date, independently reached verdicts that AGREE (or CONTRADICT), with neither
  able to have copied the other.
- It does **not** reveal **which** examiners, and it does **not** reveal either
  analysis — only the verdicts, and only after both committed.
- AGREE is not "correctness". Two examiners can independently be wrong. It is
  independent convergence, which is evidence, not proof — stated as such.
- An **ABSTAIN against a MALICE is a CONTRADICTion**, not agreement: an
  abstention is not a matching opinion.

## Two parallel structures (same framing as Layer 6)

- **On-chain** (`contracts/velo_perito.compact`): `commitOpinion` / `revealOpinion`,
  a `Map<case_commitment, CaseOpinions>` holding the two slots, and a
  `Set` of used nullifiers. Commitments use `persistentHash`.
- **Off-chain** (`src/perito/second_opinion.ts`): a `SecondOpinionBoard` that
  runs the identical protocol with SHA-256 canonical commitments, so the
  frontend/MCP/tests can exercise it without the chain. The two are parallel and
  not required to share bytes.

## Determinism boundary

The commit `nonce` is a per-opinion CSPRNG secret (like `bundleSalt`),
persisted so its owner can reveal. The **verdict commitment is hiding** — it
changes with the nonce — so it is a published, owner-reproducible value, not
something sealed into the evidence tree. The **nullifier is deterministic** and
reproducible. Tested in `tests/perito-second-opinion.test.ts`.

## Compile status (honest)

`contracts/velo_perito.compact` **compiled** with compact 0.5.1 (four circuits:
`registerCredential`, `proveCredential`, `commitOpinion`, `revealOpinion`;
prover + verifier keys + zkir generated). The compiler forced `disclose()` on
the reveal's public `verdict`/`nonce` where they reach the ledger — a
compile-time annotation, since those values are public in the reveal by
definition. **Not yet done:** the transaction write path is not wired to a
wallet (same posture as Layer 6 and velo.compact's attest path); the demo runs
the protocol off-chain.

## VELO-005 walkthrough (the demo)

`second_opinion_demo` (MCP tool) runs it end to end:

```
commit A   commit=1 reveal=0 agreement=PENDING   verdicts=[]
commit B   commit=2 reveal=0 agreement=PENDING   verdicts=[]
reveal A   commit=2 reveal=1 agreement=PENDING   verdicts=[MALICE]
reveal B   commit=2 reveal=2 agreement=AGREE     verdicts=[MALICE, MALICE]
```

Both commitments land before either reveal — the proof that neither verdict was
visible when the other committed — ending in AGREE / MALICE for
VELO-PERITO-003 + VELO-PERITO-004, without either identity in the output.

## Files

- `src/perito/second_opinion.ts` — commit/nullifier/board (off-chain engine).
- `contracts/velo_perito.compact` — `commitOpinion` / `revealOpinion` (+ Layer 6).
- `src/witness/perito_witnesses.ts` — `opinionVerdict` / `opinionNonce` witnesses.
- `src/core/perito_operations.ts` + `src/mcp/server.ts` — `second_opinion_demo`
  (live) and PENDING `commit_opinion` / `reveal_opinion`.
- `tests/perito-second-opinion.test.ts` — blindness, nullifier, agreement, reveal integrity.

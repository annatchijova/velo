# Security Audit — VELO
## Red Team Round 6

**Date:** 2026-08-08  **Method:** Abductive Engineering (A–D–I) + Red-Team Auditing
(`.claude/skills/red-team-auditing`, `.claude/skills/red-teaming-zk-attestation-systems`)
**Base:** `main` @ `1820bd5` — audit started on `feat/vercel-deploy` @ `1b753b9`;
the shared checkout moved to `main` mid-audit (see the concurrency note below).
**Runtime:** Node v22.23.2, Bun (deploy path), tsc 5.6
**Baseline:** full suite green — 55/55 tests (`npm test`)
**Reproducible evidence:** `scripts/verify-r6-provenance-normalization.mjs`
(new this round); live chain read via `scripts/verify-chain-read.mjs`

**Relationship to Round 5:** Round 5 (`docs/RED_TEAM_ROUND_5.md`, F19) was
audited and committed by a concurrent session while this one was running —
the same collision the ZK-attestation skill warns about ("re-verify the
target file before writing the finding; this codebase has multiple
concurrent sessions"). Round 5 fixed the verdict-index decode fallback in
`src/chain/read.ts`. This round's findings were re-verified against
`main @ 1820bd5` after that landed; none overlap F19. Finding numbering
continues the F-series (F18 was the last of Round 4, F19 Round 5).

**Scope (what Round 6 covers that Rounds 1–5 did not):**
`deploy/attest-case.ts`, `deploy/register-dust.ts`, `deploy/redact-seed.ts`,
`deploy/network-config.ts` re-check, `deploy/managed-shim/`;
`src/witness/witnesses.ts`; the Next.js frontend beyond the three F14 routes
(`lib/corpus.ts`, `lib/contract.ts`, `lib/http.ts` re-check, `app/api/chain`,
`cases`, `peritos`, login, XSS sweep); the post-Round-4 engine change
(coverage gaps, "absence of evidence", commit `9fdb25a`); repo hygiene (key
store, env files, secrets sweep); the two open PRs (#10, #12);
`src/chain/read.ts` post-F19 (`hexToBytes` specifically).

**Out of scope:** live proof generation (no AVX2 machine), the MCP-path
prompt-injection retry (F15 remains open), Vercel production deployment
(observed config only — Round 5 confirmed nothing is deployed yet).

## Threat model

- Attacker CAN: author or modify the input case JSON fed to the engine
  (via MCP `seal_case` or the HTTP API), including markers, provenance
  labels, and coverage-gap declarations; send arbitrary HTTP requests to the
  frontend API; read the public ledger.
- Attacker CANNOT: modify the engine/contract code; hold the operator's
  wallet seed or `MIDNIGHT_STORAGE_PASSWORD`; modify a bundle after sealing;
  compromise the Midnight indexer or node (indexer trust is stated where
  relevant); bypass TLS to the indexer.

## Epistemic legend

CODE FACT · PLAUSIBLE HYPOTHESIS · CONFIRMED BY INDUCTION · FALSIFIED

## Executive summary

| ID | Severity | Level | Module | Finding |
|----|----------|-------|--------|---------|
| F20 | Medium | CONFIRMED BY INDUCTION | `src/engine/scorer.ts` | Provenance-root dedup is case-sensitive: the same physical source spelled `"DISK-IMG-01"` / `"disk-img-01"` counts as 2 independent sources and flips SUSPICION → MALICE |
| F21 | Low | CONFIRMED (behavior) / PLAUSIBLE (impact) | `deploy/redact-seed.ts` | F16 redaction matches a single token after `wallet seed:` — multi-word values leak words 2..n, rephrased log lines pass through silently |
| F22 | Low-Med | CODE FACT | `frontend/src/app/api/*/route.ts` | No request-body size cap or rate limit on the compute-bearing POST routes |
| F23 | Low-Med | CODE FACT | `frontend/package.json` (open PR #10) | On `main`, `next dev` still binds `0.0.0.0` — the evidence UI is reachable from the LAN until PR #10 merges |
| F24 | Low | CODE FACT | `frontend/src/lib/i18n.tsx`, `frontend/src/lib/contract.ts` | Drift: hero says "not deployed yet" while the contract is live with a real attestation; the placeholder-commitment seam's return type still carries the salt |
| F25 | Low | CODE FACT | `src/chain/read.ts` | `hexToBytes` silently coerces non-hex pairs to `0x00` instead of rejecting malformed indexer output (adjacent to F19, which fixed the verdict-index half of the same decode path) |

Net assessment: the system has graduated from Round-1 defects. What remains
is one real normalization defect in the newest engine surface (F20), a set
of hardening items, and documentation drift. Nothing found this round breaks
the seal, the commitment, or the on-chain gate.

## Findings

### F20 — Case-variant provenance roots defeat source deduplication and can carry a verdict over the Daubert gate

**Severity:** Medium  **Epistemic level:** CONFIRMED BY INDUCTION  **Bucket:** software vulnerability (downstream of analyst-controlled input — see precondition)

- **Surprise:** `sourceOf()` in `src/engine/scorer.ts:72-77` normalizes the two
  fallback paths differently: the `source` field is trimmed **and lowercased**,
  but the preferred provenance root (`provenanceChain[0]`) is only trimmed.
  Corroboration — the number the Compact circuit hashes into the commitment and
  the Daubert gate compares against 2 — is a `Set` of these strings.
- **Abduction:** rivals were (a) detectors non-monotonic in artifacts —
  falsified by reading, all five detectors are additive-only, score bounded at
  6/5; (b) coverage gaps gameable upward — they only degrade NOISE to ABSTAIN,
  by design; (c) normalization asymmetry in source identity — cheapest to test,
  and it held.
- **Deduction (stated before the experiment):** two artifacts from the same
  physical source, provenance roots differing only in letter case, carrying
  markers that fire anti-forensic (3/10) + cross-source (1/4) = 11/20 > 33/100,
  yield `corroborationCount === 2` and verdict MALICE; identical roots yield
  count 1 and SUSPICION; the `source`-field path dedupes the same case variant.
- **Induction:** `scripts/verify-r6-provenance-normalization.mjs` (run against
  freshly built `dist/`, base `1820bd5`). All three predictions HELD:

  ```
  A) roots "DISK-IMG-01"/"disk-img-01"  -> count=2, verdict=MALICE
  B) roots identical                    -> count=1, verdict=SUSPICION
  C) source "Workstation"/"workstation" -> count=1  (lowercased — the asymmetry)
  ```

- **Causal chain:**
  ```
  analyst-typed provenance root, case-variant of the same source
      ↓ Set key differs by case only
  corroborationCount = 2 for one physical source
      ↓ hasCorroboration flips true (scorer.ts:113)
  MALICE gate passes (score 11/20 already > 33/100)
      ↓ count is hashed into the on-chain commitment (velo.compact:124-131)
  the circuit cryptographically binds a corroboration figure
  that letter case alone was enough to inflate
  ```
- **Threat-model precondition:** the attacker authors the input case JSON —
  the same precondition as G3 (source independence is analyst-declared, never
  verified). What is new here is narrower and worse than G3 in one specific
  way: G3 says a lying analyst can declare two fake sources; F20 says the
  *one structural check the engine does perform* (string-set dedup) changes
  its answer on letter case alone — so the inflation also happens
  **accidentally** (`"DISK-01"` vs `"disk-01"` across analysts or tools),
  producing a wrong MALICE with nobody intending it. A wrong verdict can be
  induced before sealing; the seal and the circuit then work perfectly over
  the wrong number.
- **Fix direction:** normalize the provenance root the same way as `source`
  (trim + case-fold, ideally Unicode-aware), in `sourceOf()` only. The
  experiment script is the regression test.

### F21 — F16 seed redaction is a single-token pattern match

**Severity:** Low  **Epistemic level:** CONFIRMED BY INDUCTION (redaction behavior) / PLAUSIBLE HYPOTHESIS (impact)  **Bucket:** hygiene / hardening

- **CODE FACT:** `deploy/redact-seed.ts:18` — `SEED_LEAK_PATTERN =
  /(wallet\s*seed:?\s*)(\S+)/gi` redacts exactly one non-whitespace token
  after the label.
- **Induction (run under Bun, same runtime as the deploy path):**
  - `"Wallet seed: <64-hex>"` → fully redacted (today's upstream format — holds).
  - `"Wallet seed: word1 word2 word3 word4 word5"` → `word2..word5` printed in
    the clear.
  - `"seed=abc123…"` (any rephrasing of the upstream log line) → passes
    through untouched, silently.
- **Why this is Low and not higher:** Round 4 verified against the real
  tarball that `@effectstream/midnight-contracts@0.103.2` logs the seed as a
  single hex token in exactly the matched format, and the mitigation was
  re-verified 10/10 on both runtimes. The defect is brittleness, not current
  exposure: a dependency bump that rephrases the line or logs the mnemonic
  (`MIDNIGHT_WALLET_MNEMONIC` is a supported input — 24 space-separated
  words) defeats the redaction **with no signal**. A mitigation that fails
  silently trains operators to trust logs that are no longer filtered.
- **Fix direction:** redact by *value*, not by label — the seed is known in
  process (`midnightNetworkConfig.walletSeed`); filter any occurrence of that
  exact string (and the mnemonic, if set) regardless of surrounding format,
  and keep the label pattern as a second layer. F16 stays what Round 4
  classified it as: a mitigation around an upstream defect, not a fix.

### F22 — No body-size cap or rate limit on compute-bearing POST routes

**Severity:** Low-Med  **Epistemic level:** CODE FACT  **Bucket:** hygiene

- `/api/seal`, `/api/verify`, `/api/attest` all call `await req.json()` with
  no size guard (`frontend/src/app/api/seal/route.ts:85` and siblings). The
  F14 fix closed cross-origin *sending*; it does nothing about a same-origin
  or non-browser client posting arbitrarily large bodies — parse cost and
  memory are unbounded at the application layer. On Vercel the platform's own
  payload limit (~4.5 MB) caps this incidentally; self-hosted (`next start`,
  the Dockerfile path) has no cap at all.
- The F14 comment itself anticipated this ("today this is compute-abuse at
  worst"). This finding just records that the residual is real and unbounded
  outside Vercel. A `Content-Length` sanity check + body read cap closes it.

### F23 — Open exposure on `main`: `next dev` binds all interfaces (PR #10 pending)

**Severity:** Low-Med  **Epistemic level:** CODE FACT  **Bucket:** software vulnerability (dev-time), already PRed

- `frontend/package.json` on `main` runs `next dev` with no `--hostname`;
  Next 15 defaults to `0.0.0.0`. A machine holding a victim's evidence running
  the dev server exposes the seal/verify UI to the local network — the exact
  property the project states ("must not open a port to its network").
- Open PR #10 (`fix/dev-server-binding`) pins `--hostname 127.0.0.1` and
  documents why `npm start` keeps the default (container). The diff was
  reviewed this round and is correct as far as it goes. **Merging #10 is the
  fix; until then the exposure stands.** Note PRs #10 and #12 both edit
  `AGENTS.md` — whichever merges second will need a rebase.

### F24 — Documentation/UI drift around the deployment that already happened

**Severity:** Low  **Epistemic level:** CODE FACT  **Bucket:** hygiene (messaging)

- `frontend/src/lib/i18n.tsx:158,341` still carries
  `hero.step3Sub: "commitment only — not deployed yet"` (EN+ES). The contract
  is deployed on `preview` and carries a real attestation — verified live this
  round: `node scripts/verify-chain-read.mjs` returned `attestationCount: 1`,
  commitment `632dbf01…3b2b` → **MALICE** (the Daubert gate held on a real
  deploy, which is also worth recording). The string is an *under*claim, so
  the severity is cosmetic — but a tool whose product is trustworthy wording
  should not drift in either direction.
- `frontend/src/lib/contract.ts:60-66`: the placeholder `Commitment`
  interface still includes `salt` in its return shape. Today's route
  (`/api/attest`) picks fields and does not forward it, and the response is
  honestly labeled `local_pending_contract`. The seam returning the witness
  in-process is one careless `NextResponse.json(commitmentObject)` away from
  shipping the salt. Drop the field from the returned object.

### F25 — `hexToBytes` in the chain reader silently coerces malformed hex

**Severity:** Low  **Epistemic level:** CODE FACT  **Bucket:** hygiene

- `src/chain/read.ts:175-179`: `hex.match(/../g)` + `Number.parseInt(h, 16)`
  turns non-hex pairs into `NaN`, which `Uint8Array.from` coerces to `0x00`;
  an odd trailing nibble is dropped. The input is indexer output, so this is
  only reachable under a misbehaving/compromised indexer (threat-model
  assumption, stated), and `ContractState.deserialize` downstream very likely
  rejects garbage — but "very likely" is doing work in that sentence.
  Fail closed: validate `/^([0-9a-fA-F]{2})+$/` before decoding, mirroring the
  strictness `witnesses.ts:73-87` already applies to the same 32-byte values
  on the write path. Round 5's F19 fixed the verdict-index half of this decode
  path; this is the half it didn't touch.

## Discarded (non-exploitable) vectors

| Vector | Result | Why it failed |
|---|---|---|
| Path traversal via `/api/cases/[id]` (`loadCase(id)` reading outside `cases/`) | FALSIFIED (by code reading + the F1 test suite) | `corpus.ts:49` gates on the shared `isValidCaseId` — the F1 fix is present, single-sourced, and defense-in-depth (`resolveInsideStore`) |
| XSS in verdict/case rendering | FALSIFIED (by code reading) | No `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere in `frontend/src`; React escaping holds |
| CSRF on routes beyond the F14 three | FALSIFIED | `chain`, `cases`, `peritos` are read-only GETs; all POST routes call `requireJsonContentType()` |
| Key store / env leakage in repo | FALSIFIED | `midnight-level-db-deploy/` is gitignored and untracked; `.env.local` untracked, never in history; secrets sweep over tracked files found only comments and fail-closed checks |
| Engine non-monotonicity / score runaway (Round-2/3 class) | FALSIFIED (by code reading) | All five detectors are additive-only; score is a sum of fixed weights bounded at 6/5; corroboration is a monotone set union; custody failure forces ABSTAIN regardless |
| On-chain replay via salt reuse | FALSIFIED (design, re-verified) | Verdict+count+salt are inside the commitment; the membership assert rejects re-attestation of an identical tuple (G2 fix confirmed live — the one real attestation exists exactly once) |
| `attest-case.ts` printing secret material in the tx result | Not exploitable as written | Output is sliced to 2000 chars and contains the call result, not witnesses; salt is explicitly never printed (`attest-case.ts:174`) |
| Wallet secrets reachable from the Vercel frontend | FALSIFIED (independently, same result as Round 5) | No `process.env`/`NEXT_PUBLIC_` secret reference in `frontend/src`; the only env var read is `VELO_REPO_ROOT` |

## Architectural observations (not findings — recorded for the next round)

- **Attestation identity is the commitment, and the commitment includes the
  salt.** Losing the `velo-private-state-attest` LevelDB store means the same
  sealed case re-attests under a *new* commitment (new salt), and
  `attestationCount` grows — the replay guard cannot help because it keys on
  the commitment. The contract comments frame this as intended correction
  semantics ("a correction has to be a new, visibly different commitment").
  The operator-facing consequence worth one line in the runbook: **back up
  the private-state store; it is the only copy of the salt, and without it
  the commitment is unverifiable even by its own author**
  (`witnesses.ts:46-49` says exactly this — the runbook should too).
- **The read path trusts the indexer absolutely** (`readOnChainLedger`). That
  is the standard Midnight posture and is disclosed in the route's
  `doesNotEstablish` field; it is a threat-model assumption, not a defect.
  If VELO ever needs "the UI cannot be lied to by the indexer", the answer is
  an inclusion proof, not more parsing.
- **F20 has an on-chain echo.** The corroboration count that letter case can
  inflate is one of the six fields the circuit hashes into the commitment.
  The circuit faithfully binds whatever the engine computed — the guarantee
  chain is only as strong as the normalization at its input end.

## PR review notes (requested this round)

- **PR #10** (`fix/dev-server-binding`, OPEN) — correct, closes F23. Merge
  recommended.
- **PR #12** (`build/release-and-commit-rules`, OPEN) — release-please +
  commitlint repair + workflow files. Reviewed the diff: permissions on both
  new workflows are minimal and appropriate (`contents: write` on the release
  workflow is required by release-please; the PR-title check is read-only).
  No security objections. Both PRs touch `AGENTS.md`; merge order matters.

## Recommendations (out of scope of this change — record only)

1. Normalize the provenance root in `sourceOf()` (trim + case-fold) and pin
   it with the experiment script as a regression test. (F20)
2. Redact the seed *by value* in `withSeedRedaction`, keeping the label
   pattern as a second layer. (F21)
3. Body-size cap on the three POST routes. (F22)
4. Merge PR #10. (F23)
5. Fix the stale "not deployed yet" strings; drop `salt` from the
   placeholder `Commitment` return shape. (F24)
6. Validate state hex before decoding in `read.ts`. (F25)
7. Add the private-state-store backup note to the on-chain runbook.

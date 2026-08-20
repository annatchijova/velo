# Security Audit — VELO v0.1.0
## Red Team — Round 5 (Vercel-deployable frontend, chain-read verdict decoding)

**Date:** 2026-08-07 · **Method:** Abductive Engineering (A–D–I) + Red-Team Auditing
**Scope:** everything that landed after Round 4 (`main` @ `a500029`) and had not been reviewed: `fcc3710` (frontend deployability on Vercel — `frontend/vercel.json`, `frontend/next.config.mjs`, static corpus API routes) and `ea14075` (chain bindings bundling fix). Extended, on inspection of `src/chain/read.ts`'s verdict decoding, to a pre-existing gap that this round is the first to have reason to look at closely: what a Vercel-hosted, indexer-facing read path does when the ledger returns a verdict index this reader doesn't recognize.
**Relationship to prior rounds:** Round 4 covered `deploy/` (wallet-holding, write-side tooling). This round covers the read-side path that a public, no-wallet-required Vercel deployment would expose, plus the newly-static corpus API surface.
**Base:** `feat/vercel-deploy` @ `e5e4c84` (merged to `main` as PR #15 during this audit).
**Reproducible evidence:** file:line citations below; the one finding fixed in this round has a runnable test (`tests/chain.test.ts`, `node --test`).

---

## Threat model

- **Attacker CAN:** view a live Vercel deployment (once one exists) or the public GitHub repo; read anything served by `/api/*` routes; observe the ledger through the public Midnight indexer, same as anyone.
- **Attacker CANNOT:** read the deploying operator's local environment variables or filesystem; intercept network traffic (out of scope, as in prior rounds).
- **Trust boundary crossed:** what the frontend build/runtime can observe (env vars, corpus files, contract bindings) versus what a browser loading the deployed site can observe (the client JS bundle, API responses).

**The judge test:** if asked to prove a public visitor to the deployed VELO frontend can never see a secret or a real victim's data, what would you have to assume? This round tests each of those assumptions directly rather than accepting the architecture's own stated design as proof.

## Epistemic legend

CODE FACT · PLAUSIBLE HYPOTHESIS · CONFIRMED BY INDUCTION · FALSIFIED

---

## Executive summary

| ID | Severity | Level | Module | Finding | Status |
|----|----------|-------|--------|---------|--------|
| F19 | Medium | CODE FACT | `src/chain/read.ts` | Ledger verdict index decoded with a silent fallback to `NOISE` instead of failing loud on drift from the Compact enum | **FIXED** |

## Findings

### F19 — Unrecognized on-chain verdict index silently downgraded to NOISE — FIXED

**Severity:** Medium · **Level:** CODE FACT · **Bucket:** software vulnerability (a wrong index is silently misreported, not merely rejected)

- **Surprise:** `src/chain/read.ts` (pre-fix): `verdict: VERDICT_BY_INDEX[verdictIndex] ?? "NOISE"`. `VERDICT_BY_INDEX` is `["NOISE", "SUSPICION", "MALICE", "ABSTAIN"]` — a hand-written mirror of `export enum Verdict { NOISE, SUSPICION, MALICE, ABSTAIN }` in `contracts/velo.compact:35`, with no shared source of truth: the generated contract bindings decode the ledger's verdict as a bare numeric index, and the label order is duplicated by hand in TypeScript.
- **Secondness:** every other decode failure in this file fails loud by design and says so explicitly — the file's own docstring states "a failure to attest never looks like a failure to read," and a sibling check already treats an absent contract as "an explicit error, not an empty ledger" (tested in `tests/chain.test.ts`). An out-of-range verdict index was the one decode failure that did the opposite: it produced a *plausible, specific, wrong* value instead of an error.
- **Thirdness:** this is exactly VELO's core promise inverted. If the Compact enum is ever reordered or extended in a future revision without `VERDICT_BY_INDEX` being updated in lockstep — or if a frontend build is ever pointed at a differently-versioned contract — a real `MALICE` verdict at an index this array doesn't expect would render as `NOISE`, the most benign label, with nothing in the UI or logs indicating anything went wrong. For a tool whose entire pitch is "the verdict is visible," the one failure mode that must never happen quietly is showing the wrong verdict as if it were correct.
- **Abduction vs. rivals:** considered whether this was reachable at all before flagging it — the currently deployed contract's enum matches the array exactly, so there is no live drift today. Confirmed via `grep` that `verdictFromIndex`/`VERDICT_BY_INDEX` had zero test references before this round — the gap was real, not hypothetical-and-covered.
- **Fix applied:** extracted the lookup into `verdictFromIndex(index): Verdict`, which throws `ChainReadError` on any index outside `0..3` instead of defaulting. A thrown error inside the `caseVerdicts` decode loop propagates as a `ChainReadError` from `readOnChainLedger`, which the `/api/chain` route already maps to a `503`/`reachable: false` response — the existing "unreachable indexer" UX, not a new failure path. Two tests added: exhaustive coverage of all four valid indices, and that indices `4, 5, -1, 100` are refused rather than mapped to `NOISE`.
- **Verification:** `node --test dist/tests/chain.test.js` — 9/9 pass, including the two new cases. Full suite (`node --test dist/tests/*.test.js`) — 55/55 pass, no regressions.
- **Threat-model precondition:** requires either a future contract redeploy whose enum ordering diverges from this file, or the frontend being pointed (via `VELO_CONTRACT_ADDRESS`/`MIDNIGHT_NETWORK_ID`) at a differently-versioned deployment. Not exploitable against today's single deployed contract; the finding is about what happens the next time this project touches the enum, not about anything live right now.

---

## Discarded (non-issues) vectors

| Vector | Check | Result | Why it's not a finding |
|---|---|---|---|
| `MIDNIGHT_WALLET_MNEMONIC`/`MIDNIGHT_STORAGE_PASSWORD` reachable from the new Vercel-deployable frontend | `grep -rn "process\.env\.\|NEXT_PUBLIC_\|MIDNIGHT_WALLET\|MIDNIGHT_STORAGE" frontend/src/` | Zero matches — the only env var the frontend reads at all is `VELO_REPO_ROOT` | The frontend build/runtime has no code path that touches wallet secrets; deploy-side (`deploy/`) and read-side (`frontend/`) stay as separated as Round 4 assumed |
| Real/PII case data baked into the new static `/api/cases` build | `grep -lriE` for email/DNI/phone-shaped patterns across `cases/*.json`; filenames are narrative-themed (`VELO-001-peon-confesion.json`, etc.) | Clean | Corpus is synthetic per the project rule and per the existing `corpus.ts` comment referencing a prior drift finding (F5) already fixed |
| Server-only `velo` package code leaking into the client JS bundle via the new webpack config | Read `frontend/next.config.mjs` in full | The `externals` push only runs `if (isServer)`; comment states, correctly, that all `velo` imports are server-side (API routes) | No client-side reference to `velo` exists in `frontend/src/` to bundle in the first place |
| A live public Vercel URL already exposing something today | `find . -iname .vercel`; grepped docs for a `vercel.app` URL | No `.vercel/project.json`, no deployed URL referenced anywhere | `fcc3710` made the frontend deployable; it has not actually been deployed to Vercel yet as of this audit |

## Recommendations (out of scope of this audit act — record only, matching every prior round's convention)

- Before the first real Vercel deploy: confirm the deployed environment does **not** set `MIDNIGHT_WALLET_MNEMONIC`/`MIDNIGHT_STORAGE_PASSWORD` at all (they belong only on whatever machine runs `deploy/deploy-contract.ts`, never on the frontend's hosting environment) — this round found no code path that would use them there, but an operator setting them anyway in the Vercel dashboard "just in case" would sit unused but exposed to anyone with project access.
- If a second Compact enum value is ever added, update `VERDICT_BY_INDEX` in the same commit and add the new index to the exhaustive `verdictFromIndex` test — the drift this round guards against is silent, not the addition itself.

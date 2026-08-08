# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Docs re-aligned to the Cloud Run reality.** The app is live on Google
  Cloud Run (ADR-007); the Vercel path was abandoned after the `@vercel/next`
  builder failed reproducibly on its side. `PRD_MVP.md` (Cloud Run hosting +
  phase statuses), `ADRS_001_006.md` (ADR-001/005 supersession status + DB
  adapter decision), `ROADMAP.md` (current phase map + deferred red-team
  hardening), README/README.es ("Deploying to Vercel" → "Deploying (Google
  Cloud Run)"), and `ARCHITECTURE.md` layer 4 (EN+ES) all now describe what
  actually runs. Test counts synced to the runners (58 engine + 47 frontend).

### Fixed

- **Red team F24 (code half).** The placeholder-commitment seam's return type
  no longer carries the salt: `computeCommitment` generates it internally and
  returns only `{ fingerprint, commitment, covers }`. Pinned by three new
  tests (`frontend/src/lib/contract.test.ts`); the seam is retired entirely
  in MVP Phase 4.

### Added

- **MVP Phase 4 — attestation linkage + verification panel (AC-J3.*, AC-J4.*).**
  - `POST /api/attestations` (frontend): the local CLI links an on-chain
    attestation to a persisted sealed case. Authenticated by the expert API
    key (only its SHA-256 hash stored, ADR-006); the route additionally
    verifies the bundle belongs to that expert. The link is the
    expert-REPORTED side of the trust model; on-chain facts stay independently
    readable (ADR-003).
  - `GET /api/verification` + public `/verify` page: query by sealed-case id
    or commitment. Internal consistency + custody are recomputed (never
    trusted); the on-chain state is read from the deployed contract and shown
    with strictly separate labels — **chain-verified** vs **expert-reported**
    — and degrades to "unavailable" when the indexer is unreachable, never to
    a false "not attested" (AC-J4.3). Nav link (EN/ES).
  - CLI (`deploy/attest-case.ts`): after a successful on-chain attestation,
    optionally posts `{bundleHash, txHash, commitment}` to a deployed app when
    `VELO_API_URL` + `VELO_API_KEY` are set. The commitment is identified by
    diffing the ledger before/after (Compact's `persistentHash` is
    circuit-internal and cannot be recomputed in TypeScript). Strictly
    best-effort: a web failure never fails the attestation. New
    `src/chain/post-attestation.ts` with 7 node:test cases (env gating, exact
    payload + bearer header, soft failures on refusal/network error, ledger
    diffing).
- **Red team round 6.** `docs/RED_TEAM_ROUND_6.md` audits the surfaces rounds
  1–5 never covered: the attestation/deploy tooling, the witness module, the
  frontend beyond the F14 routes, and the coverage-gap engine change. One
  Medium finding confirmed by induction (F20: case-variant provenance roots
  defeat source deduplication and can carry a verdict over the Daubert gate,
  reproducible with `scripts/verify-r6-provenance-normalization.mjs`) plus
  five low-severity hardening/drift items (F21–F25).
- **MVP definition.** The deployed-app PRD with numbered acceptance criteria
  (`docs/PRD_MVP.md`), six architecture decision records for the Vercel/Neon
  MVP — hosting, static corpus, local attestation with web reads, wallet
  identity without passwords, monorepo deploy config, expert API keys for the
  CLI (`docs/ADRS_001_006.md`) — and a root-package TDD workflow extending
  mandatory TDD beyond the frontend (`docs/ROOT_TDD.md`). README and frontend
  README aligned with the current state (retired loopback UI, deployed
  contract, 14 cases, 58 root tests).
- **Deployment.** The frontend is deployable to Vercel: corpus routes served
  statically at build time (pinned by tests), monorepo build order and
  explicit Vercel install/build commands (`frontend/vercel.json`), file
  tracing for the runtime-loaded chain artifacts, a CI build workflow, and
  hosting wording in ARCHITECTURE/README (both languages). Attestation writes
  stay local by design.

### Fixed

- **Request-body size cap (red team F22).** `POST /api/seal`, `/api/verify`,
  `/api/attest`, and `/api/auth/session` now read their bodies through
  `readJsonBody`, which enforces a 256 KB cap while streaming (both the
  declared `Content-Length` and the actual bytes received) and turns
  malformed JSON into a 400 instead of a crash.
- **Navbar disconnect button accessible name.** The icon-only disconnect
  button now has an `aria-label` (and `title`) so it is reachable by screen
  readers and by the mobile e2e project at every viewport.
- **Chain state decoding fails closed (red team F25).** `hexToBytes` in
  `src/chain/read.ts` decoded the indexer's contract-state blob with
  `hex.match(/../g)` + `Number.parseInt`, which turned a non-hex pair into
  `NaN` — coerced by `Uint8Array.from` to `0x00` — and silently dropped an odd
  trailing nibble. The reader could therefore return a *ledger object* built
  from bytes the chain never sent, which reads as "no attestations" rather
  than as a read failure. The decoder now validates
  `/^([0-9a-fA-F]{2})+$/` before decoding and raises `ChainReadError`
  otherwise, matching the strictness `hexToBytes32` has always applied to the
  same values on the write path. This is the read-path half of the
  silent-default defect round 5 fixed on the verdict-index half (F19).
  Reproducible with `scripts/verify-f25-hex-decode-strictness.mjs`, which
  runs the old and new decoders side by side; pinned by two tests in
  `tests/chain.test.ts`, one of them the control that valid captured state
  still decodes.
- **Chain reads in production builds.** `GET /api/chain` worked under
  `next dev` but failed once bundled: webpack rewrote the runtime dynamic
  import of the contract bindings into its chunk loader ("Cannot find module
  'file:///…'"), and with the bindings loaded natively but `velo` bundled, a
  second copy of the Midnight WASM runtime broke class checks ("expected
  instance of ChargedState"). The bindings import now carries
  `/* webpackIgnore: true */` and the frontend externalizes every `velo/*`
  server import, so the whole runtime loads as one native copy. Verified
  against the real preview ledger (`next start` + curl); requires Node ≥
  20.19 (require(esm)).
- **Absence of evidence.** The engine distinguishes "nothing was found" from
  "the source that would have settled it was never available". An analyst can
  declare `coverageGaps`; a declared gap degrades a **negative** finding to
  ABSTAIN and names what was missing. It never weakens a positive one — an
  unrelated log rotating does not erase evidence of what is there. Gaps are
  sealed into the analysis fingerprint, so stripping them to promote ABSTAIN
  back to NOISE fails verification.
- **Corpus.** `VELO-014`, the controlled twin of `VELO-010` — identical clean
  artifacts, identical `0/1` score, no detector firing in either, and a
  different verdict for exactly one reason.
- **UI.** The case view shows what was *not* examined alongside the verdict,
  and now surfaces the engine's own `reasoning`, which was previously computed,
  sealed into the bundle, and then discarded before it reached the screen.

## [0.1.0] - 2026-08-07

Initial project state — the full initial-development milestone from Midnight
Hack Buenos Aires (7–8 August 2026). This release covers every commit from the
first one to the current HEAD; nothing has been released or tagged prior to
this point, so the entire history is grouped under the initial `0.1.0`.

### Added

- **Engine.** Deterministic forensic attestation engine with the Daubert
  corroboration gate — five detectors, exact rational arithmetic, no floats on
  the decision path.
- **Sealing.** Local sealing: canonicalization, hash-chained custody, sealed
  bundles, and a standalone offline verifier (`dist/src/seal/verify.js`).
- **MCP.** MCP server exposing the engine as wallet-style tools
  (`list_my_cases`, `get_case`, `seal_case`, `verify_commitment`,
  `attest_case`).
- **Contract.** Compact zero-knowledge contract (`contracts/velo.compact`)
  with prover and verifier keys, compiling on AVX2 hardware;
  `scripts/compile-contract.sh` for one-command builds.
- **Witnesses.** Circuit witnesses (TypeScript side) bound to the generated
  bindings.
- **Web.** Loopback-only HTTP server (`npm run web`) and Next.js frontend
  sharing `src/core/operations.ts`.
- **Simulation.** `src/simulate.ts` end-to-end demo showing both refusal
  moments (insufficient corroboration and missing custody).
- **Deploy.** Contract deploy tooling for the preview network.
- **Frontend tests.** Vitest + Playwright scripts and dependencies, plus a
  TDD workflow document.
- **Corpus.** Synthetic case corpus (13 cases, zero PII) and 6 synthetic
  expert-witness profiles.
- **Documentation.** Bilingual documentation set — architecture, glossary,
  cases, FAQ, roadmap, red team reports, business case and identity/credential
  design decisions; pitch decks with extracted backgrounds.
- **Conventions.** Development conventions: Husky `commit-msg` hook running
  commitlint, `CHANGELOG.md`, `CONTRIBUTING.md`, `AGENTS.md`.

### Changed

- Cases/peritos corpus translated to English; engine drift fixed (finding F5).
- README rewritten with an architecture diagram; docs aligned with the F3
  commitment change.
- Glossary rewritten for readers without forensics/law/crypto backgrounds.
- Corpus and orchestration single-sourced across the MCP server, HTTP server,
  and CLI.
- FAQ decks aligned with the pitch's framing and credential scope.

### Removed

- Redundant loopback HTTP server superseded by shared operations; shared
  `caseId` validator.
- `frontend/lib` — orphaned duplicate pointing at the wrong network.
- Internal-only files excluded from the submission (`PROGRESS_LOCAL.md`,
  `GUION_VIDEO.md`).

### Fixed

- Red team round 1: 12 of 13 findings fixed, verified against the live code.
- Red team round 2: promise-vs-guarantee audit against README/ARCHITECTURE
  claims.
- Vacuous constraint in the circuit: verdict and corroboration count now bound
  into the commitment.
- `corroborationCountWitness` bigint mismatch against the compiled circuit.
- Stale contract-compilation claims in `RED_TEAM_ROUND_1.md`.
- Pitch deck overclaims: the ZK credential is designed, not delivered.
- Custody-chain truncation detection gap documented and tested.
- Witnesses wired to the real generated bindings.

### Security

- Loopback server binds to `127.0.0.1` only, by design — a machine holding a
  victim's evidence must not open a port to its network.
- Red team round 3: CSRF on the loopback/frontend seal-adjacent routes
  (finding F14) fixed.

[Unreleased]: https://github.com/annatchijova/velo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/annatchijova/velo/releases/tag/v0.1.0

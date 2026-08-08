# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Deployment.** The frontend is deployable to Vercel: corpus routes served
  statically at build time (pinned by tests), monorepo build order and
  explicit Vercel install/build commands (`frontend/vercel.json`), file
  tracing for the runtime-loaded chain artifacts, a CI build workflow, and
  hosting wording in ARCHITECTURE/README (both languages). Attestation writes
  stay local by design.

### Fixed

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

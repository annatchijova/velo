# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

Version sections below are maintained automatically by
[release-please](https://github.com/googleapis/release-please) from
Conventional Commits; the open release pull request is the staging area for
unreleased changes.

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
- **Web.** Next.js frontend, calling the same `src/core/operations.ts` as the
  MCP server so no interface carries its own copy of the rules.
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

Built and withdrawn before this release, so none of it ever shipped. Recorded
because the reasons are the load-bearing part: each was a second copy of logic
that already existed somewhere else, and duplication is how a verdict quietly
diverges between two interfaces.

- Standalone loopback HTTP server — its orchestration was a second copy of the
  MCP server's, so it was folded into `src/core/operations.ts`. Nothing in this
  release starts a server of its own.
- Duplicate `caseId` validator, superseded by the shared one.
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

- Red team round 3: CSRF on the frontend's seal-adjacent routes (finding F14)
  fixed.

[0.1.0]: https://github.com/annatchijova/velo/releases/tag/v0.1.0

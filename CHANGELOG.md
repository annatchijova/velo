# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **VIGIA port, phases 1-3** (`docs/PORT-FROM-VIGIA.md`). Deterministic
  forensic capabilities ported from the VIGIA Python engine into the sealed
  decision path, parity-tested against live runs of the Python originals:
  - Eco overinterpretation filter (`src/engine/eco.ts`): the verbatim
    50-term obvious-bait vocabulary, word-boundary search, and the integer
    predicate `2*hits > n`. Wired as the set-level `scene_staging` detector
    (fracture `POSSIBLE_SCENE_STAGING`, weight 1/4, deliberately
    contributing no corroborating sources — prose vocabulary must not
    inflate the Daubert independent-source count) and as scorer gate D1 (a
    bait-laden devil's advocate is recorded in the sealed reasoning as a
    signal, not a refutation).
  - caie fracture predicates: new markers `vsc_deleted` /
    `firewall_disabled` (fracture `DEFENSE_EVASION_ARTIFACT`, Rule 13) and
    `process_injection` / `pid_hidden` (`PROCESS_INJECTION_ANTIFORENSIC`,
    Rule 14); the R3-1 timestamp plausibility window (epoch/FILETIME
    sentinels and post-2038 dates raise `TIMESTAMP_OUT_OF_RANGE`, fail
    closed, and never enter the causality comparison); the Timestomp
    sub-second signature (`TIMESTAMP_PRECISION_ANOMALY`, >= 5 trailing
    zeros, Rule 9).
  - vigia_scorer B-151a: a score built on fewer than two contributing
    artifacts is capped at 65/100, with an auditable trace in the sealed
    reasoning. Verdict-neutral (the Daubert gate already blocks
    single-source MALICE).
  - Abductive intent engine (`src/inference/abductive.ts`), inform-only:
    Peirce hypothesis ranking by integer Ockham cost and coverage, 32
    templates across 12 IR phases extracted mechanically from the live
    Python, result hashes byte-identical to the Python engine. A
    regression test enforces that no decision-path module imports it.
  - Not ported, deliberately: canonicalize/custody (already at parity),
    B-068 three-branch corroboration (needs spoofability/domain taxonomy
    VELO lacks), hard-MALICE B-172 (would bypass the corroboration gate),
    the UNKNOWN verdict band (fixed scale), Grice/stylometry/entropy/
    likelihood-ratio floats (non-sealable, narrative-layer only),
    trust-fusion decay (deferred until cases carry evidence age).
- **Agent skills.** `.claude/skills/abductive-engineering` and
  `.claude/skills/red-team-auditing` now ship with the repository, and
  `AGENTS.md` documents how they bind for any agent working here.
- **LLM narrative layer with swappable backends** (`src/narrative/`). A
  narrator puts an ALREADY-SEALED case into prose: `narrate()` only accepts
  a `SealedBundle`, so the type system enforces that the model runs after
  the seal; it receives a compressed read-only summary whose prompt states
  every figure is fixed, and its prose is stored beside the seal with a
  deterministic consistency flag (a narration contradicting the sealed
  verdict is flagged for review, never corrected — the seal wins). Two
  interchangeable backends: Ollama (local, `VELO_NARRATOR=ollama`) and the
  Anthropic API via the official SDK (`VELO_NARRATOR=anthropic`, default
  model claude-opus-4-8). The swap test pins the doctrine: changing
  backends changes wording only, never a verdict or hash. No narrator
  configured or a narrator failure degrades the feature honestly — the
  sealed analysis is complete without prose. Exposed through
  `narrateCase` in the shared operations backend and the `narrate_case`
  MCP tool; a regression test asserts no engine/seal/inference module
  imports the narrative layer.
- **Per-artifact effective-trust audit** (`src/engine/trust_fusion.ts`),
  completing item 5 of the VIGIA port with its recon premise corrected: the
  live Python decays trust by temporal-violation severity, not by evidence
  age, and only its lookup tables are sealable. VELO ports the
  Fraction-exact tables from the canonical scorer (bucketed exp(-2x),
  provenance-chain depth factor 0.95^k, empty chain 1/10) and reports
  effectiveTrust per artifact in `AnalysisResult.artifactTrust` — exact
  Fraction strings, beside the verdict, never an input to it. VIGIA's
  trust-gated verdict caps were deliberately not adopted: one is
  unreachable without an external prior-trust input, and the other
  counterbalances a hard-MALICE gate VELO does not have.
- **Evidence Merkle tree with selective disclosure** (`src/seal/merkle.ts`).
  Sealed bundles now carry `evidenceRoot`, a domain-separated SHA-256 Merkle
  root (RFC 6962-style prefixes; odd nodes promoted, never duplicated — the
  CVE-2012-2459 guard) over the canonical bytes of each artifact.
  `artifactInclusionProof` / `verifyArtifactInclusion` let a prover disclose
  ONE artifact plus an O(log n) proof against the root without revealing the
  rest of the evidence set. Verification accumulates the complete damage map
  instead of stopping at the first error, and states what a passing proof
  does and does not establish (patterns adopted from continuum's
  `legacy/core/hash_chain.py` and its KL-008b/KL-009 postmortems). The root
  is derived and recomputed by both verifiers — the library one and the
  standalone judge's tool, pinned to each other by test — and bundles sealed
  before the field existed verify with a caveat, not a failure.

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
  contract, 14 cases, 53 root tests).
- **Deployment.** The frontend is deployable to Vercel: corpus routes served
  statically at build time (pinned by tests), monorepo build order and
  explicit Vercel install/build commands (`frontend/vercel.json`), file
  tracing for the runtime-loaded chain artifacts, a CI build workflow, and
  hosting wording in ARCHITECTURE/README (both languages). Attestation writes
  stay local by design.

### Fixed

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Development conventions adopted across the repository:
  - [Husky](https://typicode.github.io/husky/) `commit-msg` hook running
    `commitlint` to enforce [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
  - `commitlint` configuration extending `@commitlint/config-conventional`.
  - This `CHANGELOG.md`, following the Keep a Changelog 1.1.0 format.
  - `CONTRIBUTING.md` documenting the commit, versioning, and changelog rules.
- `prepare` script (`husky`) so the git hooks are installed on `npm install`.

## [0.1.0] - 2026-08-08

Initial project state after Midnight Hack Buenos Aires (7–8 August 2026).

### Added

- Deterministic forensic attestation engine with the Daubert corroboration gate.
- Local sealing, hash-chained custody, and a standalone offline verifier.
- MCP server exposing the engine as wallet-style tools.
- Compact contract (`contracts/velo.compact`) that compiles to real proving keys.
- Loopback-only HTTP server and Next.js frontend.
- Documentation set (architecture, glossary, cases, FAQ, roadmap, red team reports).

[Unreleased]: https://github.com/Dahgoth/velo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Dahgoth/velo/releases/tag/v0.1.0

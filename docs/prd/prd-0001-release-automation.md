# PRD-0001: Release automation

- Status: Proposed
- Date: 2026-08-07
- ADR: [adr-0001-release-automation-tool](../decisions/adr-0001-release-automation-tool.md)

## Problem

VELO has no release process. The `0.1.0` changelog was written by hand from
the full commit history, the version was never tagged, the `[0.1.0]`
changelog link pointed at a release that did not exist, and the committed
`.releaserc.json` was a dead semantic-release stub (no dependencies, no
workflow). Version bumps per `CONTRIBUTING.md` were manual `npm version`
runs, which conflict with the repository's pull-request-only governance and
cannot be performed safely by the AI agents that drive most development here.

## Requirements

| # | Requirement |
|---|-------------|
| R1 | Derive version bumps from Conventional Commits (`feat:` → MINOR, `fix:` → PATCH, `BREAKING CHANGE:` → MAJOR); commitlint already enforces the convention. |
| R2 | Maintain `CHANGELOG.md` automatically, mapped to Keep a Changelog sections (Added / Changed / Fixed / Removed). |
| R3 | Cutting a release must go through a reviewed pull request (AGENTS.md governance); merging it produces a `vX.Y.Z` tag and a GitHub Release. |
| R4 | No npm publishing — both packages are `private`; the release artifacts are the tag and the GitHub Release. |
| R5 | Keep the root and `frontend/` workspace versions in sync; the root `package.json` stays the single source of truth. |
| R6 | No long-lived credentials; `GITHUB_TOKEN` only. |
| R7 | Deterministic coexistence with frequent AI-agent merges to `main`: no self-trigger loops, no duplicate or zombie release PRs. |
| R8 | Squash-merge friendly: one clean changelog entry per merged PR. |

## Non-goals

- Pre-release channels (alpha/beta/next) for now.
- Independent versioning of the frontend workspace.
- Publishing to any registry.
- Rewriting the hand-authored `0.1.0` changelog entry.

## Success criteria

- A `feat:`/`fix:` merged to `main` produces or updates a release PR with no
  manual intervention.
- Merging the release PR produces the tag and GitHub Release within one
  workflow run.
- Zero duplicate or spurious release PRs across the first five releases.
- Every changelog entry traces back to a merged PR title.

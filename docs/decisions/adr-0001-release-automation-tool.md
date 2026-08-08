# ADR-0001: Release automation tool

- Status: Proposed (accepted when PR #5 merges)
- Date: 2026-08-07
- PRD: [prd-0001-release-automation](../prd/prd-0001-release-automation.md)

## Context

See the PRD. Decision drivers, in order:

1. AGENTS.md pull-request-only governance — version bumps must land via PR,
   never as direct commits to `main`.
2. AI-agent-heavy workflow — frequent merges to `main`; the tool must not
   fight agents over long-lived branches or produce loop/duplicate PRs.
3. Private packages — no npm publishing; tag + GitHub Release are the
   artifacts.
4. Conventional Commits already enforced (commitlint + husky + CI).
5. Keep a Changelog section style for `CHANGELOG.md`.
6. Single version source of truth across root + `frontend/` workspace.

## Options considered

### release-please (chosen)

PR-based: maintains one release PR per pending release; merging it tags and
publishes the GitHub Release.

- ✅ Release is review-gated, matching PR-only governance (R3).
- ✅ Conventional-Commits-driven (R1); changelog section mapping is
  configurable (R2).
- ✅ Manifest mode syncs extra files (`frontend/package.json`) (R5).
- ✅ `GITHUB_TOKEN` suffices (R6); no secrets.
- ✅ Squash-merge friendly: one squash commit per PR = one entry (R8).
- ❌ Known open bugs (see Evidence); needs defensive configuration.
- ❌ Google has deprioritized internal maintenance; community keeps it
  alive (active fork: `release-please-oss`).
- ❌ Release cadence needs someone to merge the release PR.

### semantic-release

Fully autonomous: every push to `main` with releasable commits releases
immediately.

- ✅ Battle-tested core; state is tag-based, not PR-based — fewer moving
  parts to break under bot traffic.
- ❌ No review gate; to get version files back into the repo it must commit
  directly to `main` (`@semantic-release/git`) — violates driver 1.
- ❌ Release-per-push churn; five small fixes = five releases.
- ❌ Changelog format is conventional-changelog, not Keep a Changelog.
- ❌ Monorepo/workspace support is community-plugin territory.
- The pre-existing `.releaserc.json` stub followed this path but was never
  wired up (no deps, no workflow).

### changesets

Explicit changeset files per PR; a bot maintains a "Version Packages" PR.

- ✅ Best-in-class for publishing multi-package npm monorepos.
- ❌ Same long-lived-bot-PR mechanics as release-please, plus a per-PR
  changeset ceremony that agents and contributors will forget.
- ❌ Overkill: nothing is published; there is one product version.

### release-it / commit-and-tag-version (local CLIs)

- ✅ Simple, flexible.
- ❌ Manual trigger, credentials on developer machines, no PR audit trail —
  fails drivers 1 and 2.

## Evidence gathered (2026-08-07)

### Upstream bug status (checked live via GitHub API)

| Item | Status | Relevance to our config |
|------|--------|-------------------------|
| #1205 tagging deadlock (`include-component-in-tag: false`, single-package node) | OPEN | Trigger requires explicit `component: ""` / custom title pattern, which we do **not** set; empirical test below passed |
| #962/#1111 duplicate PR after merge with `draft: true`; fix PR #1206 | OPEN | Avoided — we never use `draft: true` |
| #2773 422 "PR already exists" on PR update; fix PR #2774 | OPEN | Mostly `separate-pull-requests: true`; we use one combined PR |
| Label auto-creation breakage (#1074, Dec 2024–2025) | Fixed on GitHub side | `issues: write` granted + labels pre-created defensively |
| Action v4.4.1 bundles release-please 17.3.0; v5.0.0 bundles 17.6.0; library at 17.10.x | — | Action releases lag the library; community fork `release-please-oss/release-please-action` is active (last push 2026-07) |

### Empirical tests (`Dahgoth/velo-rp-scratch`, identical config, action v4, `GITHUB_TOKEN`)

1. `feat:` push → release PR opened, `autorelease: pending` label applied,
   squash-merged → tag `v0.2.0` + GitHub Release created. **Pass**
2. Root `package.json`, `frontend/package.json` (via `extra-files`) and
   `.release-please-manifest.json` all bumped to 0.2.0. **Pass**
3. Two consecutive pushes updated the single open release PR — no
   duplicates. **Pass**
4. Release PR squash-merged → `v0.3.0` tagged; `feat`/`fix` rendered under
   Added/Fixed. **Pass**
5. Squash semantics: multi-commit PR squash-merged → changelog entry is the
   squash subject (the PR title); internal commits never appear. **Pass**
6. Non-conventional squash subjects are silently dropped (no entry, no
   bump) — this is the classic "changelog lost my commits" failure mode.
   Mitigated by the `PR title` workflow. **Mitigated**
7. Gotcha surfaced: repository setting "Allow GitHub Actions to create and
   approve pull requests" must be enabled, else the action fails at PR
   creation (verified by reproducing the failure). **Checklist item**

## Decision

Adopt **release-please** (`googleapis/release-please-action@v4`, manifest
config) with hardening:

- `GITHUB_TOKEN` only — GitHub suppresses self-triggering from its own
  pushes, which eliminates the infinite-loop class; trade-off: release PRs
  do not trigger `pull_request` workflows (acceptable — the release commit
  message conforms to commitlint rules anyway).
- No `draft: true`, no `separate-pull-requests`, no explicit `component` or
  title-pattern overrides (each maps to an open upstream bug).
- `autorelease:*` labels pre-created in the repository.
- Conventional PR titles enforced by the `PR title` workflow, because
  squash-merge subjects (derived from PR titles for multi-commit PRs) are
  what release-please sees on `main`.
- Repo setting verified: "Allow GitHub Actions to create and approve pull
  requests".

## Consequences

- Releases stay review-gated and agent-safe; no new secrets.
- Someone must merge the release PR (deliberate; it is the release
  decision).
- Changelog entries derive from commit types, not prose; hand-written
  entries remain possible by editing the release PR before merge.
- We depend on a tool with reduced corporate backing; the active community
  fork is the designated lifeboat.

## Reconsider when

- A real release deadlocks ("untagged, merged release PRs outstanding"
  aborts) — fallback options: `release-please-oss` fork, semantic-release
  with a branch-protection exception for its release commits, or release-it
  driven manually.
- Upstream action stops tracking library releases for two consecutive
  quarters.
- The project starts publishing packages or needs pre-release channels.

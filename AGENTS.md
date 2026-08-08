# AGENTS.md

Guidance for AI agents contributing to the VELO repository. This file
complements [`CONTRIBUTING.md`](./CONTRIBUTING.md), which is the human-readable
source of truth for the same conventions.

## Pull request requirement

**All changes to this repository must be submitted via pull requests.**
Never commit directly to `main` (or to any shared long-lived branch). The
workflow for every change is: branch → commit → push → pull request → review →
merge.

Formal branch protection rules will be enforced in the future to uphold this
requirement (blocking direct pushes and requiring PR review before merge), even
though those protections are not yet active on the repository. Agents must
behave as if the protections are already in place: always work on a dedicated
feature branch and never push straight to `main`.

## Setup

Run once after cloning, before doing any work:

```bash
npm install
```

The `prepare` script (`husky`) installs the git hooks on install. The hooks
live in `.husky/` and require no further configuration.

## Husky pre-commit checks

Husky runs local git hooks. The active hook in this repository is:

- **`commit-msg`** — runs `npx --no-install commitlint --edit "$1"` and rejects
  any commit message that does not conform to Conventional Commits.

There is currently no `pre-commit` or `pre-push` hook. To add one (for example,
a pre-commit check that runs `npm run build` before committing), create the hook
file with an executable bit:

```bash
touch .husky/pre-commit
chmod +x .husky/pre-commit
```

A `pre-commit` hook should be a shell script that exits non-zero on failure, for
example:

```sh
npm run build
```

After creating or editing a hook, verify it is picked up:

```bash
npm run prepare   # re-installs hooks from .husky/
```

To bypass a hook in an emergency, `git commit --no-verify` works, but should be
used rarely and only with explicit justification.

## Commit message format

Every commit must follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Allowed types and when to use them:

| Type       | When |
|------------|------|
| `feat`     | New feature (bumps MINOR under SemVer) |
| `fix`      | Bug fix (bumps PATCH) |
| `docs`     | Documentation only |
| `style`    | Formatting, no logic change |
| `refactor` | Change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement |
| `test`     | Adding or updating tests |
| `build`    | Build system, dependencies, or tooling |
| `ci`       | CI configuration |
| `chore`    | Other repository maintenance |
| `revert`   | Reverting a previous commit |

Rules enforced by the `commit-msg` hook:

- The subject line must not be empty.
- The subject must start with a type, optionally followed by a scope in
  parentheses (e.g. `fix(witness): ...`).
- A scope is encouraged when the change is localized to a module.
- The subject line is a concise imperative, e.g. `fix(engine): bound score
  clamping before the Daubert gate`.

A multi-line example:

```
feat(frontend): add vitest unit test runner

- Add vitest + jsdom to devDependencies
- Add npm scripts for test and test:watch
```

If the hook rejects a message, fix the message and commit again — do not bypass
the hook without strong reason.

## Release automation

Releases are automated by
[release-please](https://github.com/googleapis/release-please) via the
`release-please` GitHub Actions workflow (`.github/workflows/release-please.yml`):

1. On every push to `main`, release-please analyzes the Conventional Commits
   since the last release.
2. If there are releasable commits it opens (or updates) a release pull
   request titled `chore(main): release X.Y.Z` containing the version bumps
   (root and frontend `package.json`), the `CHANGELOG.md` entries, and the
   updated `.release-please-manifest.json`.
3. Merging the release pull request tags `vX.Y.Z` and publishes a GitHub
   Release.

Rules for agents:

- Never run `npm version` or hand-edit the `version` fields; release-please
  owns version bumps.
- Never commit to a release pull request unless fixing a problem in it; the PR
  is regenerated from commit history.
- `feat:` bumps MINOR, `fix:` bumps PATCH, and a `BREAKING CHANGE:` footer (or
  `!` after the type) bumps MAJOR.
- The packages are `private`, so nothing is published to npm; the release
  artifacts are the git tag and the GitHub Release.
- Merges to `main` are squash merges and release-please reads only what is on
  `main`: a PR's squash subject (the **PR title** for multi-commit PRs)
  becomes its changelog entry. Title every PR as a Conventional Commit; the
  `PR title` workflow enforces this.
- Configuration lives in `release-please-config.json` (changelog section
  mapping follows Keep a Changelog) and `.release-please-manifest.json`
  (current versions).

## PRDs and ADRs

Significant decisions require written artifacts **before** implementation:

- A **PRD** in `docs/prd/prd-NNNN-short-name.md` — problem, requirements,
  scope, and non-goals.
- An **ADR** in `docs/decisions/adr-NNNN-short-name.md` — options considered,
  evidence, trade-offs, decision, and consequences.

Significant decisions include, at least: adopting or replacing a tool,
framework, or external service; architecture or data-model changes;
CI/release-infrastructure changes; and anything that spans modules or
constrains future work.

Rules for agents:

- The PRD and ADR ship in the same pull request as the implementation; the
  ADR status is `Proposed` until that PR merges (merging is the acceptance).
- A decision that overrides an earlier ADR gets a new numbered ADR that
  references and supersedes the old one; never rewrite the old ADR.
- Empirical claims in an ADR (tool behavior, bug status) must record how they
  were verified. ADR-0001 and PRD-0001 (release automation) are the
  reference examples.

## Pull request process

1. **Branch.** Create a dedicated branch off the latest `main`:
   ```bash
   git fetch origin && git checkout -b <type>/<short-description> origin/main
   ```
   Prefer a name that mirrors the work, e.g. `feat/frontend-tdd-tooling` or
   `fix/witness-bigint`.

2. **Commit.** Stage and commit with a Conventional Commit message (see above).
   Keep commits focused; prefer several small conventional commits over one
   large one.

3. **Push.** Push the branch and set its upstream:
   ```bash
   git push -u origin <branch-name>
   ```

4. **Pull request.** Open a PR from the branch into `main`:
   ```bash
   gh pr create --base main --head <branch-name> --title "<summary>" --body "<description>"
   ```
   The PR title should be a concise summary (Conventional Commit style). The PR
   body should describe what changed and why, and include any relevant links.

5. **Review.** Address review feedback in additional commits on the same branch
   (do not rewrite history while the PR is under review unless asked). Pushing
   new commits updates the PR automatically.

6. **Merge.** Merge through the GitHub UI or `gh pr merge` once the PR passes
   review. Prefer squash merging so the PR lands on `main` as one clean commit.
   After merging, delete the feature branch and pull `main`:
   ```bash
   git branch -d <branch-name>
   git checkout main && git pull origin main
   ```

## Standards summary

- **Semantic Versioning 2.0.0** — `package.json` version is the single source
  of truth; versions are bumped automatically by release-please at release
  time.
- **Keep a Changelog 1.1.0** — notable changes are recorded in
  [`CHANGELOG.md`](./CHANGELOG.md) automatically by release-please, with
  Conventional Commit types mapped to Added / Changed / Fixed / Removed
  sections.
- **Release automation** — release-please maintains a release pull request per
  pending release; merging it tags and publishes a GitHub Release.
- **PRDs and ADRs** — significant decisions (tooling, architecture,
  CI/release infrastructure) ship with a PRD in `docs/prd/` and an ADR in
  `docs/decisions/`, accepted by merging the implementing PR.
- **Pull request requirement** — see the section at the top of this file.

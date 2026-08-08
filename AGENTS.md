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

3. **Rebase onto current `main` — immediately before pushing, not before
   branching.**
   ```bash
   git fetch origin main && git rebase origin/main
   ```
   Step 1 branched off the `main` of that moment. `main` moves while you work,
   and the gap is not measured in days: several agents commit to this
   repository in parallel, sometimes minutes apart. A PR built on a stale base
   silently reverts whatever landed in between — that is not hypothetical here,
   it is why PR #6 had to be closed rather than merged, and it nearly happened
   again to PR #9 on a base that was three commits behind.

   Rebase even when git reports no conflict. A clean textual merge says the
   same lines were not edited twice; it says nothing about whether your change
   still makes sense against what arrived. Read what came in.

   ```bash
   git log --oneline HEAD..origin/main                    # what landed while you worked
   git log --oneline origin/main ^HEAD -- <your files>    # did anyone touch yours?
   ```

   Then confirm the PR is actually clean against `main` before asking anyone to
   look at it — `gh pr view <n> --json mergeable,mergeStateStatus` should read
   `MERGEABLE / CLEAN`, not `UNKNOWN` (which only means GitHub has not finished
   computing it yet — re-run it).

   **Do not read `git diff origin/main..your-branch` as "what merging will
   do".** Two-dot diff compares the two tips, so everything `main` gained that
   your branch never saw shows up as a deletion. It looks exactly like your PR
   is about to revert a teammate's work. Merging does not work that way: it is
   a three-way merge from the common ancestor, and files added on `main` and
   untouched by you survive untouched.

   When the stakes justify certainty, do not reason about it — run it:

   ```bash
   git worktree add -q --detach /tmp/merge-check origin/main
   cd /tmp/merge-check && git merge --no-commit --no-ff origin/<your-branch>
   git diff --cached --stat HEAD      # empty means the PR has become a no-op
   ```

   That also answers a question worth asking before every merge in a repository
   with several agents in it: has someone already pushed your work directly, so
   that the PR now changes nothing? Close it as landed rather than merging an
   empty diff.

   A separate `git worktree` is also the way to rebase or test at all when
   another session has uncommitted edits in the shared checkout — switching
   branches there would demand stashing work that is not yours.

4. **Push.** Push the branch and set its upstream:
   ```bash
   git push -u origin <branch-name>
   ```

5. **Pull request.** Open a PR from the branch into `main`:
   ```bash
   gh pr create --base main --head <branch-name> --title "<summary>" --body "<description>"
   ```
   The PR title should be a concise summary (Conventional Commit style). The PR
   body should describe what changed and why, and include any relevant links.

6. **Review.** Address review feedback in additional commits on the same branch
   (do not rewrite history while the PR is under review unless asked). Pushing
   new commits updates the PR automatically.

7. **Merge.** Merge through the GitHub UI or `gh pr merge` once the PR passes
   review. Prefer squash merging so the PR lands on `main` as one clean commit.
   After merging, delete the feature branch and pull `main`:
   ```bash
   git branch -d <branch-name>
   git checkout main && git pull origin main
   ```

## Standards summary

- **Semantic Versioning 2.0.0** — `package.json` version is the single source of
  truth; bump with `npm version` at release time.
- **Keep a Changelog 1.1.0** — record notable changes in
  [`CHANGELOG.md`](./CHANGELOG.md) (Added / Changed / Deprecated / Removed /
  Fixed / Security), under `[Unreleased]` until a release is cut.
- **Pull request requirement** — see the section at the top of this file.

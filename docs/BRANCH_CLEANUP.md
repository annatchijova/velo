# Branch cleanup — review checklist

**Status:** proposal for the team to decide together, nothing deleted yet.
**As of:** 2026-08-08, against `main` @ `4255a14`.

The hackathon is not over, so no branch has been deleted. This file lists the
stale/superseded branches and *why* each looks discardable, so the call can be
made together (with Dahgoth) rather than unilaterally. Each row says what the
branch did and the specific thing already on `main` that replaces it — verify
before deleting.

## Already merged into `main` (safe to delete their branches once confirmed)

| Branch | What it delivered | Now on `main` as |
|---|---|---|
| `docs/reflect-deployed-contract` | deploy-truth fixes (hero/contract/i18n say "deployed"), red-team totals bumped to 6 rounds / 35 findings, demo assets (decks, GIFs, pitch HTML) | fast-forwarded into `main` (commits `885a351`…`3108716`) |
| `feat/cloud-run-deploy` | the Cloud Run `Dockerfile` + `.dockerignore` (built, deployed live, verified) | cherry-picked as `4255a14` |
| `fix/dev-server-binding` | pins `next dev` to `127.0.0.1` (fixes red-team F23) | merged via **PR #10** (`31f3509`) |

## Recommend discarding — superseded or replaced

| Branch | behind/ahead | What it was | Why discard |
|---|---|---|---|
| `fix/ui-overclaims-and-i18n` | 49 / 1 | early hero-copy + i18n pass | **Do NOT merge.** 49 commits behind; merging would *revert* the Spanish translations and the deploy-truth wording already on `main`. Actively harmful. |
| `fix/provenance-normalization` | 10 / 1 | case-fold provenance roots in the corroboration count (red-team F20) | F20 already fixed on `main` via **PR #17** (`8ebadba`, with tests + `scripts/verify-r6-provenance-normalization.mjs`). This is an earlier take on the same fix. |
| `feat/gcp-cloud-run-deploy` | 45 / 1 | first Cloud Run attempt (`frontend/Dockerfile`, excluded `contracts/managed`) | Superseded by `feat/cloud-run-deploy`'s corrected Dockerfile (now on `main`). The old one would break `/api/chain` (missing contract artifacts). |
| `feat/coverage-gaps-frontend` | 31 / 2 | add VELO-014, pin the gap comparison vs VELO-010 | VELO-014 and the coverage-gap work are already on `main` (14 cases, `tests/pipeline.test.ts`). |
| `docs/readme-live-and-pages` | 11 / 2 | README: live-demo link, walkthrough GIFs, "6 red team rounds not 4" | Superseded by **PR #18** (`d9bbf70`); `main`'s README already shows the live demo, the GIFs, and "6 rounds — RT1–RT6". |
| `build/release-automation` | 37 / 4 | first release-please attempt | Superseded by the newer release-please work in PR #12 (see below). |
| `fix/commitlint-length-and-changelog` | 26 / 1 | commitlint rule repairs | Part of the release cluster; folded into / superseded by PR #12. |

## Team decision needed — not a discard

| Item | State | Note |
|---|---|---|
| **PR #12** `build/release-and-commit-rules` | OPEN, 26 behind | Adopts release-please + repairs commit rules. It is real, working infra — but it changes the commit/release workflow and is well behind `main`. **Recommendation: defer to after the hackathon.** It adds nothing to the demo/recording and merging release automation under deadline pressure is avoidable risk. Rebase onto `main` and merge post-event if the team wants it. |

## Suggested action tomorrow

1. Confirm the three "already merged" branches are truly redundant, then delete them.
2. Skim the "recommend discarding" seven, delete the ones the team agrees on
   (`fix/ui-overclaims-and-i18n` especially should go — it is a revert trap).
3. Decide PR #12 together: defer (recommended) or rebase + merge post-hackathon.

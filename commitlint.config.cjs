/**
 * Conventional Commits enforcement.
 *
 * Overrides are kept to a minimum on purpose. Every rule below that
 * merely restates an inherited default is a rule that can silently drift
 * from @commitlint/config-conventional when that package updates — and a
 * broken override is worse than no override, because it reads as strict
 * while doing nothing. Three of the previous overrides were exactly that;
 * see the notes on each.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // header-max-length is NOT overridden. It was pinned to 72, which
    // rejected 6 of this repository's own 12 most recent commits (73 to
    // 94 characters) — a convention the project itself cannot follow is
    // not a convention. The inherited default of 100 fits the commit
    // style actually in use.
    //
    // subject-max-length is NOT set. At 72 it was unreachable: the
    // subject is a substring of the header, so a 72-character subject
    // makes a 78-character header and header-max-length always fired
    // first. Verified — one length rule, not two.

    // Was `[2, "never"]` with no case list, which silently disabled the
    // inherited rule instead of tightening it: "feat(x): Capitalized
    // subject here" passed. Restored with the list, at warning level so
    // it guides without blocking work in progress. Raise to 2 once the
    // history is consistently lower-case.
    "subject-case": [1, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],

    // Project-specific, not restatements of the defaults.
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert"
      ]
    ],
    "scope-empty": [1, "never"],
    "scope-case": [2, "always", "lower-case"],
    "scope-max-length": [2, "always", 24]
  },
  ignores: [
    (commit) =>
      /^(deps|ci|release|chore\(release\)):/i.test(commit) ||
      /^(Bump|Merge)\s/.test(commit)
  ]
};

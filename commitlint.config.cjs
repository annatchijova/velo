module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "subject-max-length": [2, "always", 72],
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

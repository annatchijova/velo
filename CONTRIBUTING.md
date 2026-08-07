# Contributing

This repository follows a small, explicit set of engineering conventions. They
are enforced automatically where possible so that reviews stay focused on
substance rather than formatting.

## Conventional Commits

Every commit message must follow
[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Common `type` values used here:

| Type       | When |
|------------|------|
| `feat`     | A new feature (bumps **MINOR** under SemVer) |
| `fix`      | A bug fix (bumps **PATCH**) |
| `docs`     | Documentation only |
| `style`    | Formatting, no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement |
| `test`     | Adding or updating tests |
| `build`    | Build system, dependencies, or tooling |
| `ci`       | CI configuration |
| `chore`    | Other repository maintenance (e.g. adopting conventions) |
| `revert`   | Reverting a previous commit |

A `scope` (e.g. `fix(witness):`) is encouraged when the change is localized to
a module.

The message is validated automatically: a Husky `commit-msg` hook runs
[`commitlint`](https://commitlint.js.org/) with
`@commitlint/config-conventional`, and a non-conforming message is rejected
before it is recorded.

## Semantic Versioning

The package version follows
[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html):

- **MAJOR** — incompatible API changes.
- **MINOR** — backwards-compatible features.
- **PATCH** — backwards-compatible bug fixes.

The project is currently in the `0.y.z` initial-development phase, where the
public API is not yet considered stable. Bump the version with the standard npm
command so the tag and `package.json` stay in sync, for example:

```bash
npm version patch   # 0.1.0 -> 0.1.1
npm version minor   # 0.1.0 -> 0.2.0
npm version major   # 0.1.0 -> 1.0.0
```

The root `package.json` is the single source of truth for the version; the
frontend workspace consumes it via `"velo": "file:.."`.

## Keep a Changelog

Notable changes are recorded in [`CHANGELOG.md`](./CHANGELOG.md) following the
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format:

- Group entries under **Added**, **Changed**, **Deprecated**, **Removed**,
  **Fixed**, and **Security**.
- Keep an `[Unreleased]` section at the top for work in progress.
- Move entries into a dated version section when you cut a release, and add the
  compare/release links at the bottom of the file.

## Local setup

After cloning, install dependencies so Husky installs its hooks:

```bash
npm install
```

There is nothing else to configure; the `commit-msg` hook is activated by the
`prepare` script during install.

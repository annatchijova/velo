# Security Audit — VELO v0.1.0
## Red Team — Round 4 (`deploy/`, contract deployment tooling)

**Date:** 2026-08-07 · **Method:** Abductive Engineering (A–D–I) + Red-Team Auditing
**Scope:** `deploy/deploy-contract.ts`, `deploy/network-config.ts`, and the exact pinned third-party dependency they call, `@effectstream/midnight-contracts@0.103.2` (`package.json`). This surface landed in the repo the same session as this audit and had not been reviewed before now.
**Relationship to prior rounds:** Rounds 1 and 3 were code-level sweeps of VELO's own engine/MCP/web surfaces. Round 2 audited documentation claims. This round is the first to touch code whose job is to hold and spend real value (a funded wallet) rather than analyze evidence — different stakes, different failure mode (secret exposure, not just a wrong verdict).
**Base:** `main` @ `a500029`. Read against the exact pinned version in `package.json` (`0.103.2`) — downloaded the real published tarball from the npm registry rather than trusting the package name/description, since the dependency isn't installed locally (Bun-only, not `npm install`ed in this environment).
**Reproducible evidence:** every claim below cites an exact file and line, in either this repo or the downloaded `0.103.2` tarball. Nothing here required running the deploy script (no funded wallet available to test against) — levels are marked accordingly.

---

## Threat model

- **Attacker CAN:** read anything committed to this public GitHub repo (including full history). Observe terminal output during a live demo, screen share, or any captured log (CI, a pasted terminal snippet, a recording). Read the local filesystem if they already have another foothold on the deploying machine.
- **Attacker CANNOT:** read the deploying operator's actual environment variables remotely, without another vulnerability. Intercept network traffic (out of scope here).
- **Trust boundary crossed:** the deploying wallet's private key material (seed) versus anything that should ever be observable outside the process that holds it.

**The judge test:** if asked to prove the wallet used to deploy VELO's contract can't have its funds stolen by anyone who ever saw a terminal during this hackathon, what would you have to assume? Finding A shows the honest answer today is "that nobody looked at the output of the deploy command."

## Epistemic legend

CODE FACT · PLAUSIBLE HYPOTHESIS · CONFIRMED BY INDUCTION · FALSIFIED

---

## Executive summary

| ID | Severity | Level | Module | Finding | Status |
|----|----------|-------|--------|---------|--------|
| F16 | **Critical** | CODE FACT (exact pinned dependency version, not executed live) | `@effectstream/midnight-contracts@0.103.2` (third-party), triggered unconditionally by `deploy/deploy-contract.ts` | The wallet seed used to deploy is printed to stdout in plaintext on every run — `log.info(\`Wallet seed: ${seed}\`)`, no flag to suppress it | **MITIGATED** (stdout/stderr redaction wrapper — the upstream bug itself is not VELO's to fix) |
| F17 | High | CODE FACT | `deploy/network-config.ts:27` | A hardcoded fallback password (`"velo-local-dev-password-16"`), committed to a public repo, protects the local on-disk **signing-key** store when `MIDNIGHT_STORAGE_PASSWORD` isn't set — which is the undocumented default path, since no doc tells an operator to set it | **FIXED** |
| F18 | Low (documentation gap, not a vulnerability by itself) | CODE FACT | `deploy/deploy-contract.ts:7` | Points to a README "Deploying" section that does not exist anywhere in the repo — the one place that could have warned an operator about F16/F17 before they ran the script doesn't exist | **FIXED** |

---

## Findings

### F16 — The deploying wallet's seed is logged in plaintext on every run — MITIGATED

**Severity:** Critical · **Level:** CODE FACT, read directly in the exact pinned dependency version — not executed (no funded wallet available in this environment to run the real deploy against `preview`) · **Bucket:** software vulnerability in a third-party dependency, triggered unconditionally by VELO's own call into it.

- **Surprise:** every other secret-handling path already audited in this project fails closed and stays quiet about sensitive values — `src/witness/witnesses.ts`'s doc comment: "None of these values ever reaches the ledger"; the salt is generated with a CSPRNG and never logged. The deploy tooling breaks that pattern in the most direct way possible: it prints the thing that controls the wallet's funds.
- **Abduction (rivals considered):** (a) the log line is gated behind a debug flag or verbose mode — checked, it is not: `build-wallet.ts`'s `buildWalletAndWaitForFunds` calls `log.info(...)` unconditionally, no `if (verbose)` or log-level gate anywhere in the function. (b) VELO's own `deploy-contract.ts` supplies its own seed handling that bypasses this code path — checked: `deployMidnightContract(config, midnightNetworkConfig)` is called with no `seedOrMnemonic` argument, so `deploy.ts`'s own fallback (`seed = midnightNetworkConfig.walletSeed`) is what actually runs, and that value is exactly what reaches `buildWalletAndWaitForFunds`. (c) the log line is real and unconditional, and VELO's script triggers it every time.
- **Deduction:** if (c), then any successful (or even attempted, since the log happens before the funds-wait step) invocation of `MIDNIGHT_NETWORK_ID=preview bun run deploy/deploy-contract.ts` with `MIDNIGHT_WALLET_SEED` or `MIDNIGHT_WALLET_MNEMONIC` set will print that wallet's full seed to stdout.
- **Causal chain, traced exactly (downloaded and read the real `0.103.2` source, not summarized from memory):**
  ```
  operator sets MIDNIGHT_WALLET_SEED or MIDNIGHT_WALLET_MNEMONIC (required to deploy with real funds)
      ↓
  @effectstream/midnight-contracts/midnight-env.ts (module-level, runs at import time):
      walletSeed = env("MIDNIGHT_WALLET_SEED") | mnemonicToSeed(env("MIDNIGHT_WALLET_MNEMONIC")) | genesisWalletSeed
      exported as midnightNetworkConfig.walletSeed
      ↓
  deploy/network-config.ts re-exports midnightNetworkConfig verbatim — VELO adds no wrapping here
      ↓
  deploy/deploy-contract.ts calls deployMidnightContract(config, midnightNetworkConfig)
      — no seedOrMnemonic argument passed, so the package's own fallback applies
      ↓
  package's deploy.ts:159  seed = midnightNetworkConfig.walletSeed
      ↓
  package's deploy.ts:165  buildWalletAndWaitForFunds(networkUrls, seed, networkId)
      ↓
  package's build-wallet.ts:37  log.info(`Wallet seed: ${seed}`)   <-- plaintext, unconditional, to stdout
  ```
- **Why this matters specifically for this project, this week:** the deploy script is meant to be run live, against `preview` (the hackathon's official network, confirmed in the kickoff talk per this repo's own comments), likely on a shared or screen-shared machine, possibly during prep with people watching. A wallet seed is not a case ID or a devil's advocate string — it is complete control over whatever funds and identity that wallet has, permanently (a seed cannot be rotated the way a password can).
- **Threat-model precondition:** none beyond "someone can see the terminal output of the deploy command" — screen share, a pasted snippet in chat for debugging, CI logs if this is ever automated, or shoulder-surfing. This is a very low bar compared to every other finding in this project's four rounds.
- **Not yet confirmed by execution:** this environment has no funded wallet to actually run the deploy against `preview` and watch the log line appear — the finding rests on reading the exact pinned dependency's published source, which is a strong basis (CODE FACT, not speculation) but is one level below the CONFIRMED BY INDUCTION standard the rest of this project holds itself to. If reproducing this live is wanted, it needs a disposable/dust-only wallet, never a wallet holding anything of value.
- **A second instance, found while fixing the first:** `deploy-contract.ts`'s own `console.log("Deploying VELO contract with network config:", midnightNetworkConfig)` logs the whole `midnightNetworkConfig` object — which, per `midnight-env.ts`, carries `walletSeed` as a plain field. This one is 100% VELO's own code, not the dependency's, and needed no abduction: reading the object shape was enough.
- **Mitigation applied (not a fix — the root cause lives in a dependency this repo doesn't control):**
  1. The config-object log line now destructures `walletSeed` out and logs `{ ...safeNetworkConfig, walletSeed: "[REDACTED]" }` instead of the raw object. This one *is* a real fix — it's VELO's own call site.
  2. The `deployMidnightContract(...)` call is wrapped in a `process.stdout.write`/`process.stderr.write` interceptor (`redactSeed`, matching `/wallet\s*seed:?\s*\S+/gi`) for the duration of the call only, restored in a `finally` block. This catches the dependency's own `log.info` call without patching `node_modules` (not installed in this environment; this is a Bun-only package) or waiting on an upstream fix.
- **Verification:** no funded wallet was available to run the actual deploy, so this was verified by induction against the exact logic, not the live call: a standalone script exercising the real regex and wrap/restore code against genuine `process.stdout`/`stderr.write` calls (not mocks), simulating the dependency's exact log format (`Wallet seed: <value>`) via both `console.log` and `console.info` (Node routes both through the same `stdout.write`). 4/4 checks passed — the raw seed never appears in captured output, the redaction marker confirms the line was caught rather than silently dropped, unrelated output passes through untouched, and the writers are restored afterward. Separately confirmed the config-object fix: a fake `walletSeed` does not appear anywhere in the logged object. **Still not verified: an actual live deploy run** — this mitigation has not seen a real invocation of `buildWalletAndWaitForFunds` yet. Treat it as a strong safety net, not a substitute for using a disposable wallet.

---

### F17 — Hardcoded fallback password for the local signing-key store, committed to a public repo — FIXED

**Severity:** High · **Level:** CODE FACT · **Bucket:** software vulnerability (VELO's own code, not third-party).

- **Surprise:** `deploy/network-config.ts:27`:
  ```ts
  export const storagePassword: string = getEnv("MIDNIGHT_STORAGE_PASSWORD") || "velo-local-dev-password-16";
  ```
  This value, when `MIDNIGHT_STORAGE_PASSWORD` isn't set, is assigned into `process.env.MIDNIGHT_STORAGE_PASSWORD` by `deploy-contract.ts:32` (`??=`) before the deploy call — which pre-empts the third-party package's own internal fallback (`providers.ts:104`: `getEnv("MIDNIGHT_STORAGE_PASSWORD") ?? "YourPasswordMy1!"`) from ever running, since the env var is already set by then. So VELO's own hardcoded value is the one that actually gets used whenever the operator hasn't set the real env var.
- **What this password protects, verified rather than assumed:** `providers.ts:79-104`, `configureMidnightNodeProviders`, constructs `signingKeyStoreName = \`${privateStateStoreName}-signing-keys\`` and passes it alongside `privateStoragePasswordProvider` into `levelPrivateStateProvider(...)`. The naming (`signing-keys`, `privateStoragePasswordProvider`) is unambiguous: this password gates a local LevelDB-backed store that includes signing key material, on disk, at the path `midnight-level-db-deploy` (`providers.ts:100`).
- **Deduction:** anyone who obtains read access to that local store directory — a second vulnerability, a shared machine, a misconfigured backup, a `git add -A` that accidentally includes a gitignore miss — can decrypt it with a password that is public, permanent, and printed in this repo's own source, because it was never meant to be secret in the first place (it is named `velo-local-dev-password-16`, i.e. a dev placeholder, not a production credential design).
- **Why this is VELO's finding, not just "the dependency has a bad default":** the third-party package already has its own insecure fallback (`"YourPasswordMy1!"`) — that's a hygiene issue in someone else's code. VELO's own choice was to add a *second*, VELO-branded hardcoded fallback in front of it, applied automatically via `??=` before the operator ever gets a chance to be warned. Fixing the third-party default is out of scope; not adding VELO's own insecure default on top of it is entirely in scope.
- **Threat-model precondition:** requires filesystem read access to wherever `midnight-level-db-deploy` ends up on disk — a second foothold, not remote. Still worth closing: chaining "a public, guessable password" onto "one more vulnerability grants filesystem read" is a much weaker chain than requiring the attacker to also extract a real per-operator secret.
- **Fix applied:** removed VELO's own hardcoded fallback entirely. `network-config.ts` now throws if `MIDNIGHT_STORAGE_PASSWORD` isn't set, in the same style already used three lines above it for a missing `MIDNIGHT_NETWORK_ID` — fail closed on a missing secret rather than silently substituting a public one. The third-party package's own fallback (`"YourPasswordMy1!"`) still technically exists further down the call chain, but it can now only be reached by someone who bypasses `network-config.ts` entirely and calls the dependency directly — outside what this repo's own deploy path does.
- **Verification:** the throw path is a direct copy of the pattern already exercised (by reading, not running — same as the `MIDNIGHT_NETWORK_ID` check it mirrors) for the network-ID check immediately above it in the same file. Not run against a live Bun process in this environment (Bun isn't installed here); the logic is a two-line conditional with no branching to get wrong.

---

### F18 — Dangling reference to nonexistent documentation — FIXED

**Severity:** Low, and precisely because of what it would have prevented · **Level:** CODE FACT

- `deploy/deploy-contract.ts:7` reads: `// build+test pipeline that the rest of VELO uses — see README "Deploying".` Searched every `.md` file in the repository for "Deploying", `MIDNIGHT_STORAGE_PASSWORD`, `MIDNIGHT_WALLET_SEED`, `MIDNIGHT_WALLET_MNEMONIC`: zero matches, anywhere.
- **Why this isn't just a broken link:** the missing doc is exactly the place that should have told an operator "this will print your seed, use a disposable wallet" and "set `MIDNIGHT_STORAGE_PASSWORD` yourself, don't let it default." Its absence is why F16 and F17 were live risks rather than documented, opted-into ones.
- **Fix applied:** added a `### Deploying` section to `README.md`, right after the MCP section — the exact invocation with all three required env vars, and both warnings named plainly rather than implied: use a disposable wallet regardless of F16's mitigation, and `MIDNIGHT_STORAGE_PASSWORD` has no default now, pick a real one.

---

## Discarded (non-issues) vectors

| Vector | Check | Result | Why it's not a finding |
|---|---|---|---|
| Real secrets already committed to git history | `git log --all -p -- deploy/network-config.ts` searched for seed/mnemonic/password strings across every version this file has ever had | **Clean** — only the one hardcoded fallback string, never a real value | The file has exactly one commit; no accidental real-secret commit-then-remove pattern (which would still be recoverable from history) |
| Local `undeployed`-network genesis seed being a public constant | `midnight-env.ts`: `genesisWalletSeed: "0000...0001"` for the `undeployed` case | **Not a vulnerability** | Standard, publicly-known placeholder pattern for a fully local, ephemeral, zero-value devnet — every blockchain dev toolchain does this; the deployed-network config path (`preview`/`preprod`/`mainnet`) correctly uses `''` and fails closed (`deploy.ts`: `if (!seed) throw ...`) if no real seed/mnemonic is supplied |
| A real `.env` file with live secrets already present in the repo | `find . -iname ".env*"`, `.gitignore` check | Only `.env.example` exists (no real values); `.env`/`.env.local` properly gitignored in both root and `frontend/` | No live leak today — F16/F17 are about what happens the first time someone actually runs the deploy, not about anything already exposed |

## Recommendations (out of scope of this audit act — record only, matching every prior round's convention)

- **F16:** do not run `deploy/deploy-contract.ts` against any wallet holding real value until this is mitigated. Cheapest real mitigation available without patching the dependency: wrap the deploy invocation to redirect/filter stdout (a `console.log`/`log.info` monkey-patch scoped to the deploy process, stripping any line matching `/wallet seed:/i`) — inelegant, but it doesn't require forking a third-party package hours before a demo. Better, if time allows: `patch-package` or an `overrides` entry pinning a patched copy of `build-wallet.ts` with the line removed. Best, not for this week: file the issue upstream.
- **F17:** remove VELO's own hardcoded fallback. Fail closed instead — if `MIDNIGHT_STORAGE_PASSWORD` isn't set, throw with a clear message (the same pattern `network-config.ts` already uses for a missing `MIDNIGHT_NETWORK_ID`, three lines above the line this finding is about), rather than silently substituting a public value into a signing-key store's encryption.
- **F18:** either write the README "Deploying" section, or change the comment to stop pointing at one that doesn't exist. Whichever ships, it should say plainly: this prints your seed, use a wallet with nothing in it you can't afford to lose, and set `MIDNIGHT_STORAGE_PASSWORD` yourself.

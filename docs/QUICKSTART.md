# VELO — Quick start

Everything you need to run VELO on your own machine: the 14 cases, the demos,
and the adversarial scripts. Every command here was run before it was written
down, and the output shown is real output.

**Español: [§ Inicio rápido](#inicio-rápido) at the bottom.**

Three separate layers, and you can stop after any of them:

| Layer | Needs | Time |
|---|---|---|
| 1. Engine + the 14 cases | Node 20+ | ~2 min |
| 2. Frontend + MCP | the above | ~3 min |
| 3. On-chain read / write | Bun; a funded wallet only for **write** | reading is free and instant |

**Want to reproduce exactly what we ran** — the happy path with the wallet, and
the adversarial probe against the deployed circuit? That is
[**§7, in order, with the output of each step**](#7-reproduce-what-we-ran).
Want to attest all 14 cases yourself? Copy-paste blocks in
[**§8**](#8-all-14-cases-on-chain-block-by-block).

---

## 0. Prerequisites

- **Node 20 or newer** (`node -v`). Nothing else for layers 1 and 2.
- **git**.
- **Bun** only if you want layer 3's write path — `curl -fsSL https://bun.sh/install | bash`.

You do **not** need a wallet, keys, DUST, or the proof server to run the cases,
the frontend, or to *read* the chain. Those only matter for attesting.

---

## 1. Install and build

```bash
git clone https://github.com/annatchijova/velo.git
cd velo

npm install     # npm workspaces — installs the root engine AND the frontend
npm run build   # compiles dist/, which everything else imports
```

`npm install` at the root is enough. Do not `npm install` inside `frontend/`
separately — it is a workspace, and installing it on its own breaks the
`velo/*` → `dist/src/*` resolution.

Check it worked:

```bash
npm test
```

Expected: `# pass 58` / `# fail 0`. This compiles first, so it also catches a
broken build.

That is the **engine** suite. The frontend has its own runner and is not part
of it — a green `npm test` says nothing about `frontend/`:

```bash
cd frontend && npx vitest run
```

Expected: `Tests  116 passed (116)`. **231 across both**, which is the number to
quote: 115 engine + 116 frontend. Quoting only the root suite makes the frontend
look untested when it is not.

---

## 2. The 14 cases

### All of them at once (~1 second)

```bash
node scripts/run-case.mjs
```

```
ok   VELO-001 MALICE    corroboration=4  The Pawn Sacrifice
ok   VELO-002 SUSPICION corroboration=1  The Uniform Log Auction
ok   VELO-003 MALICE    corroboration=2  The False Flag
ok   VELO-004 ABSTAIN   corroboration=0  The Broken Chain
ok   VELO-005 MALICE    corroboration=3  The Four-Source Convergence
ok   VELO-006 MALICE    corroboration=2  The Surgical Void
ok   VELO-007 MALICE    corroboration=2  The Ventriloquist
ok   VELO-008 MALICE    corroboration=2  The Altered Mise en Place
ok   VELO-009 SUSPICION corroboration=1  The False-Layman Bait
ok   VELO-010 NOISE     corroboration=0  A Normal Day at the Office
ok   VELO-011 SUSPICION corroboration=1  The Two Badges
ok   VELO-012 SUSPICION corroboration=1  The Quiet Resignation
ok   VELO-013 ABSTAIN   corroboration=0  The Anonymous Drop
ok   VELO-014 ABSTAIN   corroboration=0  What Was Never Looked At

All 14 cases reproduce the verdict their file documents.
```

Exit code is 0 only if every case reproduces the verdict its own file
documents. It is a check, not a viewer.

### One at a time

```bash
node scripts/run-case.mjs VELO-001
```

Prints the full breakdown for that one case — artifacts, custody, detectors
fired, fractures, corroborating sources, the exact rational score, the verdict
and the engine's own reasoning. `VELO-1`, `velo-001` and the full filename all
work.

### All of them, at full detail

The summary above is a check; this is the whole corpus with every breakdown,
one after another. Useful when someone wants to read the reasoning rather than
trust the exit code:

```bash
for c in $(ls cases/VELO-*.json | sed 's|.*/||; s|^\(VELO-[0-9]\{3\}\).*|\1|'); do node scripts/run-case.mjs "$c"; echo; done
```

Add `| tee /tmp/velo-full-run.txt` to keep a copy.

### Seal one, then verify it offline

```bash
node scripts/run-case.mjs VELO-001 --seal
```

Writes `local-cases/VELO-001.json` and prints its analysis fingerprint and
bundle hash. Then check it with the standalone verifier — one file, zero
dependencies, nothing else from this repo required:

```bash
node dist/src/seal/verify.js local-cases/VELO-001.json
```

```
internally consistent: YES

This does NOT establish who produced this bundle, or when.
It establishes only that the bundle is consistent with itself.
```

That wording is deliberate. See [F4](./RED_TEAM_ROUND_1.md).

### What each case is for

The corpus is not 14 variations on one idea — it is built so that each verdict
band, and each way of *not* reaching a verdict, has a worked example.

| Case | Verdict | Corrob. | What it demonstrates |
|---|---|---|---|
| **VELO-001** The Pawn Sacrifice | MALICE | 4 | A confession mail whose triggering cron job was created *before* it. Causality violated. |
| **VELO-002** The Uniform Log Auction | SUSPICION | 1 | 50 failures at exact 2,000s intervals. Looks like brute force; memory says otherwise. One source, so it stops at SUSPICION. |
| **VELO-003** The False Flag | MALICE | 2 | A real compromise with planted attribution on top. The engine separates the two. |
| **VELO-004** The Broken Chain | ABSTAIN | 0 | A hash matching known malware, with **no custody**. Damning content, inadmissible anyway. |
| **VELO-005** The Four-Source Convergence | MALICE | 3 | Memory, network and disk agreeing independently. The clean positive. |
| **VELO-006** The Surgical Void | MALICE | 2 | A 2 KB file destroyed with `shred -n 7 -z -u`. The effort is the evidence. |
| **VELO-007** The Ventriloquist | MALICE | 2 | Correctly signed `svchost.exe` running from the wrong path. |
| **VELO-008** The Altered Mise en Place | MALICE | 2 | One line in `deploy.sh` silencing auth failures, under a tidy commit message. |
| **VELO-009** The False-Layman Bait | SUSPICION | 1 | Performed incompetence. Suspicious, uncorroborated, held at SUSPICION. |
| **VELO-010** A Normal Day at the Office | NOISE | 0 | The benign baseline. A system that never says NOISE is useless. |
| **VELO-011** The Two Badges | SUSPICION | 1 | Same credentials in two places five seconds apart. |
| **VELO-012** The Quiet Resignation | SUSPICION | 1 | A DLP log with no matching USB registry entry. |
| **VELO-013** The Anonymous Drop | ABSTAIN | 0 | An unsigned file in an intake folder. No submitter, no chain, no verdict. |
| **VELO-014** What Was Never Looked At | ABSTAIN | 0 | Clean image, but two decisive sources were gone before anyone asked. **Absence of evidence is not evidence of absence.** |

**The pair worth showing:** VELO-010 and VELO-014 carry *identical* artifacts,
custody and score. The only difference is that 014 declares two coverage gaps.
010 says NOISE; 014 refuses to. That difference is pinned by a test, so the
pair cannot quietly stop proving its point.

```bash
node scripts/run-case.mjs VELO-010
node scripts/run-case.mjs VELO-014
```

Full narrative for every case: [`cases/README.md`](../cases/README.md) and
[`cases/casos-VELO-explicados.md`](../cases/casos-VELO-explicados.md) (ES).

---

## 3. The demos

### The end-to-end story (the one for the video)

```bash
npm run simulate
```

Analyze → seal → attest → verify offline, then the moment that matters: an
attempt to attest MALICE without enough corroboration, shown failing live.

### The frontend

```bash
cd frontend
npm run dev     # http://127.0.0.1:3000
```

Landing, wallet connect (Lace / 1AM), the case ledger, running the engine live,
seal → attest → verify, and the adversarial tamper demo. The first page load
compiles on demand — a few seconds of Next.js building, not a hang.

Back to the repo root when you're done: `cd ..`.

### As an MCP server

The same engine as a tool surface, so an agent can drive it conversationally:

```bash
npm run build
claude mcp add velo -- node "$(pwd)/dist/src/mcp/server.js"
```

Then ask for `list_my_cases`, `get_case`, `seal_case`, `verify_commitment`,
`chain_status`, `lookup_commitment`.

---

## 4. The adversarial scripts

These are the point of the project, not an appendix. Each one reproduces a red
team finding against the shipped code, and **each exits 0 only when the defect
is actually gone** — so they stay useful as regression checks, not as
screenshots of a moment.

Run them from the repo root, after `npm run build`.

| Script | What it proves | Command | Needs |
|---|---|---|---|
| **Daubert gate** — the headline | MALICE from one source is refused *by the circuit*, with the engine and every application guard bypassed | `bun run deploy/attest-forced-malice.ts <caseId>` | Bun, wallet, network |
| **F20** provenance normalization | Two acquisition roots differing only in letter case are one source, not two — so they cannot carry a verdict over the gate | `node scripts/verify-r6-provenance-normalization.mjs` | — |
| **F25** hex decode strictness | Malformed indexer state is rejected, never silently decoded to zero bytes | `node scripts/verify-f25-hex-decode-strictness.mjs` | — |
| **F14** content-type guard | Cross-origin form posts get 415, not a mutation | `node scripts/verify-f14-content-type.mjs` | — |
| **F16** seed redaction | The deploy dependency's unconditional seed log never reaches your terminal | `bun run scripts/verify-f16-seed-redaction.mjs` | **Bun** |
| Salt confidentiality | The attest script's "never printed" claim about the salt is true of a real run | `node --experimental-strip-types scripts/verify-salt-not-printed.mjs` | — |
| Live chain read | The deployed contract exists and its ledger decodes | `node scripts/verify-chain-read.mjs` | network |

Two of these have a runtime requirement that is not cosmetic. **F16 must run
under Bun.** Its first version passed under Node while the seed was printing
three times, because Node routes `console.*` through `process.stdout.write` and
Bun writes to the file descriptor directly — the capture array stayed empty and
"the seed never appears in captured output" was true of nothing. That is
[L2 in LEARNINGS](./LEARNINGS.md).

### The Daubert gate, in full

This is the one to show. It forces `MALICE` with `corroborationCount = 1`
straight at the deployed contract, with the engine (which cannot emit that
state) and the CLI guard (which refuses locally) both routed around:

```bash
node scripts/run-case.mjs VELO-001 --seal      # something to attack with

MIDNIGHT_NETWORK_ID=preview \
MIDNIGHT_STORAGE_PASSWORD=<your-secret> \
MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
bun run deploy/attest-forced-malice.ts VELO-001
```

```
Refused by the circuit's own assert:
  "failed assert: MALICE requires at least 2 independent corroborating
   sources — the Daubert gate"

PREDICTION HELD — MALICE from one source cannot be attested.
```

It costs nothing: the assert fires during circuit execution, before proving and
before any fee is balanced. It exits **non-zero if the chain accepts** the
forced attestation, and it distinguishes "refused by the gate" from "refused
for some other reason" — a dust or network failure cannot read as a green
result. See [`TECHNICAL_STATUS` §2.2](./TECHNICAL_STATUS.md) and
[L5 in LEARNINGS](./LEARNINGS.md).

---

## 5. The chain

**Reading is free.** No wallet, no keys, no proof server, no DUST:

```bash
node scripts/verify-chain-read.mjs
```

```
attestationCount : 2
attestations     : 2
   1b54f14996b871ebc052789f604472b827aa9b98acf7bf1f70b39fa80d92940a  ->  MALICE
   632dbf0159cb6df7360507b1c01cc2a62d26035cb20e56b57e7bae0ce8fb3b2b  ->  MALICE
```

### Writing — attesting a case with the wallet

This is the only real write path. The frontend's `POST /api/attest` returns a
placeholder (`status: "local_pending_contract"`) and the MCP `attest_case` tool
reports itself as not wired: browser-signed attestation is the piece that is
not built. Everything below runs from the CLI, where the seed and the proof
server live.

#### One-time setup

**a. Bun** — the deploy scripts do not run under `node`. The wallet plumbing
ships raw `.ts` exports that `tsc`/`node` cannot resolve.

```bash
curl -fsSL https://bun.sh/install | bash
```

**b. The proof server**, listening on `127.0.0.1:6300`. Proving happens
locally; nothing about your evidence is sent to a remote prover.

```bash
docker run -d --name midnight-proof-server -p 6300:6300 \
  midnightntwrk/proof-server:8.1.0
```

Preview wants `8.1.0` — check the [support
matrix](https://docs.midnight.network/relnotes/support-matrix) before assuming
a newer tag is better. If the container already exists, `docker start
midnight-proof-server`. Override the URL with `MIDNIGHT_PROOF_SERVER_URL` if
you run it elsewhere.

**c. A disposable wallet with NIGHT.** Use one holding nothing you cannot
afford to lose — the deploy dependency logs its seed to stdout unconditionally.
This repo redacts that line before it reaches your terminal (red team
[F16](./RED_TEAM_ROUND_4.md)), but that is a mitigation around a third-party
default, not one of this project's own guarantees.

#### The three environment variables

They are three different kinds of thing, and conflating them costs time:

| Variable | What it is | Where it comes from |
|---|---|---|
| `MIDNIGHT_NETWORK_ID` | Which network. `preview` for this project | You set it. It must be a real env var on the command line — setting it inside a module is too late |
| `MIDNIGHT_WALLET_MNEMONIC` | The wallet's 24-word recovery phrase, quoted | Your wallet. Verified working with a **1AM** phrase, standard BIP39 |
| `MIDNIGHT_STORAGE_PASSWORD` | A local disk-encryption password for the signing-key store. **Nothing to do with any wallet** | You invent it. No default — it used to fall back to a hardcoded value, red team [F17](./RED_TEAM_ROUND_4.md) |

There is also `MIDNIGHT_WALLET_SEED`, the hex seed *derived from* the phrase.
Set the mnemonic **or** the seed, not both — if both are set the seed wins and
the mnemonic is silently ignored. `unset MIDNIGHT_WALLET_SEED` if a stale one
is exported.

```bash
export MIDNIGHT_NETWORK_ID=preview
export MIDNIGHT_STORAGE_PASSWORD='pick-a-real-secret'
export MIDNIGHT_WALLET_MNEMONIC="word1 word2 ... word24"
```

#### Once per wallet: register NIGHT for DUST generation

```bash
bun run deploy/register-dust.ts
```

Fees are paid in DUST, which is *generated* by NIGHT that has been explicitly
registered — a separate on-chain transaction nothing else performs. Skip this
and you get `Insufficient Funds: could not balance dust`, which is **not** a
funding problem and more tokens will not fix it. Registration lives on-chain,
so it is once per wallet, not once per attestation. **Attest promptly after
registering** — see the `170` error below.

#### The loop, one case at a time

Three commands per case. Seal it, attest it, read it back:

```bash
# 1. Seal locally — the evidence never leaves this machine
node scripts/run-case.mjs VELO-001 --seal

# 2. Attest on-chain — real proof, real transaction
bun run deploy/attest-case.ts VELO-001

# 3. Read it back, with no wallet and no keys
node scripts/verify-chain-read.mjs
```

Step 2 takes a few minutes: most of it is wallet sync, then ZK proof generation
on your local proof server. It prints the transaction id and block height, and
deliberately **not** the salt — that used to leak, and
`scripts/verify-salt-not-printed.mjs` is what now keeps it from coming back.

Then repeat with any other case:

```bash
node scripts/run-case.mjs VELO-005 --seal && bun run deploy/attest-case.ts VELO-005
node scripts/run-case.mjs VELO-010 --seal && bun run deploy/attest-case.ts VELO-010
```

Do them one at a time. Two attestations in flight from the same wallet is how
you produce a stale-dust failure.

#### Two things that will look like errors and are not

**`failed assert: this attestation already exists`** — the replay guard working.
The salt is stored per case, so re-sealing and re-attesting the same analysis
recomputes the *same* commitment, and the contract refuses to record it twice or
inflate `attestationCount`. Red team G2. Attest a different case, or change the
analysis.

> **Where the salt lives, and why it can give you a false negative.** The salt
> store is a LevelDB directory — `midnight-level-db-deploy`, store
> `velo-private-state-attest` — created **relative to your working directory**
> and encrypted with `MIDNIGHT_STORAGE_PASSWORD`. Re-attest from a different
> directory, or with a different password, and the store is not found: a fresh
> salt is generated, the commitment comes out different, and the contract
> accepts it as a **new** attestation. You get a successful transaction and a
> burnt fee instead of the guard, and nothing announces that you tested the
> wrong thing. Same `cd`, same password — and confirm with
> `node scripts/verify-chain-read.mjs` that `attestationCount` did **not**
> move. That unchanged number is the result; a transaction that succeeds is
> the failure.

**A `MALICE` case refusing to attest with fewer than two corroborating sources**
— the Daubert gate. That is §4, and it is the point of the project.

#### The errors that are errors

**`Insufficient Funds: could not balance dust`** — you skipped the dust
registration above, or it has not settled.

**`1010: Invalid Transaction: Custom error: 170`** — `InvalidDustSpendProof`.
The node rejected the *DUST fee proof*, not your contract. The cause that
actually bit us was **stale dust state**: if the dust sync is still settling
when the transaction is built, the spend proof references a merkle root that is
being superseded. The symptom is `dust=` flipping `true → false → true` near the
end of the sync. The fix is freshness, not versions — re-run and submit while
the state is fresh.

The full runbook with the diagnosis behind both is
[`docs/CHAIN.md`](./CHAIN.md) and [L3 in LEARNINGS](./LEARNINGS.md). Do not
improvise this part; we lost hours to exactly these two.

### Verifying it yourself, hash by hash

Four checks, in order. The fourth one is a limit, not a step — and it is the
one worth understanding.

**1. The analysis is reproducible.** Seal the same case twice:

```bash
node scripts/run-case.mjs VELO-001 --seal
node dist/src/seal/verify.js local-cases/VELO-001.json | grep -E "bundle hash|fingerprint"
node scripts/run-case.mjs VELO-001 --seal
node dist/src/seal/verify.js local-cases/VELO-001.json | grep -E "bundle hash|fingerprint"
```

```
bundle hash:          853f8e8655654b418eb47936295ad09db739d45939d02c63e670caabf8e08500
analysis fingerprint: 92d1b18a173b4f48bc999dbb64743348251c3b23ea959b2176334eb56174b2fc

bundle hash:          f4d824f0e32b7a3a98228a18175470f90c0f8768ace04efb4971f02ba28f1cbb   <- different
analysis fingerprint: 92d1b18a173b4f48bc999dbb64743348251c3b23ea959b2176334eb56174b2fc   <- identical
```

That is the two-hash design doing its job. The **fingerprint** identifies the
analysis, so re-running the engine on the same evidence reproduces it exactly —
that is what makes the verdict checkable by someone else. The **bundle hash**
identifies this particular execution, so it includes the seal timestamp and the
custody chain and changes every time. Conflating the two would make
reproducibility impossible to demonstrate: you could never tell "the same
analysis, run again" from "a different analysis".

**2. The bundle is internally consistent.** `dist/src/seal/verify.js` imports
nothing from this project and nothing from npm — `node:crypto` and `node:fs`
only. Hand it to an opposing expert with the bundle and nothing else:

```bash
node dist/src/seal/verify.js local-cases/VELO-001.json
```

It recomputes both hashes and walks every custody link. It prints
`internally consistent`, never `valid` — a reader takes "valid" to mean
"authentic", and this establishes something strictly weaker.

**3. The attestation exists on-chain.** Free, from anywhere:

```bash
node scripts/verify-chain-read.mjs
```

Or from a block explorer nobody here controls:
[preview.midnightexplorer.com/contracts/0x46cac58c…023d9d](https://preview.midnightexplorer.com/contracts/0x46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d)

**4. You cannot recompute the on-chain commitment from the bundle — and that
is deliberate.**

The commitment is
`persistentHash([domain, fingerprint, custodyTip, verdict, corroborationCount, salt])`.
A bundle gives you five of those six. The **salt** is a per-case 32-byte value
that never leaves the analyst's machine, and without it the hash cannot be
reproduced.

That is the whole point. The other five values are public or guessable — the
domain separator is in the source, the verdict is on the ledger, the
corroboration count is a number under 18. If the salt were published, anyone
could hash a candidate tuple and *confirm* whether it is the one behind a given
commitment. The commitment would stop hiding anything.

So the link between "this sealed bundle" and "that on-chain commitment" is not
something a third party recomputes. It is what the **zero-knowledge proof
establishes** — that whoever attested knew a preimage satisfying the circuit's
constraints, including the Daubert gate. Recomputing it yourself would mean the
privacy property had already failed.

What you can verify independently, then: that the analysis is reproducible,
that the bundle is self-consistent, that an attestation exists on a public
chain carrying a verdict, and — see §4 — that the gate refuses a forced
`MALICE`. What you cannot verify by recomputation, by design, is which case is
behind which commitment.

---

## 6. If something breaks

| Symptom | Cause |
|---|---|
| `Cannot find module '../dist/...'` | You skipped `npm run build`, or `npm run clean` wiped it |
| Frontend cannot resolve `velo/*` | You ran `npm install` inside `frontend/`. Delete `frontend/node_modules` and run `npm install` at the root |
| A verify script "passes" instantly and prints nothing | Check the runtime — F16 and the salt check are runtime-sensitive by design |
| `Insufficient Funds: could not balance dust` | Not funding. NIGHT must be *registered* for dust generation. [CHAIN.md](./CHAIN.md) |
| `1010: ... Custom error: 170` | Stale DUST state, not a version mismatch. Re-run. [CHAIN.md](./CHAIN.md) |

Where things live: [`docs/STRUCTURE.md`](./STRUCTURE.md).

---

## 7. Reproduce what we ran

The whole thing, in order, with what each step establishes. Steps 1–4 need only
Node. Steps 5–9 need Bun, the proof server and a wallet — all of that is set up
in [§5](#writing--attesting-a-case-with-the-wallet).

Two independent things get reproduced here: the **happy path** (a case sealed
locally, proved, attested on a live network, read back by a stranger) and the
**adversarial probe** (the same contract refusing an attestation the engine
could never have produced). Neither is worth much without the other — a system
that only ever says yes has not been tested.

### Steps 1–4: no wallet needed

```bash
git clone https://github.com/annatchijova/velo.git && cd velo
npm install && npm run build
```

**1. The engine is deterministic and the corpus agrees with it.**

```bash
npm test                      # -> # pass 115 / # fail 0
node scripts/run-case.mjs     # -> all 14 reproduce their documented verdict
```

**2. A verdict is earned, not declared.** Same clean evidence, opposite outcome,
because one case declares what it never got to look at:

```bash
node scripts/run-case.mjs VELO-010    # -> NOISE
node scripts/run-case.mjs VELO-014    # -> ABSTAIN
```

**3. A sealed bundle can be checked by someone who does not trust this repo.**

```bash
node scripts/run-case.mjs VELO-001 --seal
node dist/src/seal/verify.js local-cases/VELO-001.json
# -> internally consistent: YES
```

**4. The contract is deployed and its ledger is public.** No wallet, no keys,
no fees:

```bash
node scripts/verify-chain-read.mjs
# -> attestationCount : 2, both MALICE
```

Stop here and you have verified everything except the chain *write*.

### Steps 5–9: with the wallet

Set up Bun, the proof server and the three environment variables per
[§5](#writing--attesting-a-case-with-the-wallet) first, then:

```bash
export MIDNIGHT_NETWORK_ID=preview
export MIDNIGHT_STORAGE_PASSWORD='pick-a-real-secret'
export MIDNIGHT_WALLET_MNEMONIC="word1 word2 ... word24"
```

**5. Register NIGHT for DUST generation.** Once per wallet, and attest promptly
afterwards:

```bash
bun run deploy/register-dust.ts
```

**6. The happy path — attest a real case on `preview`.** VELO-001 is `MALICE`
with four independent corroborating sources, so it passes the gate honestly:

```bash
node scripts/run-case.mjs VELO-001 --seal
bun run deploy/attest-case.ts VELO-001
```

A few minutes: wallet sync, then ZK proof generation on your local proof
server. It prints the transaction id and block height — and not the salt.

**7. Read your own attestation back, as a stranger would.**

```bash
node scripts/verify-chain-read.mjs
```

`attestationCount` has gone up by one and your commitment is in the list. That
read used no wallet, no keys and no fees — which is the point: anyone can check
it, and nobody learns anything about the evidence.

Confirm it independently on a block explorer we do not control:
**[preview.midnightexplorer.com/contracts/0x46cac58c…023d9d](https://preview.midnightexplorer.com/contracts/0x46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d)**

**8. The replay guard.** Run the same attestation again:

```bash
bun run deploy/attest-case.ts VELO-001
# -> failed assert: this attestation already exists
node scripts/verify-chain-read.mjs
# -> attestationCount UNCHANGED
```

The salt is stored per case, so the same analysis recomputes the same
commitment, and the contract refuses to record it twice. Red team G2. Without
this you could manufacture the appearance of independent corroboration by
paying the fee twice.

Run it from the same directory and with the same `MIDNIGHT_STORAGE_PASSWORD` as
step 6, or this step silently tests nothing — see the note in
[§5](#two-things-that-will-look-like-errors-and-are-not). The unchanged
`attestationCount` is the result, not the error message.

**9. The adversarial probe — the one that matters.** Force `MALICE` with a
single corroborating source, straight at the deployed circuit:

```bash
bun run deploy/attest-forced-malice.ts VELO-001
```

```
Refused by the circuit's own assert:
  "failed assert: MALICE requires at least 2 independent corroborating
   sources — the Daubert gate"

PREDICTION HELD — MALICE from one source cannot be attested.
```

Read what that command actually does before you run it — it is short, and the
bypass is the whole argument. The engine cannot emit this state (`scorer.ts`
degrades `MALICE` to `SUSPICION` below two sources) and `attest-case.ts` refuses
locally, so the probe overrides the corroboration witness to return `1` while
passing `MALICE` as the public argument. **Only the count is forged** — a bundle
also lying about its fingerprint would fail for a different reason and prove
nothing about corroboration. Nothing is left between the call and the circuit.

It costs nothing: the assert fires during circuit execution, before proving and
before any fee is balanced. It exits **non-zero if the chain accepts** the
forced attestation, and says in that case that
[`TECHNICAL_STATUS` §2.2](./TECHNICAL_STATUS.md) is false as written — an
experiment that can only confirm is not an experiment. It also distinguishes
"refused by the gate" from "refused for some other reason", so a dust or network
failure cannot read as a green result.

### What you will have shown

| Step | Claim |
|---|---|
| 1 | The engine is deterministic and the corpus is not decorative — it runs |
| 2 | A gap in coverage degrades a *negative* finding. Absence of evidence is not evidence of absence |
| 3 | A sealed bundle is checkable without trusting this repository |
| 4 | The contract is live on `preview` and readable by anyone, for free |
| 6–7 | The full write path works end to end against a real network |
| 8 | Attestations cannot be replayed to fake corroboration |
| 9 | **The admissibility rule is a cryptographic constraint, not a policy note** |

Step 9 is the one to demo. Everything else is a system working; step 9 is a
system refusing.

---

## 8. All 14 cases on-chain, block by block

Copy-paste, one block at a time. Each one seals the case locally, attests it on
`preview`, and reads the ledger back so you can watch `attestationCount` go up
by exactly one.

**Before you start**, once per session:

```bash
export MIDNIGHT_NETWORK_ID=preview
export MIDNIGHT_STORAGE_PASSWORD='pick-a-real-secret'
export MIDNIGHT_WALLET_MNEMONIC="word1 word2 ... word24"
unset MIDNIGHT_WALLET_SEED

docker start midnight-proof-server 2>/dev/null || \
  docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:8.1.0

npm run build
bun run deploy/register-dust.ts     # once per wallet
node scripts/verify-chain-read.mjs  # note the starting attestationCount
```

**Read this before running all 14.** Each block is a real transaction: it costs
DUST and takes a few minutes, most of it wallet sync and ZK proof generation.
Fourteen of them is roughly an hour and needs the wallet to stay funded
throughout. **Do them one at a time** — two attestations in flight from the same
wallet is how you produce a stale-dust failure. If you only want to see the
mechanism work, blocks 001, 010 and 014 cover MALICE, NOISE and ABSTAIN, which
is the whole verdict range.

All 14 attest cleanly: every `MALICE` case in the corpus has at least two
corroborating sources, so none of them trips the Daubert gate. Making one trip
it deliberately is [§4](#the-daubert-gate-in-full).

Re-running a block you have already done will hit the replay guard rather than
attesting twice — that is [§7 step 8](#7-reproduce-what-we-ran), and the note
there about the storage password applies.

**VELO-001 — The Pawn Sacrifice** · `MALICE`, 4 corroborating

```bash
node scripts/run-case.mjs VELO-001 --seal
bun run deploy/attest-case.ts VELO-001
node scripts/verify-chain-read.mjs
```

**VELO-002 — The Uniform Log Auction** · `SUSPICION`, 1 corroborating

```bash
node scripts/run-case.mjs VELO-002 --seal
bun run deploy/attest-case.ts VELO-002
node scripts/verify-chain-read.mjs
```

**VELO-003 — The False Flag** · `MALICE`, 2 corroborating

```bash
node scripts/run-case.mjs VELO-003 --seal
bun run deploy/attest-case.ts VELO-003
node scripts/verify-chain-read.mjs
```

**VELO-004 — The Broken Chain** · `ABSTAIN`, 0 corroborating

```bash
node scripts/run-case.mjs VELO-004 --seal
bun run deploy/attest-case.ts VELO-004
node scripts/verify-chain-read.mjs
```

**VELO-005 — The Four-Source Convergence** · `MALICE`, 3 corroborating

```bash
node scripts/run-case.mjs VELO-005 --seal
bun run deploy/attest-case.ts VELO-005
node scripts/verify-chain-read.mjs
```

**VELO-006 — The Surgical Void** · `MALICE`, 2 corroborating

```bash
node scripts/run-case.mjs VELO-006 --seal
bun run deploy/attest-case.ts VELO-006
node scripts/verify-chain-read.mjs
```

**VELO-007 — The Ventriloquist** · `MALICE`, 2 corroborating

```bash
node scripts/run-case.mjs VELO-007 --seal
bun run deploy/attest-case.ts VELO-007
node scripts/verify-chain-read.mjs
```

**VELO-008 — The Altered Mise en Place** · `MALICE`, 2 corroborating

```bash
node scripts/run-case.mjs VELO-008 --seal
bun run deploy/attest-case.ts VELO-008
node scripts/verify-chain-read.mjs
```

**VELO-009 — The False-Layman Bait** · `SUSPICION`, 1 corroborating

```bash
node scripts/run-case.mjs VELO-009 --seal
bun run deploy/attest-case.ts VELO-009
node scripts/verify-chain-read.mjs
```

**VELO-010 — A Normal Day at the Office** · `NOISE`, 0 corroborating

```bash
node scripts/run-case.mjs VELO-010 --seal
bun run deploy/attest-case.ts VELO-010
node scripts/verify-chain-read.mjs
```

**VELO-011 — The Two Badges** · `SUSPICION`, 1 corroborating

```bash
node scripts/run-case.mjs VELO-011 --seal
bun run deploy/attest-case.ts VELO-011
node scripts/verify-chain-read.mjs
```

**VELO-012 — The Quiet Resignation** · `SUSPICION`, 1 corroborating

```bash
node scripts/run-case.mjs VELO-012 --seal
bun run deploy/attest-case.ts VELO-012
node scripts/verify-chain-read.mjs
```

**VELO-013 — The Anonymous Drop** · `ABSTAIN`, 0 corroborating

```bash
node scripts/run-case.mjs VELO-013 --seal
bun run deploy/attest-case.ts VELO-013
node scripts/verify-chain-read.mjs
```

**VELO-014 — What Was Never Looked At** · `ABSTAIN`, 0 corroborating

```bash
node scripts/run-case.mjs VELO-014 --seal
bun run deploy/attest-case.ts VELO-014
node scripts/verify-chain-read.mjs
```

Afterwards, the whole set is readable by anyone, with no wallet:

```bash
node scripts/verify-chain-read.mjs
```

And confirm it somewhere that runs none of this repository's code — a
third-party block explorer, reading the same public chain:

**[preview.midnightexplorer.com/contracts/0x46cac58c…023d9d](https://preview.midnightexplorer.com/contracts/0x46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d)**

Your attestations appear there as calls to `attest` on the contract. That is
the check worth showing someone: it does not depend on trusting anything we
wrote.

---
---

# Inicio rápido

Todo lo necesario para correr VELO en tu propia máquina: los 14 casos, las
demos y los scripts adversariales. Cada comando de acá se corrió antes de
escribirlo, y la salida que se muestra es salida real.

Tres capas separadas, y podés parar después de cualquiera:

| Capa | Requiere | Tiempo |
|---|---|---|
| 1. Motor + los 14 casos | Node 20+ | ~2 min |
| 2. Frontend + MCP | lo anterior | ~3 min |
| 3. Lectura / escritura en cadena | Bun; billetera con fondos solo para **escribir** | leer es gratis e inmediato |

**¿Querés reproducir exactamente lo que corrimos** — el camino feliz con la
billetera, y la sonda adversarial contra el circuito desplegado? Es la
[**sección 7, en orden, con la salida de cada paso**](#7-reproducir-lo-que-corrimos).
¿Querés atestiguar vos los 14 casos? Bloques para copiar y pegar en la
[**sección 8**](#8-los-14-casos-on-chain-bloque-por-bloque).

## 0. Requisitos

- **Node 20 o superior** (`node -v`). Nada más para las capas 1 y 2.
- **git**.
- **Bun** solo si querés la ruta de escritura de la capa 3.

**No** hace falta billetera, claves, DUST ni el proof server para correr los
casos, el frontend, ni para *leer* la cadena. Eso solo importa para atestiguar.

## 1. Instalar y compilar

```bash
git clone https://github.com/annatchijova/velo.git
cd velo

npm install     # workspaces de npm — instala el motor raíz Y el frontend
npm run build   # compila dist/, que importa todo lo demás
```

`npm install` en la raíz alcanza. **No** hagas `npm install` dentro de
`frontend/` por separado: es un workspace, e instalarlo solo rompe la
resolución `velo/*` → `dist/src/*`.

Comprobar que funcionó:

```bash
npm test
```

Esperado: `# pass 58` / `# fail 0`. Compila primero, así que también detecta un
build roto.

Esa es la suite del **motor**. El frontend tiene su propio runner y no está
incluido — un `npm test` en verde no dice nada sobre `frontend/`:

```bash
cd frontend && npx vitest run
```

Esperado: `Tests  116 passed (116)`. **231 entre las dos**, que es el número a
citar: 115 del motor + 116 del frontend. Citar solo la suite raíz hace parecer
que el frontend no tiene tests, y sí los tiene.

## 2. Los 14 casos

### Todos de una (~1 segundo)

```bash
node scripts/run-case.mjs
```

Sale 0 solo si los 14 casos reproducen el veredicto que documenta su propio
archivo. Es un chequeo, no un visor.

### De a uno

```bash
node scripts/run-case.mjs VELO-001
```

Imprime el desglose completo de ese caso: artefactos, custodia, detectores que
dispararon, fracturas, fuentes que corroboran, el score racional exacto, el
veredicto y el razonamiento del propio motor. Funcionan `VELO-1`, `velo-001` y
el nombre de archivo completo.

### Todos, en detalle completo

El resumen de arriba es un chequeo; esto es el corpus entero con cada
desglose, uno tras otro. Sirve cuando alguien quiere *leer* el razonamiento en
vez de confiar en el código de salida:

```bash
for c in $(ls cases/VELO-*.json | sed 's|.*/||; s|^\(VELO-[0-9]\{3\}\).*|\1|'); do node scripts/run-case.mjs "$c"; echo; done
```

Agregale `| tee /tmp/velo-corrida-completa.txt` para guardar una copia.

### Sellar uno y verificarlo offline

```bash
node scripts/run-case.mjs VELO-001 --seal
node dist/src/seal/verify.js local-cases/VELO-001.json
```

El verificador dice `internally consistent: YES` — deliberadamente **no** dice
"válido", porque un lector entiende "válido" como "auténtico", y la
consistencia interna es una afirmación estrictamente más débil.

### Para qué sirve cada caso

El corpus no son 14 variaciones de una misma idea: cada banda de veredicto —y
cada forma de *no* llegar a un veredicto— tiene un ejemplo trabajado.

| Caso | Veredicto | Corrob. | Qué demuestra |
|---|---|---|---|
| **VELO-001** El sacrificio del peón | MALICE | 4 | Un mail de confesión cuyo cron disparador se creó *antes*. Causalidad violada. |
| **VELO-002** La subasta de logs uniformes | SUSPICION | 1 | 50 fallos a intervalos exactos de 2.000 s. Parece fuerza bruta; la memoria dice otra cosa. Una sola fuente: queda en SUSPICION. |
| **VELO-003** La bandera falsa | MALICE | 2 | Un compromiso real con atribución plantada encima. El motor separa las dos cosas. |
| **VELO-004** La cadena rota | ABSTAIN | 0 | Un hash que coincide con malware conocido, **sin custodia**. Contenido lapidario, inadmisible igual. |
| **VELO-005** La convergencia de cuatro fuentes | MALICE | 3 | Memoria, red y disco coincidiendo de forma independiente. El positivo limpio. |
| **VELO-006** El vacío quirúrgico | MALICE | 2 | Un archivo de 2 KB destruido con `shred -n 7 -z -u`. El esfuerzo *es* la evidencia. |
| **VELO-007** El ventrílocuo | MALICE | 2 | `svchost.exe` correctamente firmado corriendo desde la ruta equivocada. |
| **VELO-008** La mise en place alterada | MALICE | 2 | Una línea en `deploy.sh` que silencia fallos de autenticación, bajo un mensaje de commit prolijo. |
| **VELO-009** El cebo del falso lego | SUSPICION | 1 | Incompetencia actuada. Sospechoso, sin corroborar, retenido en SUSPICION. |
| **VELO-010** Un día normal en la oficina | NOISE | 0 | La línea de base benigna. Un sistema que nunca dice NOISE no sirve. |
| **VELO-011** Las dos credenciales | SUSPICION | 1 | Las mismas credenciales en dos lugares con cinco segundos de diferencia. |
| **VELO-012** La renuncia silenciosa | SUSPICION | 1 | Un log de DLP sin la entrada correspondiente en el registro USB. |
| **VELO-013** El envío anónimo | ABSTAIN | 0 | Un archivo sin firmar en una carpeta de recepción. Sin remitente, sin cadena, sin veredicto. |
| **VELO-014** Lo que nunca se miró | ABSTAIN | 0 | Imagen limpia, pero dos fuentes decisivas ya no existían cuando se preguntó. **Ausencia de evidencia no es evidencia de ausencia.** |

**El par que conviene mostrar:** VELO-010 y VELO-014 tienen artefactos,
custodia y score *idénticos*. La única diferencia es que 014 declara dos
brechas de cobertura. 010 dice NOISE; 014 se niega. Esa diferencia está fijada
por un test, así que el par no puede dejar de probar su punto en silencio.

## 3. Las demos

```bash
npm run simulate          # la historia completa, con las dos negativas en vivo

cd frontend && npm run dev   # http://127.0.0.1:3000

npm run build && claude mcp add velo -- node "$(pwd)/dist/src/mcp/server.js"
```

## 4. Los scripts adversariales

Son el punto del proyecto, no un apéndice. Cada uno reproduce un hallazgo del
red team contra el código que se entrega, y **cada uno sale 0 solo cuando el
defecto realmente no está** — siguen sirviendo como chequeo de regresión, no
como captura de pantalla de un momento.

| Script | Qué prueba | Comando |
|---|---|---|
| **Compuerta Daubert** — el principal | MALICE con una sola fuente es rechazado *por el circuito*, con el motor y todas las defensas de aplicación esquivadas | `bun run deploy/attest-forced-malice.ts <caseId>` |
| **F20** normalización de procedencia | Dos raíces de adquisición que solo difieren en mayúsculas son una fuente, no dos | `node scripts/verify-r6-provenance-normalization.mjs` |
| **F25** estrictez del decode hex | Un estado malformado del indexer se rechaza, nunca se decodifica a ceros en silencio | `node scripts/verify-f25-hex-decode-strictness.mjs` |
| **F14** guarda de content-type | Un POST de formulario cross-origin recibe 415, no una mutación | `node scripts/verify-f14-content-type.mjs` |
| **F16** redacción de la semilla | El log incondicional de semilla de la dependencia de deploy nunca llega a tu terminal | `bun run scripts/verify-f16-seed-redaction.mjs` |
| Confidencialidad del salt | La afirmación "nunca se imprime" del script de attest es cierta en una corrida real | `node --experimental-strip-types scripts/verify-salt-not-printed.mjs` |
| Lectura de cadena en vivo | El contrato desplegado existe y su ledger decodifica | `node scripts/verify-chain-read.mjs` |

**F16 tiene que correr bajo Bun**, y no es cosmético: su primera versión pasaba
bajo Node mientras la semilla se imprimía tres veces, porque Node hace pasar
`console.*` por `process.stdout.write` y Bun escribe al descriptor de archivo
directamente. El array de captura quedaba vacío y "la semilla nunca aparece en
la salida capturada" era cierto de nada. Es [L2 en LEARNINGS](./LEARNINGS.md).

### La compuerta Daubert, completa

```bash
node scripts/run-case.mjs VELO-001 --seal

MIDNIGHT_NETWORK_ID=preview \
MIDNIGHT_STORAGE_PASSWORD=<tu-secreto> \
MIDNIGHT_WALLET_MNEMONIC="palabra1 ... palabra24" \
bun run deploy/attest-forced-malice.ts VELO-001
```

No cuesta nada: el assert dispara durante la ejecución del circuito, antes de
probar y antes de balancear ninguna comisión. Sale **distinto de cero si la
cadena acepta** la atestación forzada, y distingue "rechazado por la compuerta"
de "rechazado por otra cosa" — un fallo de dust o de red no puede leerse como
resultado verde.

## 5. La cadena

**Leer es gratis** — sin billetera, claves, proof server ni DUST:

```bash
node scripts/verify-chain-read.mjs
```

### Escribir — atestiguar un caso con la billetera

Es la única ruta de escritura real. El `POST /api/attest` del frontend devuelve
un placeholder (`status: "local_pending_contract"`) y la herramienta MCP
`attest_case` se declara a sí misma como no cableada: la atestación firmada
desde el navegador es la pieza que no está construida. Todo lo de abajo corre
desde la CLI, que es donde viven la semilla y el proof server.

#### Preparación, una sola vez

**a. Bun** — los scripts de deploy no corren bajo `node`. La plomería de
billetera publica exports `.ts` crudos que `tsc`/`node` no pueden resolver.

```bash
curl -fsSL https://bun.sh/install | bash
```

**b. El proof server**, escuchando en `127.0.0.1:6300`. La prueba se genera
localmente; nada de tu evidencia se manda a un prover remoto.

```bash
docker run -d --name midnight-proof-server -p 6300:6300 \
  midnightntwrk/proof-server:8.1.0
```

Preview quiere `8.1.0` — mirá la [matriz de
soporte](https://docs.midnight.network/relnotes/support-matrix) antes de asumir
que un tag más nuevo es mejor. Si el contenedor ya existe, `docker start
midnight-proof-server`. Se puede apuntar a otra URL con
`MIDNIGHT_PROOF_SERVER_URL`.

**c. Una billetera descartable con NIGHT.** Usá una que no tenga nada que no
puedas perder: la dependencia de deploy loguea su semilla a stdout de forma
incondicional. Este repo redacta esa línea antes de que llegue a tu terminal
(red team [F16](./RED_TEAM_ROUND_4.md)), pero eso es una mitigación alrededor
de un default ajeno, no una garantía propia del proyecto.

#### Las tres variables de entorno

Son tres cosas de naturaleza distinta, y confundirlas cuesta tiempo:

| Variable | Qué es | De dónde sale |
|---|---|---|
| `MIDNIGHT_NETWORK_ID` | Qué red. `preview` para este proyecto | La ponés vos. Tiene que ser una variable de entorno real en la línea de comandos — setearla dentro de un módulo llega tarde |
| `MIDNIGHT_WALLET_MNEMONIC` | La frase de recuperación de 24 palabras, entre comillas | Tu billetera. Verificado con una frase de **1AM**, BIP39 estándar |
| `MIDNIGHT_STORAGE_PASSWORD` | Una contraseña de cifrado local del almacén de claves de firma. **No tiene nada que ver con ninguna billetera** | La inventás vos. Sin default — antes caía a un valor hardcodeado, red team [F17](./RED_TEAM_ROUND_4.md) |

También existe `MIDNIGHT_WALLET_SEED`, la semilla hex *derivada de* la frase.
Poné la mnemónica **o** la semilla, no las dos: si están ambas, gana la semilla
y la mnemónica se ignora en silencio. `unset MIDNIGHT_WALLET_SEED` si quedó una
vieja exportada.

```bash
export MIDNIGHT_NETWORK_ID=preview
export MIDNIGHT_STORAGE_PASSWORD='elegí-un-secreto-real'
export MIDNIGHT_WALLET_MNEMONIC="palabra1 palabra2 ... palabra24"
```

#### Una vez por billetera: registrar NIGHT para generar DUST

```bash
bun run deploy/register-dust.ts
```

Las comisiones se pagan en DUST, que lo *genera* el NIGHT que fue explícitamente
registrado — una transacción on-chain aparte que ninguna otra cosa hace.
Saltearla da `Insufficient Funds: could not balance dust`, que **no** es un
problema de fondos y no se arregla con más tokens. El registro vive on-chain,
así que es una vez por billetera, no una por atestación. **Atestiguá pronto
después de registrar** — ver el error `170` abajo.

#### El ciclo, de a un caso

Tres comandos por caso. Sellarlo, atestiguarlo, leerlo de vuelta:

```bash
# 1. Sellar localmente — la evidencia no sale de esta máquina
node scripts/run-case.mjs VELO-001 --seal

# 2. Atestiguar on-chain — prueba real, transacción real
bun run deploy/attest-case.ts VELO-001

# 3. Leerlo de vuelta, sin billetera y sin claves
node scripts/verify-chain-read.mjs
```

El paso 2 tarda unos minutos: la mayor parte es la sincronización de la
billetera, y después la generación de la prueba ZK en tu proof server local.
Imprime el id de transacción y la altura de bloque, y deliberadamente **no** el
salt — eso se filtraba, y `scripts/verify-salt-not-printed.mjs` es lo que ahora
impide que vuelva.

Después, con cualquier otro caso:

```bash
node scripts/run-case.mjs VELO-005 --seal && bun run deploy/attest-case.ts VELO-005
node scripts/run-case.mjs VELO-010 --seal && bun run deploy/attest-case.ts VELO-010
```

De a uno. Dos atestaciones en vuelo desde la misma billetera es la forma de
producir un fallo por dust viejo.

#### Dos cosas que van a parecer errores y no lo son

**`failed assert: this attestation already exists`** — la guarda de replay
funcionando. El salt se guarda por caso, así que volver a sellar y atestiguar el
mismo análisis recalcula el *mismo* commitment, y el contrato se niega a
registrarlo dos veces o a inflar `attestationCount`. Red team G2. Atestiguá otro
caso, o cambiá el análisis.

> **Dónde vive el salt, y por qué puede darte un falso negativo.** El almacén
> del salt es un directorio LevelDB — `midnight-level-db-deploy`, store
> `velo-private-state-attest` — creado **relativo a tu directorio de trabajo** y
> cifrado con `MIDNIGHT_STORAGE_PASSWORD`. Si volvés a atestiguar desde otro
> directorio, o con otra contraseña, el almacén no se encuentra: se genera un
> salt nuevo, el commitment sale distinto, y el contrato lo acepta como una
> atestación **nueva**. Te queda una transacción exitosa y una comisión gastada
> en lugar de la guarda, y nada avisa que probaste otra cosa. Mismo `cd`, misma
> contraseña — y confirmá con `node scripts/verify-chain-read.mjs` que
> `attestationCount` **no** se movió. Ese número sin cambiar es el resultado;
> una transacción que sale bien es el fallo.

**Un caso `MALICE` que se niega a atestiguar con menos de dos fuentes que
corroboran** — la compuerta Daubert. Eso es la sección 4, y es el punto del
proyecto.

#### Los errores que sí son errores

**`Insufficient Funds: could not balance dust`** — te salteaste el registro de
dust de arriba, o todavía no se asentó.

**`1010: Invalid Transaction: Custom error: 170`** — `InvalidDustSpendProof`. El
nodo rechazó la *prueba de comisión en DUST*, no tu contrato. La causa que
realmente nos pasó fue **estado de dust viejo**: si la sincronización de dust
todavía se está asentando cuando se arma la transacción, la prueba de gasto
referencia una raíz merkle que está siendo reemplazada. El síntoma es `dust=`
oscilando `true → false → true` cerca del final de la sincronización. La
solución es frescura, no versiones: volvé a correrlo y enviá con el estado
fresco.

El runbook completo con el diagnóstico de los dos está en
[`docs/CHAIN.md`](./CHAIN.md) y [L3 en LEARNINGS](./LEARNINGS.md). No improvises
esta parte: perdimos horas exactamente en estos dos.

### Verificarlo vos misma, hash por hash

Cuatro chequeos, en orden. El cuarto no es un paso sino un límite — y es el que
vale la pena entender.

**1. El análisis es reproducible.** Sellá el mismo caso dos veces:

```bash
node scripts/run-case.mjs VELO-001 --seal
node dist/src/seal/verify.js local-cases/VELO-001.json | grep -E "bundle hash|fingerprint"
node scripts/run-case.mjs VELO-001 --seal
node dist/src/seal/verify.js local-cases/VELO-001.json | grep -E "bundle hash|fingerprint"
```

```
bundle hash:          853f8e8655654b418eb47936295ad09db739d45939d02c63e670caabf8e08500
analysis fingerprint: 92d1b18a173b4f48bc999dbb64743348251c3b23ea959b2176334eb56174b2fc

bundle hash:          f4d824f0e32b7a3a98228a18175470f90c0f8768ace04efb4971f02ba28f1cbb   <- distinto
analysis fingerprint: 92d1b18a173b4f48bc999dbb64743348251c3b23ea959b2176334eb56174b2fc   <- idéntico
```

Ese es el diseño de dos hashes funcionando. El **fingerprint** identifica al
análisis, así que volver a correr el motor sobre la misma evidencia lo
reproduce exacto — eso es lo que hace que otro pueda chequear el veredicto. El
**bundle hash** identifica a esta ejecución en particular, así que incluye el
timestamp del sellado y la cadena de custodia, y cambia siempre. Confundirlos
haría imposible demostrar reproducibilidad: nunca podrías distinguir "el mismo
análisis, corrido de nuevo" de "otro análisis".

**2. El bundle es internamente consistente.** `dist/src/seal/verify.js` no
importa nada de este proyecto ni de npm — solo `node:crypto` y `node:fs`. Se lo
podés dar al perito de la contraparte con el bundle y nada más:

```bash
node dist/src/seal/verify.js local-cases/VELO-001.json
```

Recomputa los dos hashes y recorre cada eslabón de custodia. Imprime
`internally consistent`, nunca `valid`: quien lee "válido" entiende
"auténtico", y esto establece algo estrictamente más débil.

**3. La atestación existe on-chain.** Gratis, desde cualquier lado:

```bash
node scripts/verify-chain-read.mjs
```

O desde un explorer que nadie acá controla:
[preview.midnightexplorer.com/contracts/0x46cac58c…023d9d](https://preview.midnightexplorer.com/contracts/0x46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d)

**4. El commitment on-chain NO se puede recomputar desde el bundle — y es a
propósito.**

El commitment es
`persistentHash([dominio, fingerprint, custodyTip, verdict, corroborationCount, salt])`.
Un bundle te da cinco de esos seis. El **salt** es un valor de 32 bytes por
caso que nunca sale de la máquina del perito, y sin él el hash no se puede
reproducir.

Ese es todo el punto. Los otros cinco son públicos o adivinables: el separador
de dominio está en el código, el veredicto está en el ledger, la cuenta de
corroboración es un número menor a 18. Si el salt se publicara, cualquiera
podría hashear una tupla candidata y *confirmar* si es la que está detrás de un
commitment dado. El commitment dejaría de ocultar nada.

Así que el vínculo entre "este bundle sellado" y "ese commitment on-chain" no
es algo que un tercero recomputa. Es lo que **establece la prueba de
conocimiento cero**: que quien atestó conocía una preimagen que satisface las
restricciones del circuito, incluida la compuerta Daubert. Poder recomputarlo
vos misma significaría que la propiedad de privacidad ya falló.

Lo que sí se verifica de forma independiente, entonces: que el análisis es
reproducible, que el bundle es autoconsistente, que existe una atestación en
una cadena pública con un veredicto, y —ver §4— que la compuerta rechaza un
`MALICE` forzado. Lo que no se verifica por recomputación, por diseño, es qué
caso está detrás de qué commitment.

## 6. Si algo se rompe

| Síntoma | Causa |
|---|---|
| `Cannot find module '../dist/...'` | Te salteaste `npm run build`, o `npm run clean` lo borró |
| El frontend no resuelve `velo/*` | Corriste `npm install` dentro de `frontend/`. Borrá `frontend/node_modules` y corré `npm install` en la raíz |
| Un script de verificación "pasa" al instante sin imprimir nada | Revisá el runtime — F16 y el chequeo del salt son sensibles al runtime a propósito |
| `Insufficient Funds: could not balance dust` | No son fondos. El NIGHT tiene que estar *registrado* para generar dust. [CHAIN.md](./CHAIN.md) |
| `1010: ... Custom error: 170` | Estado de DUST viejo, no un desajuste de versiones. Volvé a correrlo. [CHAIN.md](./CHAIN.md) |

Dónde vive cada cosa: [`docs/STRUCTURE.md`](./STRUCTURE.md).

---

## 7. Reproducir lo que corrimos

Todo, en orden, con lo que prueba cada paso. Los pasos 1–4 solo necesitan Node.
Los pasos 5–9 necesitan Bun, el proof server y una billetera — todo eso se
configura en [§5](#escribir--atestiguar-un-caso-con-la-billetera).

Se reproducen dos cosas independientes: el **camino feliz** (un caso sellado
localmente, probado, atestiguado en una red real, leído de vuelta por un
extraño) y la **sonda adversarial** (el mismo contrato rechazando una atestación
que el motor nunca podría haber producido). Ninguna vale mucho sin la otra: un
sistema que solo sabe decir que sí no fue puesto a prueba.

### Pasos 1–4: sin billetera

```bash
git clone https://github.com/annatchijova/velo.git && cd velo
npm install && npm run build
```

**1. El motor es determinista y el corpus coincide con él.**

```bash
npm test                      # -> # pass 115 / # fail 0
node scripts/run-case.mjs     # -> los 14 reproducen su veredicto documentado
```

**2. Un veredicto se gana, no se declara.** Misma evidencia limpia, resultado
opuesto, porque un caso declara lo que nunca llegó a mirar:

```bash
node scripts/run-case.mjs VELO-010    # -> NOISE
node scripts/run-case.mjs VELO-014    # -> ABSTAIN
```

**3. Un bundle sellado lo puede chequear alguien que no confía en este repo.**

```bash
node scripts/run-case.mjs VELO-001 --seal
node dist/src/seal/verify.js local-cases/VELO-001.json
# -> internally consistent: YES
```

**4. El contrato está desplegado y su ledger es público.** Sin billetera, sin
claves, sin comisiones:

```bash
node scripts/verify-chain-read.mjs
# -> attestationCount : 2, las dos MALICE
```

Si parás acá, verificaste todo salvo la *escritura* en cadena.

### Pasos 5–9: con la billetera

Configurá Bun, el proof server y las tres variables de entorno según
[§5](#escribir--atestiguar-un-caso-con-la-billetera), y después:

```bash
export MIDNIGHT_NETWORK_ID=preview
export MIDNIGHT_STORAGE_PASSWORD='elegí-un-secreto-real'
export MIDNIGHT_WALLET_MNEMONIC="palabra1 palabra2 ... palabra24"
```

**5. Registrar NIGHT para generar DUST.** Una vez por billetera, y atestiguar
pronto después:

```bash
bun run deploy/register-dust.ts
```

**6. El camino feliz — atestiguar un caso real en `preview`.** VELO-001 es
`MALICE` con cuatro fuentes independientes que corroboran, así que pasa la
compuerta honestamente:

```bash
node scripts/run-case.mjs VELO-001 --seal
bun run deploy/attest-case.ts VELO-001
```

Unos minutos: sincronización de billetera, y después generación de la prueba ZK
en tu proof server local. Imprime el id de transacción y la altura de bloque, y
no el salt.

**7. Leer tu propia atestación de vuelta, como lo haría un extraño.**

```bash
node scripts/verify-chain-read.mjs
```

`attestationCount` subió en uno y tu commitment está en la lista. Esa lectura no
usó billetera, ni claves, ni comisiones — que es el punto: cualquiera puede
chequearlo, y nadie aprende nada sobre la evidencia.

Confirmalo de forma independiente en un explorador de bloques que no
controlamos:
**[preview.midnightexplorer.com/contracts/0x46cac58c…023d9d](https://preview.midnightexplorer.com/contracts/0x46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d)**

**8. La guarda de replay.** Corré la misma atestación otra vez:

```bash
bun run deploy/attest-case.ts VELO-001
# -> failed assert: this attestation already exists
node scripts/verify-chain-read.mjs
# -> attestationCount SIN CAMBIOS
```

El salt se guarda por caso, así que el mismo análisis recalcula el mismo
commitment, y el contrato se niega a registrarlo dos veces. Red team G2. Sin
esto podrías fabricar la apariencia de corroboración independiente pagando la
comisión dos veces.

Correlo desde el mismo directorio y con el mismo `MIDNIGHT_STORAGE_PASSWORD`
que el paso 6, o este paso no prueba nada en silencio — ver la nota en
[§5](#dos-cosas-que-van-a-parecer-errores-y-no-lo-son). El `attestationCount`
sin cambiar es el resultado, no el mensaje de error.

**9. La sonda adversarial — la que importa.** Forzar `MALICE` con una sola
fuente que corrobora, directo contra el circuito desplegado:

```bash
bun run deploy/attest-forced-malice.ts VELO-001
```

```
Refused by the circuit's own assert:
  "failed assert: MALICE requires at least 2 independent corroborating
   sources — the Daubert gate"

PREDICTION HELD — MALICE from one source cannot be attested.
```

Leé qué hace ese comando antes de correrlo: es corto, y el bypass es todo el
argumento. El motor no puede emitir ese estado (`scorer.ts` degrada `MALICE` a
`SUSPICION` por debajo de dos fuentes) y `attest-case.ts` se niega localmente,
así que la sonda sobreescribe el witness de corroboración para que devuelva `1`
mientras pasa `MALICE` como argumento público. **Solo se falsea el conteo** — un
bundle que además mintiera sobre su fingerprint fallaría por otro motivo y no
probaría nada sobre corroboración. No queda nada entre la llamada y el circuito.

No cuesta nada: el assert dispara durante la ejecución del circuito, antes de
probar y antes de balancear ninguna comisión. Sale **distinto de cero si la
cadena acepta** la atestación forzada, y en ese caso dice que
[`TECHNICAL_STATUS` §2.2](./TECHNICAL_STATUS.md) es falso tal como está escrito
— un experimento que solo puede confirmar no es un experimento. También
distingue "rechazado por la compuerta" de "rechazado por otra cosa", así que un
fallo de dust o de red no puede leerse como resultado verde.

### Qué vas a haber mostrado

| Paso | Afirmación |
|---|---|
| 1 | El motor es determinista y el corpus no es decorativo: corre |
| 2 | Una brecha de cobertura degrada un hallazgo *negativo*. Ausencia de evidencia no es evidencia de ausencia |
| 3 | Un bundle sellado es chequeable sin confiar en este repositorio |
| 4 | El contrato está vivo en `preview` y es legible por cualquiera, gratis |
| 6–7 | La ruta de escritura completa funciona de punta a punta contra una red real |
| 8 | Las atestaciones no se pueden repetir para fingir corroboración |
| 9 | **La regla de admisibilidad es una restricción criptográfica, no una nota de política** |

El paso 9 es el que hay que mostrar. Todo lo demás es un sistema funcionando; el
paso 9 es un sistema negándose.

---

## 8. Los 14 casos on-chain, bloque por bloque

Copiar y pegar, de a un bloque. Cada uno sella el caso localmente, lo atestigua
en `preview`, y lee el ledger de vuelta para que veas `attestationCount` subir
exactamente uno.

**Antes de empezar**, una vez por sesión:

```bash
export MIDNIGHT_NETWORK_ID=preview
export MIDNIGHT_STORAGE_PASSWORD='elegí-un-secreto-real'
export MIDNIGHT_WALLET_MNEMONIC="palabra1 palabra2 ... palabra24"
unset MIDNIGHT_WALLET_SEED

docker start midnight-proof-server 2>/dev/null || \
  docker run -d --name midnight-proof-server -p 6300:6300 midnightntwrk/proof-server:8.1.0

npm run build
bun run deploy/register-dust.ts     # una vez por billetera
node scripts/verify-chain-read.mjs  # anotá el attestationCount inicial
```

**Leé esto antes de correr los 14.** Cada bloque es una transacción real: gasta
DUST y tarda unos minutos, la mayor parte sincronización de billetera y
generación de la prueba ZK. Catorce son más o menos una hora, y la billetera
tiene que seguir con fondos todo ese rato. **De a uno** — dos atestaciones en
vuelo desde la misma billetera es la forma de producir un fallo por dust viejo.
Si solo querés ver el mecanismo funcionando, los bloques 001, 010 y 014 cubren
MALICE, NOISE y ABSTAIN, que es todo el rango de veredictos.

Los 14 atestiguan limpio: todos los casos `MALICE` del corpus tienen al menos
dos fuentes que corroboran, así que ninguno hace saltar la compuerta Daubert.
Hacer que salte a propósito es [§4](#la-compuerta-daubert-completa).

Volver a correr un bloque que ya hiciste va a dar la guarda de replay en lugar
de atestiguar dos veces — eso es [§7 paso 8](#7-reproducir-lo-que-corrimos), y
la nota de ahí sobre la contraseña de almacenamiento aplica.

**VELO-001 — The Pawn Sacrifice** · `MALICE`, 4 que corroboran

```bash
node scripts/run-case.mjs VELO-001 --seal
bun run deploy/attest-case.ts VELO-001
node scripts/verify-chain-read.mjs
```

**VELO-002 — The Uniform Log Auction** · `SUSPICION`, 1 que corroboran

```bash
node scripts/run-case.mjs VELO-002 --seal
bun run deploy/attest-case.ts VELO-002
node scripts/verify-chain-read.mjs
```

**VELO-003 — The False Flag** · `MALICE`, 2 que corroboran

```bash
node scripts/run-case.mjs VELO-003 --seal
bun run deploy/attest-case.ts VELO-003
node scripts/verify-chain-read.mjs
```

**VELO-004 — The Broken Chain** · `ABSTAIN`, 0 que corroboran

```bash
node scripts/run-case.mjs VELO-004 --seal
bun run deploy/attest-case.ts VELO-004
node scripts/verify-chain-read.mjs
```

**VELO-005 — The Four-Source Convergence** · `MALICE`, 3 que corroboran

```bash
node scripts/run-case.mjs VELO-005 --seal
bun run deploy/attest-case.ts VELO-005
node scripts/verify-chain-read.mjs
```

**VELO-006 — The Surgical Void** · `MALICE`, 2 que corroboran

```bash
node scripts/run-case.mjs VELO-006 --seal
bun run deploy/attest-case.ts VELO-006
node scripts/verify-chain-read.mjs
```

**VELO-007 — The Ventriloquist** · `MALICE`, 2 que corroboran

```bash
node scripts/run-case.mjs VELO-007 --seal
bun run deploy/attest-case.ts VELO-007
node scripts/verify-chain-read.mjs
```

**VELO-008 — The Altered Mise en Place** · `MALICE`, 2 que corroboran

```bash
node scripts/run-case.mjs VELO-008 --seal
bun run deploy/attest-case.ts VELO-008
node scripts/verify-chain-read.mjs
```

**VELO-009 — The False-Layman Bait** · `SUSPICION`, 1 que corroboran

```bash
node scripts/run-case.mjs VELO-009 --seal
bun run deploy/attest-case.ts VELO-009
node scripts/verify-chain-read.mjs
```

**VELO-010 — A Normal Day at the Office** · `NOISE`, 0 que corroboran

```bash
node scripts/run-case.mjs VELO-010 --seal
bun run deploy/attest-case.ts VELO-010
node scripts/verify-chain-read.mjs
```

**VELO-011 — The Two Badges** · `SUSPICION`, 1 que corroboran

```bash
node scripts/run-case.mjs VELO-011 --seal
bun run deploy/attest-case.ts VELO-011
node scripts/verify-chain-read.mjs
```

**VELO-012 — The Quiet Resignation** · `SUSPICION`, 1 que corroboran

```bash
node scripts/run-case.mjs VELO-012 --seal
bun run deploy/attest-case.ts VELO-012
node scripts/verify-chain-read.mjs
```

**VELO-013 — The Anonymous Drop** · `ABSTAIN`, 0 que corroboran

```bash
node scripts/run-case.mjs VELO-013 --seal
bun run deploy/attest-case.ts VELO-013
node scripts/verify-chain-read.mjs
```

**VELO-014 — What Was Never Looked At** · `ABSTAIN`, 0 que corroboran

```bash
node scripts/run-case.mjs VELO-014 --seal
bun run deploy/attest-case.ts VELO-014
node scripts/verify-chain-read.mjs
```

Después, el conjunto entero es legible por cualquiera, sin billetera:

```bash
node scripts/verify-chain-read.mjs
```

Y confirmalo en un lugar que no corre nada del código de este repositorio: un
explorador de bloques de terceros, leyendo la misma cadena pública.

**[preview.midnightexplorer.com/contracts/0x46cac58c…023d9d](https://preview.midnightexplorer.com/contracts/0x46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d)**

Tus atestaciones aparecen ahí como llamadas a `attest` sobre el contrato. Ese
es el chequeo que vale la pena mostrarle a alguien: no depende de confiar en
nada que hayamos escrito nosotros.

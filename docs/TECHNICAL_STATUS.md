# VELO — Technical Status

**Zero-knowledge forensic attestation on Midnight**
v0.1.0 · status as of 2026-08-07

> The verdict is visible. The victim is not.

---

## 0. How to read this document

Every claim below is either **verified** (we ran it and read the output), a
**code fact** (read in the exact shipped source, not from memory or from a
document describing it), or **explicitly marked as not yet established**. That
distinction is not decoration — it is the same epistemic ladder the project's
own six red team rounds run on, and applying it to our own status report is
the only version of this document that would survive being checked.

Where a number comes from a specific artifact in the repository, the artifact
is named. Where we could not verify something, this document says so instead of
rounding it up.

**The one thing to take from this page:** VELO is not a demo that renders a
verdict. It is a system with *provable properties* — determinism, tamper
evidence, and a legal admissibility rule enforced as a cryptographic constraint
rather than a promise — and a contract deployed to Midnight's live `preview`
network. The properties are the product. The UI is how you look at them.

---

## 1. What exists, and is running

| | Status |
|---|---|
| Compact ZK contract, compiled | **Yes** — `compact` 0.5.1 / `compactc` 0.31.1, exit 0, real prover and verifier keys for both circuits |
| Contract deployed to a live network | **Yes** — Midnight `preview`, address `46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d` |
| Deterministic forensic engine | **Yes** — 5 detectors, exact rational arithmetic, no floats on the decision path |
| Local sealing + hash-chained custody | **Yes** — canonical serialization v2, two-hash bundle, ISO/IEC 27037-derived event vocabulary |
| Dependency-free offline verifier | **Yes** — `node:crypto` + `node:fs` only, runs without npm, re-checks the admissibility gate independently |
| MCP server (wallet-shaped tool surface) | **Yes** — `list_my_cases`, `get_case`, `seal_case`, `verify_commitment`, `attest_case` |
| Local-first frontend (Next.js 15 / React 19) | **Yes** — landing, wallet connect (Lace + 1AM via DApp Connector v4), case ledger, live engine run, seal → attest → verify, adversarial tamper demo |
| Synthetic corpus with zero PII | **Yes** — 14 cases across all four verdicts, 6 expert-witness profiles |
| Absence of evidence is distinguished from evidence of absence | **Yes** — declared coverage gaps degrade a *negative* finding to `ABSTAIN` and are sealed into the fingerprint. See §3.10 |
| Adversarial audit of our own system | **Yes** — 6 red team rounds, 35 findings, 11 attack vectors executed and defeated |
| The Daubert gate holds against a direct attack | **Yes** — `deploy/attest-forced-malice.ts` forced `MALICE` with one source straight at the deployed circuit, bypassing the engine and every application check. Refused by the circuit's own assert. See §2.2 |
| End-to-end proof against the deployed contract | **Yes** — a sealed case was proved and attested on `preview`; commitment `632dbf0159cb6df7360507b1c01cc2a62d26035cb20e56b57e7bae0ce8fb3b2b` records `MALICE`, readable by anyone. Via the CLI (`deploy/attest-case.ts`); the browser-signed path is **not** built. See §5 |
| Reading the ledger back | **Yes** — `GET /api/chain`, MCP `chain_status` / `lookup_commitment`, and `scripts/verify-chain-read.mjs`. No wallet, keys or fees needed to read |

---

## 2. Track A — platform depth: what the circuit actually binds

### 2.1 The commitment binds six elements, not three

The single most common way a ZK attestation system is hollow is that the
commitment covers the *surroundings* of the claim but not the claim itself. The
shipped circuit computes:

```
commitment = persistentHash<Vector<6, Bytes<32>>>([
    pad(32, "velo:attestation:v1"),   // domain separator
    bundle_fingerprint,               // the analysis
    custody_tip,                      // the chain of custody
    verdict        as Field as Bytes<32>,
    corroborationCount as Field as Bytes<32>,
    salt                              // 32 CSPRNG bytes, per case
])
```

An earlier version of this contract hashed only `[fingerprint, tip, salt]`,
leaving `verdict` a free public argument and `corroborationCount` an unbound
witness. That version was **vacuous in exactly the way that matters**: a
legitimately sealed `NOISE` analysis could have been attested on-chain as
`MALICE`. We found it ourselves, during red team round 1 (finding **F3**,
addendum after compilation), and widened the hash. The verdict is now inside
the thing it claims to prove.

### 2.2 The admissibility rule is a circuit constraint, not a policy note

VELO's corroboration gate — inspired by the *Daubert* standard for expert
testimony — is not a check the application performs and then reports on. It is
an `assert` inside the proving circuit:

> A `MALICE` verdict cannot be attested without `corroboration_count >= 2`.

An attempt to attest `MALICE` from a single source does not produce a rejected
transaction. **It fails to produce a proof at all.** There is no code path, no
admin override, and no flag that gets you a valid `MALICE` attestation from one
source, because the constraint is part of what "valid proof" means here.

This is the difference between a rule and a guarantee, and it is the reason the
gate lives in the circuit instead of in `scorer.ts`.

**VERIFIED BY INDUCTION, not asserted (2026-08-08).** This is the project's
most load-bearing sentence, so it was the one claim that should not rest on
reading the source. `deploy/attest-forced-malice.ts` attacks it directly
against the deployed contract on `preview`, bypassing every application-level
check: the engine cannot emit this state at all (`scorer.ts` degrades `MALICE`
to `SUSPICION` below two sources) and `attest-case.ts` refuses locally, so the
probe overrides `corroborationCountWitness` to return `1` while passing
`MALICE` as the public argument. Only the count is forged — a bundle also
lying about its fingerprint would fail for a different reason and prove
nothing about corroboration. Nothing is left between the call and the circuit.

The prediction was stated before running, and the transaction was refused by
the circuit's own assert:

```
failed assert: MALICE requires at least 2 independent corroborating sources — the Daubert gate
```

The probe reports either outcome and exits non-zero if the chain *accepts* the
forced attestation, stating that this section is false as written — an
experiment that can only confirm is not an experiment. It also distinguishes
"refused by the gate" from "refused for some other reason", so a dust or
network failure cannot read as a green result.

### 2.3 Replay protection

Round 2 (finding **G2**) found that re-attesting an identical
`(fingerprint, tip, verdict, count, salt)` tuple re-inserted into
`caseVerdicts` and inflated `attestationCount` — a way to manufacture the
appearance of independent corroboration by paying the fee twice. The contract's
own comment at the time said "KNOWN, NOT FIXED". It is now fixed, in one line
that is the entire point of the finding:

```compact
assert(!caseVerdicts.member(disclose(commitment)), "this attestation already exists");
```

### 2.4 The dual-ledger boundary is compiler-enforced

| | Public (on-chain, forever) | Private (witness, never leaves the machine) |
|---|---|---|
| Contains | `commitment`, declared verdict, `attestation_count`, `case_commitment` | `bundle_fingerprint`, `custody_tip`, verdict detail, `corroboration_count`, `secret_salt` |
| Who can read it | Anyone | Nobody but the examiner |

Nothing crosses that line unless the contract author marks it with
`disclose()`. This is not a convention we follow — it is a compile error if we
don't.

The four private witnesses are `bundleFingerprint(): Bytes<32>`,
`custodyTip(): Bytes<32>`, `bundleSalt(): Bytes<32>`, and
`corroborationCountWitness(): Uint<0..17>`. The salt is 32 bytes from a CSPRNG,
generated once per case and never reused across cases — reuse would make two
different cases produce byte-identical public commitments.

### 2.5 What we chose *not* to do, and why the reasons are closed

**We do not compute the commitment in TypeScript.** `persistentHash` is not
SHA-256, and the `pad(32, ...)` domain encoding and `Field → Bytes<32>` cast are
neither exported nor documented. Reimplementing them from guesswork would give
us a number that looks right and is wrong. The frontend's
`src/lib/contract.ts` therefore carries a *labelled placeholder* that says
plainly it will produce different bytes than the compiled circuit — an honest
seam, not a simulated chain interaction.

**We do not store evidence on IPFS or Arweave.** Two closed reasons: (a)
encryption today is not privacy forever, and publishing a victim's encrypted
evidence to a permanent public network is a bet that today's cryptography holds
indefinitely; (b) if a court orders evidence destroyed, a file on a permanent
p2p network cannot be deleted. Only the commitment and the proof travel.

**We do not use facial recognition or any biometrics.** Biometrics answers
"is there a real person here", which is legally near-useless on its own. The
question a judge is actually asking is "is this person *authorized* to issue
this analysis" — that is a credential check. Adding a face would also add a
permanent, non-revocable secret to a system whose entire premise is minimizing
those. Full argument in `IDENTITY.md`.

### 2.6 We hit three real Midnight platform walls and documented all three

These are in `LEARNINGS.md` because "we understood the platform on the first
try" is not a claim this project gets to make honestly.

- **L1 — `Insufficient Funds: could not balance dust` on a fully funded
  wallet.** Fees on Midnight are paid in DUST; DUST is not a faucet token, it is
  *generated* by NIGHT that has been explicitly registered for dust generation.
  The deploy dependency has the function for it, its own doc comment says it is
  required, and `deployMidnightContract` never calls it — its wallet setup waits
  only on the shielded balance and discards the dust balance it computes. We
  found this by downloading the real published tarball of
  `@effectstream/midnight-contracts@0.103.2` from npm and tracing the call path,
  not by guessing harder at the message. Fix: a standalone
  `deploy/register-dust.ts`. Confirmed live — dust went from `0` to
  `1127246784999999999` after one registration transaction.
- **L3 — `1010: Invalid Transaction: Custom error: 170`.** The published forum
  answer for this error is a ledger version bump. That was true for its author
  and false for us. Error 170 is `InvalidDustSpendProof` — the node rejected the
  **DUST fee proof**, not the contract deploy proof. Every component already
  matched Preview's compatibility matrix (compiler 0.31.1, runtime 0.16.0,
  midnight-js 4.1.1, compact-js 2.5.1, proof server 8.1.0; the `:latest` and
  `:8.1.0` Docker digests are byte-identical, `sha256:801bbc03…`). The actual
  cause was **staleness** — the failing run's dust sync went
  `true → false → false → true` in its final 30 seconds, so the spend proof
  referenced a merkle root being superseded. **Nothing was changed between the
  failed run and the successful one three minutes later.** Standing advice
  extracted: register dust, then deploy promptly.
- **A near-miss worth recording.** The instinct was to `docker rm -f` the proof
  server and re-pull. Two one-minute checks stopped it: the digest comparison
  showing `:latest` *was* `8.1.0`, and recognising that the container's alarming
  `created=1970-01-01T00:00:01Z` is a reproducible-build epoch stamp (standard
  for Nix-built images), not an ancient pull. Deleting a healthy container would
  have cost far more and fixed nothing.

---

## 3. Track B — engineering rigor: the properties, and how they are held

### 3.1 Determinism is enforced, not hoped for

A verdict threshold compared with floating point is a verdict that can differ
between machines. So there are no floats anywhere on the decision path.

`Fraction` is exact rational arithmetic over `bigint`: numerator and
denominator kept in lowest terms, sign normalized onto the numerator,
`gcd(0,0)` guarded so it can never yield zero. Addition cross-multiplies;
**comparison cross-multiplies and never divides**, so there is no rounding step
anywhere between the evidence and the verdict. `toDisplayString()` exists and
carries the comment *"Only for display — never for a decision."*

The constants, verbatim from `scorer.ts`:

```ts
const MALICE_THRESHOLD = new Fraction(33, 100);
const NOISE_CEILING    = new Fraction(8, 100);
const MIN_CORROBORATION_FOR_MALICE = 2;
```

Detector weights are `1/4, 1/4, 3/10, 1/5, 1/5` — maximum possible score
`6/5`. Two structural consequences fall straight out of the arithmetic, and
neither is enforced by an `if`:

- The largest single detector weight is `3/10 = 0.30`, which is **below** the
  `33/100` malice threshold. `MALICE` therefore structurally requires at least
  two *different detector categories* to fire, on top of the two independent
  sources the gate demands.
- The threshold comparison is `greaterThan` — strictly greater. Exactly
  `33/100` is not enough.

### 3.2 Fail-closed is the default, in five independent places

- **No custody, no verdict.** `score()` short-circuits to `ABSTAIN` *before any
  detector output is consulted* if the custody chain fails. `custodyValid` is
  **derived, never asserted** by a caller (`custodyCheck.valid && events.length > 0`)
  — zero custody events means `ABSTAIN` regardless of what the evidence shows.
  `ABSTAIN` is deliberately not a verdict; it is the engine declining to rule.
- **Unscrutinized `MALICE` is downgraded.** Score over threshold, corroboration
  satisfied, but an empty devil's-advocate field → the verdict degrades to
  `SUSPICION`. We do not publish a malice finding nobody argued against.
- **Missing secrets throw.** `MIDNIGHT_STORAGE_PASSWORD` has no default. It used
  to have one (`"velo-local-dev-password-16"`, in a public repo, protecting a
  local signing-key store) until red team round 4 finding **F17**. Fail closed on
  a missing secret; never silently substitute a public one.
- **Malformed input yields a sentence, not a stack trace.** The offline verifier
  validates shape at the boundary and exits non-zero — it never reaches
  `valid: true` by accident (finding **F12**).
- **No coverage, no negative finding.** If the analyst declares that a source
  which should have been examined was not, a "nothing found" result degrades to
  `ABSTAIN` and names what was missing. See §3.10.

### 3.3 Canonicalization: built so an opposing expert's reimplementation agrees

This is the least glamorous part of VELO and the one most likely to decide
whether a verdict survives challenge. If a counter-expert reimplements the
verifier in Python and computes a different hash for an intact bundle, they
conclude the evidence was altered. The bug is ours; the consequence is the
victim's.

Canonical form v2 (every canonical string literally begins `v2:`):

- **Type tags**, so different types can never collide: `bigint` gets an `n`
  suffix, strings are NFC-normalized then JSON-quoted, `-0` collapses to `0`.
- **Keys sorted by Unicode code point, not UTF-16 code unit.** Plain
  `Array.sort()` orders astral-plane characters *before* U+E000–U+FFFF, while
  Python, Go and Rust sort them *after*. Finding **F9**: same bundle, different
  hash, in a different language. Fixed by an explicit `compareByCodePoint`.
- **Numbers are rejected, not coerced.** Non-finite throws. Non-integer throws
  (*"use a Fraction or a bigint"*). Integers past 2⁵³−1 throw, because by then
  precision may already be gone (finding **F11**).
- **Two independent canonicalizers, pinned against each other.** The offline
  verifier duplicates this logic deliberately, so it has zero npm dependencies.
  Duplication guarantees drift — the two had *already* diverged on bigint
  handling when we found it (finding **F8**). The fix was not to delete one; it
  was a **conformance suite pinning both to 20 shared vectors**, so drift fails
  a test instead of surfacing in court.
- **Duplicate JSON keys are rejected outright** (finding **F10**). `JSON.parse`
  keeps the last value; other languages keep the first. The same bytes could
  otherwise verify to opposite verdicts depending on who opened the file.

### 3.4 Chain of custody

```
genesis_hash = sha256("VELO_GENESIS:" + caseId)
entry_hash   = sha256(canonicalize({ seq, eventType, timestamp, detail, prevHash }))
```

The genesis is bound to the case identifier by that domain prefix, so a chain
cannot be lifted from one case and grafted onto another. The event vocabulary
is **closed** — `IDENTIFIED, COLLECTED, ACQUIRED, PRESERVED, ANALYZED, SEALED`,
the four named processes of ISO/IEC 27037:2012 plus the two that standard does
not anticipate because it predates cryptographic sealing. That vocabulary is
enforced **at runtime**, not just as a TypeScript type, because types vanish at
runtime and a chain with `eventType: "EVENTO_INVENTADO"` used to verify clean
(finding **F7**). Verification also re-checks that `seq` is consecutive from
zero, that timestamps parse, and that they never run backwards.

**The limitation we wrote a test to prove we have.** A hash chain with its last
N entries deleted is still internally consistent — truncation cannot be caught
by inspecting the chain alone. `pipeline.test.ts` contains a test that asserts
`valid === true` on a truncated chain, *on purpose*, so the gap is visible in
the suite rather than implied in a doc. The real defense is that `custody_tip`
is inside the on-chain commitment: a shortened local chain no longer matches
the published value, and an attacker cannot rewrite the ledger. **The tip is
the anchor point; the ledger is the anchor.**

### 3.5 Two hashes, on purpose

- `analysisFingerprint` — over the deterministic core only, **no timestamp, no
  custody chain**. Re-running the engine on the same evidence reproduces it
  exactly. This is what makes replay verification meaningful.
- `bundleHash` — the core *plus* `sealedAt` and the custody tip. Unique to this
  specific sealing event.

Collapsing these into one hash is the mistake that makes "prove you re-ran it
and got the same answer" impossible.

### 3.6 The model is out of the decision path

No LLM scores, classifies, or decides anything. The scorer is deterministic
arithmetic; the verdict is sealed before any narration happens. This is a
deliberate architecture choice, not an omission: a system whose output is
evidence cannot have a probabilistic component between the input and the
verdict.

### 3.7 Adversarial audit of our own system: six rounds

| Round | Scope | Findings | Result |
|---|---|---|---|
| 1 | Full code sweep — engine, sealing, MCP, store | 13 (**F1–F13**) | 13 fixed |
| 2 | Promise vs. guarantee — do the docs claim what the proof establishes? | 10 entries (**G1–G10**) | 5 fixed, 4 recorded as known limitations, 1 reclassified as business framing |
| 3 | Web / loopback surface | 2 (**F14–F15**) | 1 fixed, 1 attack falsified, 1 architectural gap left open |
| 4 | Deploy tooling and the wallet that holds real value | 3 (**F16–F18**) | 1 mitigated, 2 fixed |

**Totals across the six rounds: 36 entries / 35 findings. 26 fixed, 1
mitigated, 4 documented as standing limitations, 1 attack falsified and kept in
the record, 1 reclassified as business framing rather than a defect, 3 open and documented (round 6). 11 separate
attack vectors were executed and defeated** — including path traversal across six
encodings, chain reordering, mid-chain insertion, chain grafting onto another
case, truncation without rehash, a `MALICE`-from-one-detector attempt, and a
19×19 marker-pair monotonicity sweep that produced **zero violations**.

Selected findings, because the specific ones are the argument:

- **F1 (Critical)** — read/write path traversal via `caseId`, exploited
  end-to-end over the real MCP protocol, not theorized. Fixed.
- **F2 (High)** — the corroboration gate counted *detector categories* instead
  of *independent sources*. A single artifact reached `MALICE` with
  "corroboration 4". Fixed: corroboration now resolves each contributing
  artifact back through its provenance root and de-duplicates.
- **F5 (High)** — we ran the demo corpus through its own engine and **8 of 13
  cases disagreed with their documented verdict.** One correction that came out
  of it: VELO-011's documented verdict moved from `MALICE` down to `SUSPICION`,
  because a single cross-source contradiction from one source cannot clear the
  real gate. Forcing it back to `MALICE` would have been exactly the drift the
  finding was about.
- **F14 (Critical as found)** — cross-origin request forgery on the loopback
  API. Demonstrated in real Chromium via Playwright: a cross-origin form
  auto-submitted from one local port **overwrote a sealed `MALICE` verdict with
  `ABSTAIN`, corroboration 0.** Fixed with a shared strict `Content-Type` check
  returning 415; verified against a live server and by re-running the original
  browser attack.
- **F15** — a prompt-injection attempt against an agent driving `seal_case`.
  The agent resisted: it wrote a real evidence-grounded devil's advocate,
  declined the injected cross-case read, and flagged the injected text as
  untrusted. **Recorded as FALSIFIED, not as CLOSED** — one agent, one model,
  one framing, one run. The architectural gap it targeted (the server validates
  nothing about agent-driven writes) is still listed as open in §5.

### 3.8 Dependency posture: an upgrade taken, and one deliberately not

`next` was upgraded **15.5.7 → 15.5.23** — a patch bump inside 15.5.x — which
cleared roughly thirty advisories including SSRF in Server Actions, RSC cache
poisoning, XSS via CSP nonces, and unauthenticated disclosure of internal
Server Function endpoints. Verified after: typecheck clean, `next build`
succeeds, all routes present.

Two advisories remain (`postcss` path traversal via `sourceMappingURL`,
`sharp`/libvips CVEs). npm's only offered remedy is `next@16.3.0`, a breaking
major. We did not take it, for two stated reasons: neither package sits on a
path that reaches a user's evidence (`postcss` processes only our own CSS;
`sharp` runs in an image optimizer configured with no remote patterns), and a
major framework upgrade the night before a demonstration has failure mode "the
UI does not build and there is no time to find out why." This is written down
in `DEPENDENCY_SECURITY.md` as **a scoped, dated decision — not a claim that
the advisories are harmless.** Next 16 is the first upgrade to attempt before
this runs anywhere real.

### 3.9 Test posture

Frontend work is **mandatory TDD** — failing test first, minimal
implementation, refactor green, full suite before push, and no frontend
implementation may be committed without its test having been written first and
subsequently passing. Vitest + React Testing Library for unit and integration,
Playwright for end-to-end. Three pinned viewports (375 / 768 / 1440), WCAG 2.1
AA contrast, 44×44 px touch targets, `:focus-visible` order,
`prefers-reduced-motion`.

Suite progression through the audit rounds, as recorded at the time:
**9/9 → 14/14 → 34/34 → 41/41 → 38/38 → 53/53 → 58/58 → 125/125** (the one drop is the
retirement of the loopback HTTP server after F14, not a regression; the
coverage-gap and on-chain-read work took it to 58, the VIGÍA port to 115, and
this document's own count gate to 125).
Across both suites the runners report **241
passing tests: 125 in the engine (`npm test`) and 116 in the frontend
(`vitest run` in `frontend/`)**. The two are separate runners, so a green root
suite says nothing about the frontend and vice versa — both numbers are given
because either alone understates the coverage. Earlier versions of this
document estimated the total by hand; §6 records why that estimate was
withdrawn.

---

### 3.10 Absence of evidence is not evidence of absence

The engine used to say two different things with one word.

| What actually happened | What the engine reported |
|---|---|
| We examined everything and found nothing | `NOISE` |
| The log that would have settled it rotated before anyone asked | `NOISE` |
| The second machine was never imaged | `NOISE` |

The first is a finding. The other two are an **unknown**. Reporting them
identically is the exact overclaim this project exists to prevent, committed by
the engine about its own output — and it was verified as real behaviour before
being changed: zero artifacts with a valid custody chain returned `NOISE`.

An analyst can now declare a **coverage gap**: a source that should have been
examined and was not, with the reason. A declared gap degrades a **negative**
finding to `ABSTAIN` and names what was missing:

> Nothing anomalous was found in what was examined, but 2 expected source(s)
> could not be examined: Corporate proxy logs, 8–20 July 2026 (retained for 7
> days and rotated…); USB device history (…). A negative finding is not
> supportable over evidence that was never available.

Three properties make this a mechanism rather than a label:

- **It degrades negatives only.** A corroborated `MALICE` with the same gaps
  stays `MALICE`. An unrelated log rotating does not erase evidence of what *is*
  there. The gap undermines the claim that nothing is there, not the finding.
- **It is declared, never inferred.** The engine cannot know what was never
  collected, so this is a human assertion of the same kind as a custody event.
  A test pins that boundary so nobody later tries to detect it automatically.
- **It is sealed into the analysis fingerprint.** Stripping the gaps to promote
  an `ABSTAIN` back to `NOISE` fails verification — both the fingerprint and the
  bundle hash mismatch. Leaving them outside the commitment would have been the
  same defect as F3, where the custody tip sat outside the hash meant to anchor
  it.

**The demonstration is a controlled pair.** `VELO-010` and `VELO-014` were built
as twins:

| | `VELO-010` | `VELO-014` |
|---|---|---|
| Score | `0/1` | `0/1` |
| Detectors fired | none | none |
| Custody chain | valid | valid |
| Declared coverage gaps | none | 2 |
| **Verdict** | **`NOISE`** | **`ABSTAIN`** |

Identical evidentiary weight, one difference, and the verdict moves. A test
asserts the scores stay identical — without it the pair could drift into
differing for some unrelated reason while still appearing to isolate the
variable — that the reasoning names each missing source, and that withholding
the gaps returns `VELO-014` to `NOISE`.

`VELO-014`'s two gaps are a proxy log that rotated seven days before it was
requested and a registry hive destroyed by a routine IT reimage. Both are
ordinary process, not anyone hiding anything. That is deliberate: the honest
version of this problem is not sabotage, it is a case arriving at the lab three
weeks late.

Note that *evidence of absence* was already handled and always has been —
`log_cleared`, `usn_journal_gap` and `surgical_deletion` are detector markers,
and `VELO-006` ("The Surgical Void") is built on exactly that. What had nowhere
to go was *absence of evidence*.

## 4. The five things you cannot fake in ten hours

If a judge wants one filter for separating a real system from a well-decorated
demo, it is this: **demos accumulate features, engineered systems accumulate
negative results.** Ours are in the repository, dated.

1. **A test written to prove a limitation exists.** `pipeline.test.ts` asserts
   that custody truncation passes local verification. Nobody writes that test to
   look good. It exists so the gap cannot quietly close over.
2. **A mitigation that failed, documented as having failed.** F16's first seed-
   redaction wrapper passed 10/10 under Node, was recorded as MITIGATED, and the
   seed printed in full on the first real deploy — because the deploy runs under
   Bun, which implements `console` natively and bypasses `process.stdout.write`
   entirely. We rewrote the doc to say "failed on first real run" before we
   rewrote the code.
3. **A test that passed while the thing it tested was visibly broken.** Under
   Bun, the verification script printed the seed three times in full and
   directly beneath it asserted `PASS — the raw seed never reaches the stream`.
   It captured output by replacing `process.stdout.write` — the exact mechanism
   Bun bypasses — so the capture array stayed empty, and `!"".includes(seed)` is
   `true`. **A check that observes nothing passes everything.** The fix was to
   stop intercepting: the script now spawns a child process, lets it write to a
   real pipe, and greps the bytes that actually came out — runtime-agnostic by
   construction. Now 10/10 under **both** Bun and Node.
4. **A falsified attack kept in the record.** F15's prompt injection did not
   work. We wrote down that it did not work, and that this does not close the
   question.
5. **A corpus checked against its own engine.** F5 found 8 of 13 demo cases
   diverging from their documented verdict. The corpus that ships is the one
   that survived being run.

---

## 5. What this does *not* establish

Stated as plainly as we can, because a forensic tool that overstates its own
guarantee is the failure mode it exists to prevent.

**In one sentence:** VELO proves that a specific verdict was produced by a
specific process, under specified constraints, and that the resulting
attestation cannot be altered afterward. It does not replace forensic judgment;
it makes forensic judgment auditable.

| Gap | What it means | Where it lives |
|---|---|---|
| **G1 — witness provenance** | A ZK circuit proves a relationship *between the witness values it is given*, not that those values describe anything that happened. A prover who bypasses the normal calling code and hand-supplies witness bytes can produce a valid proof for evidence that was never analyzed. Today that binding exists only in `src/witness/witnesses.ts` — TypeScript, outside the proof. | Roadmap: engine-binary signature verified in-circuit, an accredited-expert credential, or environment attestation |
| **G3 — independence is declared, not proven** | The circuit checks `corroboration_count >= 2`. It does not check that the sources are *independent*; that check runs off-chain in `scorer.ts` and is trusted. Two files carved from the same physical disk can yield count 2. **This survives even if G1 is fully solved.** | Roadmap: source roots as witnesses, pairwise inequality asserted in-circuit |
| **G5 — cross-case linkability** | Attestations from the same wallet are linkable by address, exposing an examiner's case count, verdict distribution and cadence even though no case content leaks. | Interim: per-case address rotation. Real fix: ZK membership credential |
| **G7 — no rule-version binding** | The `>= 2` threshold is hardcoded. If it ever becomes 3, existing on-chain attestations carry no marker of which rule checked them. | Fix: fold `ruleVersion` into the commitment beside the domain separator |
| **G8 — no revocation model** | Not a defect today, because no accreditation credential exists yet. When one ships, a revoked examiner must stop being able to produce valid proofs. | Standard pattern: revocation Merkle tree, non-membership proof at attest time |
| **G10 — devil's advocate is unverifiable** | The gate checks the field is non-empty after trimming. `"x"` passes. **Deliberately not "fixed"** — a keyword heuristic is gameable and would create false confidence, and an LLM grader would put a model back in the decision path. | Roadmap: a structured result whose *shape* is checkable without pretending to verify content |
| **F15 — agent-driven writes are unvalidated server-side** | Nothing on the server checks that a devil's advocate is anchored to real evidence. All resistance in the one tested run came from the calling model's judgment — not a property we can regression-test. | Open architectural gap |
| **Browser-signed attestation** | The full loop (seal → attest → read back) runs against `preview`, but the signature comes from a seed-derived wallet on the analyst's own machine via `deploy/attest-case.ts`. `POST /api/attest` still computes a local commitment: the analyst's 1AM wallet does **not** sign from the UI yet. | Next milestone |
| **Corpus documentation drift** | `CASES.md` documents 10 cases; 14 fixtures ship (VELO-011 through -014 are undocumented there; `cases/README.md` does cover them). An older pre-F5 Spanish fixture set also still sits in the tree and would fail today's canonicalizer. | Housekeeping, tracked |

Separately, and independently of all of the above: VELO does not establish that
the examiner's original analysis was performed honestly. That remains a human
and judicial responsibility, exactly as with any forensic report today. **VELO
removes post-hoc tampering with a sealed verdict. It does not remove a corrupt
examiner at the moment of analysis.**

---

## 6. Numbers, with provenance

| Metric | Value | Source |
|---|---|---|
| Deployed contract address (`preview`) | `46cac58c…73023d9d` | `deploy/managed-shim/velo-contract.preview.json`; deploy log, 2026-08-07 |
| Elements bound into the commitment | 6 | `contracts/velo.compact`, F3 addendum |
| Detectors | 5 | `src/engine/detectors.ts` |
| Malice threshold / noise ceiling | `33/100` / `8/100` | `src/engine/scorer.ts` |
| Minimum independent sources for `MALICE` | 2 | circuit constraint + `scorer.ts` |
| Canonical format version | v2 | `src/seal/canonical.ts` |
| Custody event vocabulary | 6 closed types | ISO/IEC 27037:2012 + `SEALED`, `ANALYZED` |
| Synthetic cases / examiner profiles | 14 / 6 | `cases/`, `peritos-syntetic/` |
| Red team rounds | 4 | `docs/RED_TEAM_ROUND_1–4.md` |
| Findings raised / fixed | 27 / 21 | same |
| Attack vectors executed and defeated | 11 | rounds 1 and 3 discarded-vector tables |
| Conformance vectors pinning the two canonicalizers | 20 | `tests/conformance.test.ts` |
| Marker-pair monotonicity sweep | 19×19, 0 violations | round 1, experiment E14e |
| npm advisories cleared by the Next patch bump | ~30 | `DEPENDENCY_SECURITY.md` |
| Advisories consciously deferred | 2 | same, with dated reasoning |
| Root suite | 125/125 green | `npm test`, 2026-08-20 |
| Frontend suite | 116/116 green | `vitest run` in `frontend/`, 2026-08-20 |
| **Both suites** | **241/241 green** | measured, not derived — `node scripts/count-tests.mjs` |

**Caveat on the test count, withdrawn — and then enforced.** Earlier versions
of this document reported "roughly 83 runtime cases", a figure derived by hand
because the engine corpus test declares one `test(...)` inside a loop over the
case fixtures and several frontend tests use `it.each`. That estimate is no
longer needed: both suites are run and counted. The runners report **125** and
**116**, which is what the table says.

Measuring once was not enough. Between 2026-08-08 and 2026-08-20 this document
kept saying 58 and 44 while both suites roughly doubled, and `README.md`
drifted to a third pair of numbers — three figures, none current. A document
that asserts verifiability cannot be the least verified thing in the
repository. `scripts/count-tests.mjs` now re-measures both suites and fails if
any documented count disagrees with the runners, or if a sentence it is
supposed to police has been reworded out from under it. The number is no
longer something anyone has to remember to update.

**Caveat on elapsed time.** The claim "built in a single build cycle" is
verifiable in git history, not in this document. What this document asserts is
the *state*, not the stopwatch.

---

## 7. What ships next

**Immediately (closing the loop that is already open):**

1. Wire the *interfaces* to the chain interaction the CLI already proves.
   `deploy/attest-case.ts` produces real proofs and a real attestation, but
   `attest_case` (MCP) and `POST /api/attest` still return
   `local_pending_contract`. The remaining work is plumbing, not proving:
   the hard question — does the circuit accept a real proof — is answered.
2. Reconcile `CASES.md` with the 14 shipped fixtures and remove the pre-F5
   Spanish corpus generation from the tree.
3. Fold `ruleVersion` into the commitment (G7) — a small change with a long
   half-life, and much cheaper now than after attestations exist.

**Next layer of the architecture (designed, not yet built):**

4. **Selective disclosure** — a judge with standing requests the underlying
   evidence; the examiner grants or denies explicitly; consent is recorded
   on-chain, the evidence transfer stays off-chain and encrypted to the
   requester. Nothing is disclosed automatically. Later: threshold
   secret-sharing (K-of-N) instead of a single grant/deny.
5. **Anonymous examiner credential** — a Merkle membership proof inside the ZK
   proof, so the circuit can prove *an accredited examiner* attested without
   revealing which one. This is the same mechanism that closes G1's
   authorization half, G5's linkability, and G8's revocation, which is why it is
   the next structural piece rather than three separate ones.
6. **Blind second opinion** — a second examiner attests the same
   `case_commitment` independently; the contract records agreement or
   contradiction without either examiner seeing the other's analysis.

**Before any real-world use:**

7. Source-root binding in-circuit (G3), so independence is proven rather than
   declared.
8. An independent adversarial audit — ours is rigorous and it is still
   self-audit.
9. A production-grade engine validated against a large case corpus, an
   independently published offline verifier, a judge-facing verification panel,
   and a demonstrated bit-for-bit determinism proof, ahead of any mainnet
   deployment.

---

## 8. Four questions a judge will ask

**"It's ten hours old. How can it be serious?"**
Age is not the measure; what is *bound* is the measure. The contract is
deployed, the commitment covers six elements including the verdict itself, the
admissibility rule is a circuit constraint rather than a policy note, and the
system has been attacked six times by its own authors with 35 findings written
down and 26 fixed. Look at what we recorded as broken — that is the part that
takes time and cannot be borrowed.

**"What stops you from just attesting whatever you want?"**
For `MALICE` with one source: the circuit. There is no proof to submit. For the
deeper version of the question — what stops a prover from hand-supplying
witness bytes — nothing yet, and we named it G1 ourselves in round 2 rather
than waiting for you to. The fix is an accredited-examiner credential, and it
is the next structural piece we build.

**"Why not just publish the evidence, or put it on IPFS?"**
Because encryption today is not privacy forever, and because a court can order
evidence destroyed while a permanent p2p network cannot delete it. The
commitment travels; the evidence stays in the custody infrastructure of the
institution holding it.

**"What's the weakest part?"**
That the circuit proves a relationship among the witness values it is handed,
not that an engine ever ran on real evidence (G1) — and that independence of
corroborating sources is declared rather than proven (G3), which survives even
if G1 is solved. Both are in `ARCHITECTURE.md` in the section titled *"What the
proof does and does not establish."* We wrote that section before anyone asked.

---

## Repository map

```
contracts/velo.compact          the circuit — commitment, Daubert gate, replay guard
src/engine/                     fraction, detectors, scorer, evidence  (no floats)
src/seal/                       canonical, custody, bundle, verify     (offline verifier)
src/witness/witnesses.ts        the four private inputs to the proof
src/core/operations.ts          single source of truth shared by MCP, HTTP and CLI
src/mcp/                        wallet-shaped tool surface
src/simulate.ts                 end-to-end demo, including both refusal moments
deploy/                         register-dust, deploy-contract, redact-seed
frontend/                       Next.js 15 · TDD-mandatory · Vitest + Playwright
cases/  peritos-syntetic/       14 synthetic cases, 6 examiner profiles, zero PII
docs/RED_TEAM_ROUND_1–4.md      the adversarial audit
docs/LEARNINGS.md               what we got wrong first and understood second
docs/DEPENDENCY_SECURITY.md     the upgrade taken and the one deliberately deferred
```

---

*Presented 2026-08-08; status verified 2026-08-07. Every finding ID
in this document resolves to a dated section in the repository's own audit
record. Spanish version: `ESTADO_TECNICO.md`.*

# Security Audit — VELO v0.1.0 (Midnight Hack Buenos Aires)
## Red Team — Round 1

**Date:** 2026-08-07 · **Method:** Abductive Engineering (A–D–I) + Red-Team Auditing
**Scope:** the full delivered project — 12 TypeScript sources + 12 compiled JS (`canonical`, `custody`, `bundle`, `verify`, `detectors`, `scorer`, `evidence`, `fraction`, `server`, `store`, `simulate`, `pipeline.test`), a corpus of 13 VELO cases + 6 PERITO profiles, and 9 documents.
**Out of scope (not delivered at audit time):** `contracts/velo.compact`, the HTML frontend. Everything said here about "the on-chain commitment" analyses the *documented design*, not the contract, which could not be audited.
**Baseline:** SHA-256 hashes of the 68 delivered files. Runtime: Node.js v20.20.2, Python 3.12.12. Every experiment declares its prediction **before** observing the result. Baseline verified before attacking: 9/9 suite green, `simulate` end-to-end OK.

> **Remediation status (added after the audit):** all 13 findings were verified against the live code before any patch was applied, then fixed. See the "Status" column and the "What was changed" section at the end. Test suite after fixes: **14/14 green**, plus a re-run of the auditor's own attacks confirming each is now blocked.

---

## Threat model

Every finding is confirmed **under this model**, not in the abstract:

- The attacker **CAN**: call the MCP server's tools (`seal_case`, `get_case`, `verify_commitment`, `list_my_cases`) — that is the designed interface ("an agent can drive the flow conversationally"); control the fields of the artifacts they submit (markers, timestamps, `caseId`); modify the local `bundle.json` between sealing and verification; read all the code (it is open source, and `verify.js` is distributed to judges and opposing experts).
- The attacker **CANNOT** (explicit exclusions): modify the engine code on the expert's machine; compromise the OS; alter a ledger that **does not exist yet** (Capa 2 pending); break SHA-256.
- Trust boundaries crossed: (a) MCP client → expert's filesystem; (b) local bundle file → verdict presented to a judge; (c) caller-declared markers → sealed verdict.

The "judge test": *if a judge asked you to demonstrate that the system's guarantee can never be violated, what would you have to assume?* Audited answer: today you must assume (1) that nobody recomputes SHA-256 over public data, (2) that the caller declares honest markers, and (3) that the Capa 2 promise will be delivered exactly as documented. Findings F1–F4 live in those three assumptions.

## Epistemic legend

**CODE FACT** (read in the code) · **PLAUSIBLE HYPOTHESIS** (deduced, not executed) · **CONFIRMED BY INDUCTION** (experiment run with before/after) · **FALSIFIED** (experiment run, did not hold).

Rule applied: no finding says CONFIRMED without its experiment; vectors that were attempted and failed are in the final table — they are part of the deliverable.

---

## Executive summary

| ID | Severity | Epistemic level | Module | Finding | Status |
|----|----------|-----------------|--------|---------|--------|
| F1 | **Critical** | CONFIRMED | `store.ts` + `server.ts` | Read/write path traversal via `caseId`, exploitable end-to-end over the real MCP protocol | **FIXED** |
| F2 | **High** | CONFIRMED | `scorer.ts` + `detectors.ts` | The Daubert gate counted *detector categories*, not *independent sources*: **a single artifact reached MALICE with "corroboration 4"** | **FIXED** |
| F3 | **High** | CONFIRMED | `bundle.ts` + docs | What gets committed on-chain (the fingerprint) **excluded the custody chain**: custody truncation was invisible to the planned anchor | **FIXED** |
| F4 | **High** (current build) | CONFIRMED | whole perimeter | With no secret anywhere, **anyone can forge a complete bundle** that `verify.js` accepts with `valid: true`; the word "valid" overpromises "authentic" | **FIXED** (wording + explicit disclaimer) |
| F5 | **High** (demo/credibility) | CONFIRMED | `cases/` ↔ `engine/` | Total corpus↔engine drift: **8/13 cases diverge** from their expected verdict | **FIXED** (from the corpus session) |
| F6 | Medium | CONFIRMED | `detectors.ts` | Temporal detector **fails open** on invalid timestamps (`NaN < x` → silence) | **FIXED** |
| F7 | Medium | CONFIRMED | `custody.ts` | The verifier checks hash linkage, not semantics: accepts invented eventType, non-consecutive `seq`, out-of-order timestamps | **FIXED** |
| F8 | Medium-low | CONFIRMED (drift) / PLAUSIBLE (impact) | `verify.ts` vs `canonical.ts` | Two canonicalizers already diverged (bigint); the "self-contained" design guarantees future drift | **FIXED** (conformance suite) |
| F9 | Medium-low | CONFIRMED | `canonical.ts` | UTF-16 (JS) vs code-point key ordering: an independent verifier in Python computes **a different hash** for the same bundle | **FIXED** (format v2) |
| F10 | Low-medium | CONFIRMED (JS) / PLAUSIBLE (cross-parser) | `verify.ts` | Duplicate JSON keys: the verifier validates the *last* value; the file's bytes are not hashed | **FIXED** |
| F11 | Low | CONFIRMED | `canonical.ts` | Integers > 2⁵³ silently rounded (`isInteger` should be `isSafeInteger`); `-0`/`0` collision | **FIXED** |
| F12 | Low | CONFIRMED | `verify.ts`, `store.ts` | No boundary validation: uncaught exceptions (fail-closed, exit 1, never `valid: true`) | **FIXED** |
| F13 | Medium | CODE FACT (+corroborated in E15) | `server.ts` | `custodyValid: true` hardcoded → ABSTAIN unreachable via MCP; the custody chain is fabricated *after* the analysis, with `now()` | **FIXED** |

**Honest reading of the whole:** the local cryptographic core is solid for what it actually is — a very well-built *self-referential integrity* scheme (and, for 1.5 hours of work, remarkably disciplined). The serious problems were not in the hashes: they were (1) in the only real network surface, which had a trivial path traversal; (2) in the distance between what the system *measures* and what its documents *promise* (independent sources, anti-truncation anchor); and (3) in the demo corpus and the engine having been written by two parallel sessions that never shared a schema contract — the demo does not reproduce its own cases.

---

## Findings

### F1 — Read and write path traversal via `caseId` (store.ts:22,28 → server.ts) — FIXED

**Severity:** Critical · **Level:** CONFIRMED BY INDUCTION (E1 + E15) · **Bucket:** software vulnerability.

- **Surprise:** a system designed so that "nothing leaves the expert's machine" allowed writing arbitrary files outside its working directory just by mis-naming a case.
- **Abduction (rivals considered):** (a) `join()` neutralises `..` — discarded on economy: `path.join("local-cases", "../x.json")` = `local-cases/../x.json`; (b) zod validates `caseId` in the server — discarded by reading `server.ts:73` (`z.string()`, no pattern); (c) the traversal exists and is reachable through the MCP interface. Cheapest, most discriminating test first: call `saveBundle` directly, then end-to-end.
- **Deduction:** if (c), then `saveBundle({caseId: "../escaped"})` writes outside the store, `loadBundle("../secret")` reads outside it, and a `tools/call seal_case` with `caseId: "../pwned"` over real JSON-RPC produces the same effect.
- **Induction:**
  - E1 — `saveBundle` returned `/tmp/velo-poc-e1/escaped.json` (outside `local-cases/`); `loadBundle("../secret")` returned the contents of the external JSON. **Prediction met.**
  - E15 — against the real MCP server (stdio JSON-RPC, dependencies installed from the project's own `package.json`): `seal_case` with `caseId: "../pwned"` → the server answered `"savedTo": "pwned.json"` and the file was written **outside** `local-cases/`. **Prediction met.**
- **Causal chain:**
  ```
  caseId controlled by the caller (any MCP agent)
      ↓ z.string() with no pattern (server.ts:73)
  join(dir, `${caseId}.json`)  (store.ts:22, 28)
      ↓ ".." escapes the store directory
  writeFileSync / readFileSync at an arbitrary path with a .json suffix
      ↓
  write: overwrite any writable .json (e.g. ../package → the project's package.json)
  read:  any .json readable by the process, returned via get_case/verify_commitment
  ```
- **Threat-model precondition:** the attacker can call MCP tools — which is exactly the product's public interface. No prior local access required.
- **Fix applied:** `caseId` validated at the boundary (`z.string().regex(/^[A-Za-z0-9._-]+$/)`) *and* defence in depth in `store.ts` (`resolve()` + prefix check against the store directory), throwing `InvalidCaseIdError` rather than silently sanitising — rewriting a caller's ID would store the bundle under a name they never asked for, which is its own correctness problem in a chain-of-custody system.

---

### F2 — The Daubert gate counted detector categories, not independent sources (scorer.ts:44-50) — FIXED

**Severity:** High · **Level:** CONFIRMED BY INDUCTION (E3) · **Bucket:** design vulnerability (broken system invariant).

- **Surprise:** the rule that justifies the entire project — *"MALICE requires at least two independent corroborating sources"* (README, ARCHITECTURE layer 3, GLOSSARY, and the ZK circuit's claim) — was satisfiable with **a single physical source**.
- **Abduction (rivals):** (a) the scorer counts artifacts — false, read: it counts `detectorResults.filter(fired)`; (b) one artifact can only trigger one category — false, `HAS()` is per marker and markers are free strings from the caller; (c) the "independent sources" claim holds by construction — hypothesis to falsify.
- **Deduction:** if the gate measures categories, then ONE artifact with markers from 4 categories + a non-empty `devilAdvocate` produces `verdict=MALICE, corroborationCount=4`. Discriminating prediction: if (c) were true, the verdict would be SUSPICION.
- **Induction (E3-A):** one artifact (`type:"file"`, a disk image) with markers `["effect_before_cause","surgical_deletion","narrative_poisoning","process_masquerade"]` → observed: `{"verdict":"MALICE","corroborationCount":4,"score":"19/20","detectorsFired":["temporal","anti_forensic","narrative","process"]}`. **CONFIRMED under the threat model where the caller controls the markers** (which is the current design: `markers: z.array(z.string())` at server.ts:30 — any string passes).
- **Secondary finding (E3-B, CONFIRMED):** the temporal detector took the cartesian product cause×effect **without requiring a causal link**: two unrelated artifacts (one with `cause_event` at t₂, another with `effect_event` at t₁<t₂) fired `TEMPORAL_CAUSALITY_VIOLATION`. The "sources" were not merely non-independent: they did not even need to be related.
- **Why High and not "the corrupt expert was already out of scope":** the documentation exempts the system from *an expert who lies in the analysis*, but the claim that travels to the ZK circuit and the pitch is stronger: that the *independence* rule was satisfied. The system had no concept of "source" at all: `Artifact.source` was a free string nobody read. Semiotically, the sign `corroborationCount` produces in the reader (judge, hackathon jury) the interpretant "independent sources", while its object is "detector categories fired". That is symbol abuse in the strict sense.
- **Fix applied:** detectors now report `contributingArtifactIds`; the scorer resolves each contributing artifact to its **provenance root** (first element of `provenanceChain`, falling back to normalised `source`, falling back to the artifact ID) and counts **distinct roots**. Two artifacts carved from the same acquisition count as one source. `detectorCategoriesFired` is still reported — as a separate fact that no longer pretends to be corroboration.

---

### F3 — The planned on-chain commitment did not anchor the custody chain (bundle.ts:50-71 vs ARCHITECTURE layer 2 / GLOSSARY / custody.ts:87-95) — FIXED

**Severity:** High · **Level:** CONFIRMED BY INDUCTION (E12) · **Bucket:** architectural fracture (individually correct module contracts, composition that violates the invariant).

- **Surprise:** `custody.ts` states that "the real defense against truncation is the on-chain commitment", and ARCHITECTURE §custody-chain that "`chain_tip` guards against silent truncation". But what those same documents say is committed on-chain is the **analysis fingerprint** — which *by design excludes* the custody chain and `sealedAt`.
- **Abduction (rivals):** (a) I misread and the fingerprint includes the chain — falsified by reading `deterministicCore` (bundle.ts:50-59: it does not); (b) the `bundleHash` is committed, which does include the tip — contradicted by ARCHITECTURE layer 2 ("The fingerprint — not the raw bundle — is what gets committed on-chain") and GLOSSARY ("This is the value committed on-chain"); `custody.ts:91` says "commitment/bundleHash" — **the documents contradict each other about what is committed**; (c) the contradiction is real and the anti-truncation anchor, as designed, does not exist.
- **Deduction:** if (c), a bundle with its SEALED event truncated and only its `bundleHash` recomputed (public algorithm) keeps **the same fingerprint** and passes `verify.js`.
- **Induction (E12):** honest seal → last 2 events truncated → fingerprint **identical** (observed: `true`), `verifyBundle` → `{"valid":true,"reasons":[]}`, and `verify.js` CLI over the truncated file → `valid: true`, exit 0. **CONFIRMED under the threat model where the attacker modifies the local bundle (and recomputes public hashes).**
- **Honesty nuance:** the truncation limitation *of the chain in isolation* is exemplarily documented by the authors (comment + a test that makes it visible). What was **not** documented is this second level: the anchor they invoke as the defence did not cover the chain. ARCHITECTURE §"The custody chain" also asserted without qualification that `chain_tip` detects truncation — exactly the sentence `custody.ts:93-94` forbids saying in the pitch. The documentation violated its own instruction.
- **Fix applied:** the commitment now binds **both** values. `contracts/velo.compact` takes a third witness (`custodyTip()`) and computes `persistentHash<Vector<3, Bytes<32>>>([fingerprint, tip, salt])`, so truncating custody changes the commitment. `attestationPayload()` in `bundle.ts` exposes exactly the two values the circuit's witnesses must return — deliberately *not* pre-combined into a SHA-256 "commitment", because Compact's `persistentHash` is not SHA-256 and a near-miss value that merely looks like the on-chain one is worse than no function at all.

---

### F4 — No authenticity anchor: a fully forged case the verifier accepts (whole perimeter) — FIXED (semantics)

**Severity:** High in the current build · **Level:** CONFIRMED BY INDUCTION (E11) · **Bucket:** threat-model assumption + semiotic defect.

- **Surprise:** `verify.js` — the tool handed to the judge and the opposing expert "without trusting the rest of the repo" — contains the complete recipe for fabricating what it verifies. There is no secret, signature, MAC or anchor anywhere in the build: everything is `sha256` over public data.
- **Deduction:** with no secret, an attacker who controls `bundle.json` can fabricate a complete case from scratch (plausible ISO 27037 chain, MALICE with 2 "sources", devil's advocate) that passes with exit 0.
- **Induction (E11):** a forgery script that **imports nothing from the project** — it uses functions copied verbatim from `verify.js`. It fabricated `VELO-COURT-EXHIBIT-7`, a non-existent case with a complete custody cycle. `node verify.js` → `valid: true`, exit 0. **CONFIRMED under the threat model where the attacker can modify the local bundle.**
- **Language precision:** I do NOT claim "the seal is forgeable" or "SHA-256 was broken". What is demonstrated is: **a false verdict can be sealed** — the seal works perfectly over a poisoned or non-existent input. The real guarantee of the current build is *internal consistency*, not *authenticity*.
- **Why this is not "already documented, not a finding":** ARCHITECTURE §"What the proof does not establish" and the FAQ do admit "corrupt expert" and that the anchor is Capa 2 (pending). But there is a semiotic gap the documents do not close: `verify.js` printed a bare `valid: true`. The interpretant that sign produces in a judge — "this is authentic" — exceeds its object — "this is self-consistent". In the tool aimed explicitly at non-technical readers, that is the most important word in the system.
- **Fix applied:** the field is now `internallyConsistent`, the CLI prints "internally consistent: YES/NO", and every result carries an explicit `doesNotEstablish` sentence stating that it does not establish who produced the bundle or when, and that authenticity is anchored by the on-chain attestation (not part of this build). The underlying limitation is unchanged — an interim local signature (Ed25519 with the expert's key) remains a candidate until Capa 2 exists.

---

### F5 — Total corpus ↔ engine drift: the demo does not reproduce its own cases — FIXED (from the corpus session)

**Severity:** High (credibility/demo) · **Level:** CONFIRMED BY INDUCTION (E4 + static analysis) · **Bucket:** integration / composition across parallel sessions.

- **Surprise:** CASES.md promises "ten synthetic cases the engine is designed to classify". Actually executed, **8 of 13 diverge** from the expected verdict.
- **Code facts:** the corpus uses 46 markers; **32 do not exist** in the engine's `Marker` union type (`process_injection`, `c2_beacon`, `known_malware_hash`, `orphaned_provenance`, `statistical_uniformity`…). 6 engine markers never appear in the corpus. Field names do not match either: `entropy` (float, e.g. 3.145 — which `canonicalize` would reject) vs `entropyMilliBits` (int); `provenance_chain` vs `provenanceChain`; `case_id` vs `caseId`. PROGRESS_LOCAL confirms the cause: two parallel Claude Code sessions with no shared contract.
- **Induction (E4, field mapping charitable to the corpus):**
  - VELO-005 (the flagship case, "four independent sources converge", expected MALICE corr 4) → **NOISE, corr 0**. All 7 of the case's markers are unknown.
  - VELO-004 and VELO-013 (expected ABSTAIN from a broken custody chain) → **NOISE**. The engine has no provenance detector: the story "a strong hash with no custody is inadmissible" is not implemented — ABSTAIN exists only as an external flag.
  - VELO-003/006/007/008/011 (MALICE) → SUSPICION or NOISE.
  - VELO-002 "matches" SUSPICION but with `corroborationCount=2` where the case declares 1 — it matches for the wrong reason.
- **Fix applied (from the corpus session, closing this out):** every `cases/*.json` artifact rewritten to the real `Artifact` shape (`entropyMilliBits`, `provenanceChain`, markers restricted to the closed 19-value `Marker` union), each case redesigned so its story still holds using only markers the engine actually scores. Where a marker had no honest equivalent (TPM hardware attestation in VELO-005; credential dumping in VELO-003), the artifact was kept for narrative context but documented as *not* contributing to the engine's numeric corroboration, rather than force-mapped onto an unrelated category. Added `custodyEvents[]` per case, deriving `custodyValid` the same way `seal_case` does post-F13 (empty events → ABSTAIN) instead of a bypassable flag. Added `tests/corpus.test.ts`: loads every case, runs it through the live `runAllDetectors`/`score`, asserts verdict + corroborationCount + fracture set. One case (VELO-011, new since the audit) had its documented verdict corrected from MALICE to SUSPICION rather than forced — a single cross-source contradiction from one source structurally cannot clear the corroboration gate, and papering over that would have reintroduced the exact drift this finding is about. `cases/README.md` corrected to match: the "SUSPICION: score > 0.10" line didn't match `NOISE_CEILING = 8/100` in the live code either.
- **Verification:** `npm test` — 13/13 corpus cases pass against the real engine, 34/34 total suite green.

---

### F6 — Temporal detector fails open on invalid timestamps (detectors.ts:28) — FIXED

**Severity:** Medium · **Level:** CONFIRMED BY INDUCTION (E5) · **Bucket:** vulnerability (missing boundary validation).

- **Deduction:** `new Date("garbage").getTime()` = `NaN`; `NaN < x` is `false`; no schema validated ISO 8601 (`timestamp: z.string()` at server.ts:25) → an invalid timestamp silences the comparison.
- **Induction (E5):** an inverted cause/effect pair with valid timestamps → fires (`TEMPORAL_CAUSALITY_VIOLATION`); the same pair with `timestamp: "not-a-date"` on the effect → **does not fire, no error, no log**. CONFIRMED: silent fail-open.
- **Fix applied:** `z.string().datetime({ offset: true })` at the boundary, *and* the detector fails closed independently — an unparseable timestamp now raises its own `TIMESTAMP_UNPARSEABLE` fracture, which is forensically interesting in its own right: an unreadable timestamp on evidence *is* an anomaly.

### F7 — The custody verifier validated hashes, not semantics (custody.ts:97-118) — FIXED

**Severity:** Medium · **Level:** CONFIRMED BY INDUCTION (E10) · **Bucket:** declared invariant not enforced.

- `custody.ts:4-8` declares a "closed vocabulary" derived from ISO/IEC 27037. **Induction (E10):** a chain with `eventType: "EVENTO_INVENTADO"`, `seq` = 0,1,42 and timestamps in reverse chronological order → `verifyCustodyChain` → `valid: true, "All links verified independently."` The closed vocabulary was a comment, not a construction: the TS type is erased at runtime, and the standalone verifier — the judge's tool — did not even know the vocabulary existed.
- **Fix applied:** both copies now enforce `eventType ∈ CUSTODY_EVENT_TYPES`, `seq === index`, parseable timestamps, and non-decreasing chronology.

### F8 — Two canonicalizers, already diverged (verify.ts:49-66 vs canonical.ts:35-69) — FIXED

**Severity:** Medium-low · **Level:** drift CONFIRMED BY INDUCTION (E13); impact PLAUSIBLE HYPOTHESIS · **Bucket:** maintenance fracture.

- The "deliberately self-contained" verifier copies `canonicalize` instead of importing it. **They had already diverged:** `canonical.ts` accepted `bigint` (`5n` → `"5n"`); the copy in `verify.ts` threw `unsupported type bigint` (E13, both branches executed). Reachability today is low (JSON does not carry bigint) — hence impact stays a hypothesis. But the direction is guaranteed: every future change to `canonical.ts` requires remembering to hand-sync the copy whose whole reason for existing is *not* depending on the original.
- **Fix applied:** `tests/conformance.test.ts` pins both implementations against a shared vector set (including astral-plane keys and every rejection case), so drift fails a test instead of silently producing two different hashes for one bundle. The duplication is kept — it is the price of the no-dependencies property for the judge's tool — but it is now guarded.

### F9 — UTF-16 vs code-point key ordering: an independent verifier computes a different hash (canonical.ts:64) — FIXED

**Severity:** Medium-low · **Level:** CONFIRMED BY INDUCTION (E8) · **Bucket:** canonical specification defect.

- `Object.keys(record).sort()` orders by UTF-16 code units. Astral-plane characters (emoji, CJK ext-B) compare as surrogate pairs. In almost every other language, `sorted()` orders by code point. **Induction (E8):** the object `{"😀":1,"":2,"normal":3}` canonicalises in Node as `v1:{"normal":3,"😀":1,"":2}` (sha256 `a091…`) and in a reasonable Python reimplementation as `v1:{"normal":3,"":2,"😀":1}` (sha256 `1331…`). Same logical value, two hashes → an opposing expert reimplementing the verifier (the explicit use case for `verify.js`) would conclude "hash mismatch — evidence altered" over an intact bundle. In a judicial context, a false negative on integrity is nearly as damaging as a false positive.
- **Fix applied:** format version bumped to **v2** (the version stamp exists precisely for this), with an explicit `compareByCodePoint` comparator in both implementations and conformance vectors covering the astral plane. Ordering is now specified and implemented, not inherited from the language.

### F10 — Duplicate JSON keys: the file and the verified value can tell different stories (verify.ts:163) — FIXED

**Severity:** Low-medium · **Level:** CONFIRMED in JS (E9) / PLAUSIBLE cross-parser · **Bucket:** canonicalization robustness.

- What is hashed is the canonical form of the *parsed* value, never the file's bytes. **Induction (E9):** a bundle with `"verdict": "NOISE"` followed by `"verdict": "MALICE"` → `grep` shows both, `JSON.parse` (last-wins) takes MALICE, `verify.js` → `valid: true`, exit 0. A human reading the file sees NOISE first; the verifier certifies MALICE. RFC 8259 declares duplicate-key behaviour unpredictable: parsers that take the *first* value (they exist in the Java/Go ecosystems) would produce the opposite verdict over the same bytes.
- **Fix applied:** the verifier now parses with a reviver that **rejects duplicate keys outright** rather than resolving them by any rule — an ambiguous document is refused, not silently interpreted.

### F11 — Unsafe integers and `-0` on the decision path (canonical.ts:45-54) — FIXED

**Severity:** Low · **Level:** CONFIRMED BY INDUCTION (E6, E7) · **Bucket:** decision-path hygiene.

- E6: the source JSON says `"seq": 9007199254740993`; the parser rounds to `…992` *silently*; `Number.isInteger` accepts it; the seal certifies a number the document never contained. The module's own comment ("throws rather than silently losing precision") was violated for integers > 2⁵³. E7: `canonicalize(-0) === canonicalize(0)` even though `Object.is(-0,0)===false` — a real collision, unreachable via JSON (which does not preserve `-0`), in-memory only.
- **Fix applied:** `Number.isSafeInteger` with an explicit error pointing at bigint, and `-0` normalised to `"0"` deliberately rather than by accident.

### F12 — No boundary validation: the verifier crashed instead of invalidating (verify.ts:163) — FIXED

**Severity:** Low · **Level:** CONFIRMED BY INDUCTION (E2) · **Bucket:** hygiene.

- Battery against `verify.js`: malformed JSON → `SyntaxError`; JSON that is a string → `TypeError: Cannot read properties of undefined`; `custodyChain: null` → `TypeError`; `evidenceManifest` nested 100,000 levels → parser crash with a file dump. **In every case: exit 1, and `valid: true` was never printed — it fails closed**, which is the important part and was already right. What was missing was the form: a judge got a stack trace instead of "invalid: this is not a bundle". Additionally (CODE FACT): `store.listBundles` parsed every `.json` in the directory with no `try`, so a single corrupt file took down `list_my_cases`.
- **Fix applied:** shape assertion at the boundary with a one-sentence human-readable failure (still exit 1, still fail-closed), and `listBundles` now reports unreadable files individually instead of failing the whole listing — a case that silently disappears from a custody system is worse than one that shows up as broken.

### F13 — The MCP path fabricated custody after the fact and nullified ABSTAIN (server.ts:78-87) — FIXED

**Severity:** Medium · **Level:** CODE FACT (corroborated in E15) · **Bucket:** design.

- `seal_case` called `score({..., custodyValid: true})` — hardcoded: the "broken custody → ABSTAIN" gate (the suite's star test) was **unreachable through the product's real interface**. And the chain being sealed was built at that moment, with two generic events (`IDENTIFIED`, `ANALYZED`) and `new Date()` timestamps — *after* the analysis, tied to no real evidence acquisition. On the MCP path, the custody chain was decorative: it certified that the server ran, not that the evidence was in custody. Combined with F4, a bundle sealed via MCP asserted a custody story nobody lived.
- **Fix applied:** `seal_case` now takes a `custodyEvents` array (the real acquisition history), and `custodyValid` is **derived** by verifying that chain rather than asserted. No custody events supplied → ABSTAIN. Verified reachable over the real MCP protocol after the fix.

---

## Discarded vectors (attempted, not exploitable)

Falsification is a first-class result. These attacks were executed and **failed** — the system resists them:

| Vector | Experiment | Result | Why it failed |
|---|---|---|---|
| Alter a bundle field without recomputing hashes | E14(a): `verdict` MALICE→NOISE | **Detected** (`fingerprint mismatch`) | the fingerprint covers the whole core |
| Reorder middle chain events | E14(b): swap seq 0↔1 | **Detected** (`Broken link`) | correct prevHash linkage |
| Inject a middle event without recomputing the rest | E14(c) | **Detected** (`Tampered entry`) | same |
| Truncate the chain **without** recomputing `bundleHash` | E14(g) | **Detected** | the tip is inside bundleHash (refines F3: the bypass requires recomputing, which is public) |
| MALICE from a single detector by score | E14(d): all 5 anti-forensic markers together (weight 3/10) | **Rejected** (SUSPICION) | max individual weight (3/10 ≤ 33/100) is aligned with the gate — correct design decision |
| Break monotonicity: adding evidence *lowers* the score | E14(e): all 19×19 marker pairs | **0 violations** | weights ≥ 0 and `HAS()` by existence: the score is monotonic by construction |
| NFC/NFD collision (two distinct strings, one hash) | E14(f): `"café"` composed vs decomposed | **FALSIFIED as a vuln** | NFC normalisation is intentional and collapses semantic equivalents; correct behaviour |
| Graft the chain onto another `caseId` | own suite + E11 (negative control) | **Detected** (`Genesis hash does not match`) | genesis is bound to the caseId |

## Strengths observed

- Exact arithmetic (`Fraction` with bigint, no floats in decisions) and *fail-closed* on every observed crash: no hostile input ever produced `valid: true`.
- Conceptually correct and well-motivated fingerprint/bundleHash separation (documented EBS v1 lesson).
- The scorer degrades MALICE→SUSPICION with no devil's advocate: the Daubert rule itself fails closed.
- Unusually honest documentation: the isolated-chain truncation limitation has a comment *and* a test that makes it visible on purpose; pending tools return an explicit error instead of simulating; "what the proof does **not** establish" is written down.
- 9/9 real tests including adversarial ones; the standalone verifier has no dependencies.

## What was changed (post-audit remediation)

Every finding was re-verified against the live code before patching — none was applied blind on the report's authority alone. All thirteen are now fixed; F5 was closed out separately by the corpus session (see that finding's entry above for what changed in `cases/`).

| Area | Change |
|---|---|
| `src/mcp/store.ts` | `CASE_ID_PATTERN` + `resolveInsideStore()` (prefix check), `InvalidCaseIdError`; `listBundles` reports unreadable files instead of throwing |
| `src/mcp/server.ts` | `caseIdSchema` regex; `timestamp` validated as ISO datetime; `entropyMilliBits` safe-int; `custodyEvents` input with **derived** `custodyValid`; honest tool descriptions |
| `src/engine/detectors.ts` | detectors report `contributingArtifactIds`; temporal detector fails closed on unparseable timestamps (`TIMESTAMP_UNPARSEABLE`) |
| `src/engine/scorer.ts` | corroboration counted by **distinct provenance root**, not detector category; `detectorCategoriesFired` and `corroboratingSources` reported separately |
| `src/seal/canonical.ts` | format **v2**: explicit code-point key ordering, `isSafeInteger`, `-0` normalised |
| `src/seal/custody.ts` | closed vocabulary, `seq` consecutiveness, timestamp parseability and chronology enforced at runtime |
| `src/seal/bundle.ts` | `valid` → `internallyConsistent` + `doesNotEstablish`; `attestationPayload()` exposing fingerprint **and** custody tip |
| `src/seal/verify.ts` | synced with all of the above; strict duplicate-key rejection; boundary shape check with human-readable failure; explicit "does not establish" output |
| `contracts/velo.compact` | third witness `custodyTip()`; commitment is now `persistentHash([fingerprint, tip, salt])` |
| `tests/` | star test rewritten to test independent sources (not categories); same-provenance-root test; `tests/conformance.test.ts` pinning both canonicalizers |
| `cases/*.json` (F5, corpus session) | markers/fields conformed to the real `Artifact` shape; `custodyEvents[]` added; VELO-011's verdict corrected rather than forced |
| `tests/corpus.test.ts` (F5, corpus session) | new — runs the full 13-case corpus through the live engine on every `npm test` |

**Verification after fixes:** 14/14 tests green; `simulate` end-to-end OK; the auditor's own attacks re-run and blocked (path traversal direct and over real MCP JSON-RPC, single-source MALICE, timestamp fail-open, unsafe integer, ABSTAIN reachable).

**Verification after F5 (corpus session, later pass):** suite grew to 34 tests (this session's `corpus.test.ts` plus other work landed in parallel) — 34/34 green, including all 13 corpus cases against the live engine.

## What was NOT verified (explicit fallibilism)

- `contracts/velo.compact` was not delivered at audit time and **is still uncompiled** — no Compact toolchain on the current machine. Everything about Capa 2, including the F3 fix, is unverified against the actual compiler. The authors' own two flagged points (`persistentHash` vs `persistentCommit`, whether `disclose()` is truly required) remain open, and the F3 change adds a third: whether a 3-element `Vector<3, Bytes<32>>` commitment compiles and behaves as intended.
- The HTML frontend (under construction by another team member).
- MCP SDK behaviour on other versions; E15 ran with the versions pinned in the delivered `package-lock.json`.
- The semantic content of the 6 PERITO profiles (credential fixtures for future layers, with no code consuming them yet).
- A confirmed finding does not close the search for a second contributing cause: F2 and F5 may have further instances in unexercised paths.

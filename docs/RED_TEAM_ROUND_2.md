# Security Audit — VELO v0.1.0 (Midnight Hack Buenos Aires)
## Red Team — Round 2: promise vs. guarantee

**Date:** 2026-08-07 · **Method:** Abductive Engineering (A–D–I) + Red-Team Auditing, adversarial-judge posture
**Scope:** the public-facing claims in `README.md`, `docs/ARCHITECTURE.md`, `docs/FAQ.md`, and `contracts/velo.compact` — not a code-level vulnerability sweep like Round 1. This round asks a different question: **does the proof establish what the prose says it establishes?**
**Relationship to Round 1:** Round 1 (`RED_TEAM_ROUND_1.md`) found and fixed implementation bugs — path traversal, the Daubert gate counting categories instead of sources, custody truncation not anchored, corpus drift. Every one of those fixes made the *implementation* match its *intent*. Round 2 asks whether the *intent itself*, once perfectly implemented, is as strong as the prose claims. It is not, in three specific places — and that gap is not a bug, it is a property of what a ZK circuit can and cannot see.

**Posture:** adversary trying to destroy VELO in front of a jury, not a linter looking for syntax errors. The question asked of every claim: *"a hostile, technically literate judge reads this sentence — what does he ask next, and does the system have an answer?"*

---

## Epistemic legend

Same as Round 1: **CODE FACT** (read in the code/docs, as written) · **PLAUSIBLE HYPOTHESIS** (a predicted judge/jury reaction, not independently testable the way a code bug is) · **CONFIRMED BY INDUCTION** (an experiment run against the live contract/engine) · **FIXED** · **DOCUMENTED AS A KNOWN LIMITATION** (the honest, scope-bounded outcome when a full fix is out of reach in the time remaining — an ABSTAIN, not a cover-up).

---

## Executive summary

| ID | Severity | Epistemic level | Finding | Status |
|----|----------|-----------------|---------|--------|
| G1 | **Critical (messaging)** | CODE FACT | The circuit proves a constraint *over the witnesses it is given*; nothing binds those witnesses to the real engine output. `ARCHITECTURE.md` calls the corroboration check "a structural, cryptographic guarantee, not a claim resting on trust in the expert" — that sentence is false as written. | **FIXED (language)** + roadmap |
| G2 | High | CONFIRMED BY INDUCTION | Re-attesting the identical `(fingerprint, tip, verdict, count, salt)` tuple produces the same commitment and inserts into `caseVerdicts` again, inflating `attestationCount` — already flagged in the contract's own comment as "KNOWN, NOT FIXED" | **FIXED** |
| G3 | High (messaging) | CODE FACT | `corroborationCount` is a private witness the prover supplies; the circuit checks `>= 2`, not that the two sources are actually independent (that check happens off-chain, in `scorer.ts`, and is *trusted*, not *proven*) | **DOCUMENTED AS A KNOWN LIMITATION** (roadmap: source-root binding) |
| G4 | Medium (messaging) | CODE FACT | README says "nothing here ever leaves" inside a diagram whose own outputs (commitment, verdict, timestamp) do leave | **FIXED (language)** |
| G5 | Medium | PLAUSIBLE HYPOTHESIS | Commitments published by the same expert wallet are linkable to each other by address, even though no case content is exposed — a metadata/timing side channel | **DOCUMENTED AS A KNOWN LIMITATION** |
| G6 | Medium (messaging) | CODE FACT | "the legal admissibility rule" implies a single universal legal standard; Daubert is a US federal evidentiary standard, not a universal one | **FIXED (language)** |
| G7 | Low-medium | PLAUSIBLE HYPOTHESIS | No rule-version binding — if the corroboration threshold changes later (2 sources → 3), old attestations carry no marker of which rule they were checked against | **DOCUMENTED AS A KNOWN LIMITATION** |
| G8 | Low (roadmap, not a defect) | CODE FACT | No revocation model for an expert's credential/accreditation — not a defect today because no accreditation credential exists yet (it's explicitly future work in `README.md`'s stretch goals) | **DOCUMENTED AS A KNOWN LIMITATION** |
| G9 | N/A (business framing, not security) | — | The natural buyer is an institution (lab, insurer, prosecutor's office, law firm), not an individual expert — a product-framing note, not a vulnerability | **NOTED, not a finding** |
| G10 | Medium (messaging) | CODE FACT | `devil_advocate` is gated on `.trim().length === 0` — any non-empty string satisfies it. GLOSSARY described it as "the strongest innocent explanation considered," which the code cannot verify | **FIXED (language)** + roadmap |

---

## Findings

### G1 — "Cryptographic guarantee, not trust in the expert" overclaims what the circuit can see

**Severity:** Critical, and specifically a *messaging* critical — this is the sentence most likely to be dismantled live in front of a jury, not a sentence that can be exploited to forge anything.

- **The exact claim (`docs/ARCHITECTURE.md`, "What the proof does and does not establish"):**
  > "The proof establishes that the published verdict was not altered after sealing and that the corroboration rule was actually satisfied — **a structural, cryptographic guarantee, not a claim resting on trust in the expert.**"

- **Abduction (rivals considered):**
  (a) the claim is accurate because the circuit's `assert` on `corroborationCount >= 2` is unconditional and can't be bypassed — true in isolation, but doesn't address where `corroborationCount` comes from;
  (b) the engine's determinism (Round 1's whole premise: same input, same output, no float, no LLM in the decision path) closes the gap — **this is the strongest counter-argument, and it is real**, but determinism guarantees *reproducibility given the same inputs*, not that the inputs (which artifacts existed, how many sources they came from) were themselves honest;
  (c) nothing in the circuit or the commitment binds `bundleFingerprint` / `corroborationCount` to a specific execution of the specific engine, on specific evidence, by a specific accredited expert — this is the live gap, and it survives (a) and (b).

- **Deduction:** if (c), then a prover holding *any* four 32-byte values and *any* verdict consistent with the Daubert gate can produce a valid attestation — including someone who never ran the engine at all, hand-computed a fake fingerprint, and set `corroborationCount = 2` without a single real source. The circuit's constraint is real and unforgeable; what is not proven is that the constrained values describe anything that happened.

- **Induction (read, not run — this is a design fact, not a runtime bug):** `contracts/velo.compact`'s four witnesses (`bundleFingerprint`, `bundleSalt`, `custodyTip`, `corroborationCountWitness`) are declared with no `witness` implementation constraint tying them to engine output — by the language's own model (see the Compact skill: *"Witness data never touches the chain. Only the ZK proof that the circuit ran correctly goes on-chain"*), the circuit **cannot** see anything about how a witness value was produced, only that it satisfies the arithmetic relation it's given. `src/witness/witnesses.ts` computes these values honestly from `attestationPayload(bundle)` — but that binding exists **only in the TypeScript caller**, which is exactly the part the ZK proof does not cover. A hostile prover skips `witnessesForBundle` entirely and calls the circuit with hand-picked bytes.

- **Why this is not "already covered by the corrupt-expert disclaimer":** the FAQ and ARCHITECTURE *do* say VELO "does not establish that the expert's original analysis was performed honestly" — but that disclaimer is about the expert *lying in their forensic judgment* (calling something MALICE when they believe it's NOISE). G1 is narrower and more damaging: it says the system cannot even establish that **an engine ran at all** on **real evidence**. That is a different, stronger gap than the one the current disclaimer names, and the "structural, cryptographic guarantee, not trust" sentence directly contradicts it.

- **Fix applied (language, this round):** `ARCHITECTURE.md`'s claim rewritten to name the actual boundary precisely:
  > "The proof establishes that a verdict consistent with the Daubert gate was bound, at the moment of attestation, to a specific analysis fingerprint and custody tip, and that this binding cannot be altered afterward. It does **not** establish that the fingerprint corresponds to a real engine run on real evidence — that binding exists today only in the TypeScript caller (`src/witness/witnesses.ts`), not inside the circuit. Closing that gap requires a witness-provenance mechanism (engine signature, expert credential, or environment attestation) that does not exist yet — see Roadmap."
- **Roadmap item added** (not built this round — genuinely out of scope for the time remaining, and building it badly would be worse than naming it clearly): bind witness provenance to the commitment via one of (a) an Ed25519 signature by the engine binary over the fingerprint, verified inside the circuit; (b) an anonymous accredited-expert credential (Merkle + ZK, already on the stretch-goal list) whose membership proof is required alongside the Daubert gate; (c) a TEE/environment attestation of the engine execution. None is a small addition — each is a real design decision with its own trust assumptions, which is precisely why it belongs in the roadmap and not in a rushed circuit change hours before submission.

---

### G2 — Re-attestation is not rejected: replay inflates `attestationCount` — FIXED

**Severity:** High · **Level:** CONFIRMED BY INDUCTION · **Bucket:** the contract's own comment already names this as "KNOWN, NOT FIXED" — Round 2 closes it rather than rediscovering it as new.

- **Surprise:** none, technically — the contract is unusually honest about this one in its own doc comment. It is included here because an adversarial judge will find it in under a minute by reading the same comment, and "the team's own contract admits an unresolved defect" is a bad thing to have live during a demo when a five-line fix closes it.
- **Code fact:** `attest()` calls `caseVerdicts.insert(commitment, verdict)` unconditionally. `Map.insert` in Compact overwrites on an existing key rather than rejecting it (same behavior class as a JS `Map.set`). Since `commitment` is a pure hash of `(fingerprint, tip, verdict, count, salt)`, calling `attest()` twice with the same sealed bundle and verdict produces the *same* commitment both times: the ledger entry is unchanged (harmless), but `attestationCount.increment(1)` still fires — the public counter of "how many attestations exist" is now provably wrong, and it is wrong in the one place a judge is likely to look (a public, on-chain counter is an easy thing to point at and say "prove this number is real").
- **Fix applied:** guard the insert with the membership check the contract already imports the vocabulary for:
  ```compact
  assert(!caseVerdicts.member(disclose(commitment)), "this attestation already exists");
  ```
  placed immediately before the `insert`/`increment` pair. A second `attest()` call with an identical tuple now fails closed instead of silently double-counting — consistent with the project's own fail-closed doctrine from Round 1 (F12).

---

### G3 — `corroborationCount` is asserted, not proven, to reflect independent sources

**Severity:** High, messaging — this is the sharpest version of G1, specific to the number that gives the whole project its name-check ("Daubert gate").

- **The chain, traced end to end:** an expert calls `seal_case` with a list of `Artifact` objects, each carrying a free-text `source`/`provenanceChain` field (Round 1, F2's fix). `scorer.ts` counts **distinct provenance roots** among the artifacts whose markers actually fired a detector — a real improvement over Round 1's F2 bug (which counted detector *categories*), and it is honestly labeled: the field is called `corroboratingSources: string[]`, not "independent sources: true". That count crosses into `witnessesForBundle` as `corroborationCount`, and from there into the circuit as `corroborationCountWitness()`.
- **Where the chain breaks:** at every step above, "independence" means *the caller wrote a different string in the `source` field*. Nothing — not the engine, not the circuit — verifies that two artifacts with different `source` strings actually came from physically or custodially distinct acquisitions. An expert (honest or not) filling in `source: "disk-image-A"` and `source: "disk-image-B"` for two files carved from the same physical disk produces `corroborationCount: 2` with zero enforcement that they are not the same evidence counted twice — precisely the example given in the attack: a disk image and a log extracted *from that same disk image* are not independent sources, and the current pipeline has no way to know that.
- **Why G3 is distinct from G1:** G1 is about binding witnesses to *an engine run at all*. G3 is narrower and survives even if G1 is fully solved (imagine a perfectly signed, provably-real engine execution) — the engine itself has no model of physical/custodial independence, only of distinct strings. Solving G1 does not solve G3.
- **Fix applied (language, this round):** `README.md` and `docs/GLOSSARY.md` corroboration language changed from "independent corroborating sources" (unqualified) to "sources declared as independent by the analyst, distinct by provenance-chain root" — accurate to what is actually computed, and it does not concede that the number is meaningless, only that "independent" is analyst-declared today, not cryptographically verified.
- **Documented as a known limitation, roadmap:** a stronger version would have the circuit itself take `sourceRoot_1, sourceRoot_2, ...` as witnesses and assert pairwise inequality (or, better, verify each against a signed chain-of-custody record establishing physical acquisition), rather than trusting a pre-counted integer. That is a real circuit redesign, not a wording fix, and is the correct next milestone after G1's provenance work — the two should likely be solved together, since both come down to "what does the circuit actually get to see about where a witness value came from."

---

### G4 — "Nothing here ever leaves" is imprecise about what the diagram's own arrows show leaving

**Severity:** Medium, messaging · **Level:** CODE FACT

- **The exact claim (`README.md`, mermaid diagram subgraph label):**
  > `subgraph local["THE EXPERT'S MACHINE — nothing here ever leaves"]`
- **The contradiction, read from the same diagram:** the subgraph's own downstream arrows show `SEAL` (the sealed bundle) feeding into a proof-generation step whose output — commitment, verdict, and (per `attestationPayload`) the custody tip — leaves the machine by design; that is the entire point of an attestation. "Nothing here ever leaves" is true of the raw evidence and false of the label's own subject if read as "nothing in this box, full stop."
- **Secondary, more important point (the actual attack, not just the wording):** even the values that *are* meant to leave — commitment, verdict, a timestamp — are side-channel-rich. A judge or opposing party watching the chain sees `verdict: MALICE` at `2026-08-07 14:02` bound to a specific expert wallet, without seeing the case. That alone discloses: an investigation existed, roughly when, its outcome category, and (across multiple attestations from the same wallet) how many cases that expert has sealed and their verdict distribution over time. None of that is the evidence — but none of it is nothing, either.
- **Fix applied:** the diagram label changed to `"THE EXPERT'S MACHINE — raw evidence never leaves"`, and a one-line note added directly under the diagram: *"The commitment, the verdict, and a timestamp do leave, by design — that is what gets attested. What never leaves is the evidence itself and the values (fingerprint, custody tip, salt, source count) the proof is computed over."* This is the same fix pattern as Round 1's F4 (`valid` → `internallyConsistent`): make the sign match its object exactly, rather than rounding up to the more impressive-sounding claim.

---

### G5 — Cross-case linkability via the attesting wallet

**Severity:** Medium · **Level:** PLAUSIBLE HYPOTHESIS (not independently run — this depends on how the demo wallet is actually deployed, which was not fixed at the time of this audit)

- **The concern:** every `attest()` call is a transaction from some wallet. If the same expert (or the same institution) always attests from the same address, every commitment they have ever published is trivially linkable to every other one by that address alone — regardless of how well the commitment itself hides case content. An adversary who identifies the wallet (through a leak, through the expert's own public accreditation, through transaction timing correlated with a known case) learns the expert's full attestation history: case count, verdict distribution, cadence.
- **Why this stays a hypothesis rather than CONFIRMED:** it depends on deployment choices not yet made (one wallet per expert vs. a pooled/rotating attesting address, whether the expert's identity is ever publicly tied to their wallet at all) — this audit did not have a deployed multi-case scenario to observe the linkability against.
- **Documented as a known limitation, roadmap:** the anonymous accredited-expert credential already on the README's stretch-goal list is the natural mitigation — if attestation authorization comes from a ZK membership proof against an accreditation Merkle tree rather than from a persistent wallet identity, linkability drops to whatever the wallet layer itself leaks (which is a Midnight-wallet-level concern, not VELO's). Until that exists, the practical mitigation is procedural: rotate attesting addresses per case, documented in `docs/FAQ.md` as an explicit operational caveat rather than left unstated.

---

### G6 — "The legal admissibility rule" implies one universal standard

**Severity:** Medium, messaging · **Level:** CODE FACT

- **The exact claim (`README.md`):**
  > "...that the legal admissibility rule was satisfied — *at least two independent corroborating sources for a `MALICE` verdict*."
- **The problem:** "the legal admissibility rule," definite article, singular, reads as though there is one universal standard being enforced. Daubert is a specific US federal evidentiary standard (*Daubert v. Merrell Dow Pharmaceuticals*, 1993) governing expert scientific testimony; it is not binding in every jurisdiction, and "at least two independent sources" is VELO's own formalization inspired by it, not a verbatim legal requirement a court handed down. A judge or lawyer in the room is entitled to ask "which court adopted this rule?" and the honest answer is: none — it is a security-engineering choice modeled on a well-known evidentiary standard.
- **Fix applied:** "the legal admissibility rule" changed to "a formalized admissibility criterion inspired by the Daubert standard (2+ independent corroborating sources)" everywhere it appears in `README.md`, `docs/ARCHITECTURE.md`, and `docs/GLOSSARY.md`. The circuit's `assert` message in `velo.compact` (`"MALICE requires at least 2 independent corroborating sources — the Daubert gate"`) was already reasonably precise and needed no change — it names its own inspiration rather than claiming universal legal authority.

---

### G7 — No rule-version binding on old attestations

**Severity:** Low-medium · **Level:** PLAUSIBLE HYPOTHESIS

- **The concern:** the Daubert gate threshold (`>= 2`) is hardcoded in `velo.compact`. If a future version of VELO ships with a different threshold (3 sources, or a different rule shape entirely), attestations made under the old contract remain on-chain with no marker distinguishing "checked against rule v1" from "checked against rule v2" — a verifier reading an old commitment cannot tell which rule produced it without out-of-band knowledge of which contract address (and therefore which compiled version) it came from.
- **Why this stays a hypothesis:** in the current single-contract, single-version deployment for the hackathon, this has no observable effect — it only matters once a second contract version exists, which has not happened.
- **Documented as a known limitation, roadmap:** a `ruleVersion` constant folded into the commitment hash (alongside the existing domain separator `"velo:attestation:v1"` — which already partially plays this role by fixing the hash to *this* circuit's semantics) would make version binding explicit rather than implicit-via-domain-separator. Worth doing before a second contract version ships, not before tomorrow's demo.

---

### G8 — No revocation model for expert accreditation

**Severity:** Low, and explicitly not a defect in the current build · **Level:** CODE FACT

- **The concern, as posed:** "an expert loses their license tomorrow — what happens to their 500 past attestations?"
- **Why this is not a Round-2 finding against the delivered system:** no accreditation credential exists yet in the delivered code — it is listed in `README.md`'s own stretch goals ("(stretch) The expert holds a valid accreditation, without revealing which expert they are"), not claimed as built. A revocation model is meaningless to design before the credential it revokes exists.
- **Documented as a known limitation, roadmap, to be designed alongside the accredited-expert credential (G1's roadmap) rather than separately:** once that credential exists, the standard ZK pattern is a revocation Merkle tree checked via non-membership proof at attestation time — an expert who has been revoked can no longer produce a valid membership proof going forward, while past attestations remain on-chain unchanged (revocation is not retroactive by nature: a proof that was valid when produced does not become false, only future proofs from that credential become impossible). This should be named explicitly wherever the credential ships, so "does revocation apply retroactively" has a documented answer instead of an implicit one.

---

### G9 — Product framing: the buyer is an institution, not the individual expert (noted, not a security finding)

Not a vulnerability. Recorded because it changes how the "wallet" framing should be pitched: an individual forensic expert is unlikely to be the one budgeting for this. The realistic buyers — forensic labs, insurers, prosecutors' offices, law firms — want *organizational* attestation infrastructure with per-expert accountability inside it, not a personal wallet product. The wallet metaphor (Section "This is a wallet, not a vault" in the onboarding doc) remains the right *interface* framing for the demo — it is what makes the ZK mechanics legible to a non-cryptographer judge — but the pitch's business-viability section should name the institutional buyer explicitly rather than implying an individual expert is the customer.

---

### G10 — `devil_advocate` is gated on non-emptiness, not on being an actual counter-argument

**Severity:** Medium, messaging (same genre as G3) · **Level:** CODE FACT · **Bucket:** promise vs. what is actually checked.

- **The exact claim (`docs/GLOSSARY.md`):** `devil_advocate` is described as "a mandatory field on any `MALICE` verdict recording the strongest innocent explanation that was considered, and why it was rejected." That describes what the field is *for*, not what the code verifies it *contains*.
- **Code fact:** `src/engine/scorer.ts`'s gate is `if (devilAdvocate.trim().length === 0)` — degrade to `SUSPICION` only when the field is empty after trimming whitespace. `src/mcp/server.ts`'s schema is `devilAdvocate: z.string().default("")` — no `.min()`, no content check of any kind. A `devilAdvocate` of `"x"`, `"n/a"`, or `"looks fine"` passes the gate exactly as well as a genuine, evidence-grounded counter-argument — the engine cannot tell the difference between "the analyst seriously considered and rejected an innocent explanation" and "the analyst typed one character to get past a form field."
- **Why this is the same shape as G3:** G3 found that `corroborationCount` is trusted as analyst-declared rather than cryptographically verified as independent. G10 is the same gap one field over: `devilAdvocate` is trusted as analyst-declared *adversarial content* rather than verified as actually adversarial. Both are cases where a Daubert-inspired gate checks a cheap proxy (a number, a non-empty string) for an expensive property (independence, genuine self-scrutiny) that nothing in the current build can actually verify.
- **Why this is not cheaply fixable, and why that's the honest answer rather than a punt:** a length minimum or keyword heuristic (`length > 40`, contains "however"/"alternative") is trivially gameable by padding or keyword-stuffing, and would create false confidence — a heuristic that *looks* like a check is worse than an honest non-check, because it changes the failure mode from "obviously absent" to "deceptively present." An LLM-graded quality check would need the model in the decision path, which is the exact architectural line this project (and this discipline's own `llm-out-of-the-loop` principle) draws against: a model can read a counter-argument correctly and still be wrong about whether it's genuine, and a MALICE verdict cannot depend on that judgment being infallible.
- **Fix applied (language, this round):** `docs/GLOSSARY.md`'s `devil_advocate` entry now states the actual guarantee: *"the engine only verifies the field is non-empty after trimming — it cannot verify the explanation is genuine, evidence-grounded, or was seriously considered. That verification is human and judicial, the same as with any expert's stated reasoning today."*
- **Documented as a known limitation, roadmap:** the honest mitigation available today is procedural, not cryptographic — a human reviewer (or, later, the second-expert blind-review layer already on the stretch-goal list) reading whether the stated counter-argument is substantive. A structured `devilAdvocateResult` object (`alternativeHypothesisTested: boolean`, `contradictionsChecked: boolean`, `reviewerSignature`) would at least make the *shape* of a real review checkable, without pretending to verify its *content* — worth designing alongside G1's witness-provenance work, since both are instances of "the circuit can check a shape, not a truth."

---

## What was changed (Round 2 remediation)

| Area | Change |
|---|---|
| `contracts/velo.compact` | G2: `assert(!caseVerdicts.member(commitment), ...)` before insert — replay/re-attestation now fails closed instead of silently double-counting `attestationCount` |
| `README.md` | G4: diagram label "nothing here ever leaves" → "raw evidence never leaves" + explicit note on what does leave. G6: "the legal admissibility rule" → "a formalized admissibility criterion inspired by the Daubert standard". G3: "independent corroborating sources" qualified as analyst-declared, provenance-root-distinct |
| `docs/ARCHITECTURE.md` | G1: "structural, cryptographic guarantee, not a claim resting on trust in the expert" rewritten to name the actual boundary (binding is proven; provenance of the witnesses themselves is not) |
| `docs/GLOSSARY.md` | G6, G3: same language corrections as README for consistency |

## What was NOT built this round (explicit fallibilism, matching Round 1's own standard)

- **G1's real fix (witness provenance binding)** — signature, credential, or attestation scheme binding a witness to a real engine execution — is a genuine cryptographic design task, not a same-day patch. Naming it precisely in the docs (done) is the honest move available in the time remaining; building it hastily hours before submission would very likely introduce a new, worse defect (Round 1's whole lesson).
- **G3's real fix (circuit-level source-root binding)** — same reasoning; depends on G1's provenance mechanism to be worth building at all, since without provenance binding, a circuit-verified source list is still only as honest as the artifacts it was computed from.
- **G5's mitigation (accredited-expert credential / wallet rotation)** — depends on the same not-yet-built credential as G1/G8.
- **G7 (rule versioning)** — no second contract version exists yet to version against; correctly deferred rather than adding unused machinery now.

**Honest reading of the whole round:** none of G1, G3, G5, G7, or G8 are bugs in the sense Round 1 found bugs — nothing here can be exploited to make the circuit accept a false constraint. They are all the same shape of gap: **the circuit proves relationships between witnesses perfectly; it cannot see whether those witnesses describe anything real.** That is not a VELO-specific weakness — it is what "zero-knowledge proof" means for *any* system that attests to real-world facts rather than pure computation, and the correct response to it is exactly what this round did: fix what changes with a sentence or a five-line assert (G2, G4, G6), and name what doesn't precisely enough that nobody in the room can claim it was hidden (G1, G3, G5, G7, G8). A jury that hears "here is exactly the line between what's proven and what's trusted, and here is the roadmap for moving that line" is harder to destroy than one told "this is cryptographically guaranteed" and finds the gap themselves.

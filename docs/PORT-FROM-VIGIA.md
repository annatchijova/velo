# PORT-FROM-VIGIA.md — machine-oriented port specification (agent-to-agent)

AUDIENCE: an implementing agent porting forensic logic from VIGÍA (Python) into VELO
(TypeScript). This document is a work order, not human documentation. It is dense on
purpose. Do not summarize it away; execute against it.

SOURCE (read-only reference, never modify): `/home/labestiadevigia/vigia-repo`
  git: `github.com/annatchijova/vigia-intent-analysis`, Apache-2.0.
TARGET (write here): `/home/labestiadevigia/velo`, package `velo`, TypeScript, npm workspaces.

Provenance of the claims below:
  - VELO current-state facts: VERIFIED against live VELO source (paths + line intent cited).
  - VIGÍA module determinism tags for modules NOT individually read here: RECON-AGENT CLAIM.
    Marked `[RECON]`. You MUST re-read the live Python and re-confirm the tag before porting
    that module (audit-before-patch). Only `eco_check.py` is marked `[VERIFIED]` below —
    it was read in full.

================================================================================
## 0. THE HARD INVARIANT (read before touching anything)
================================================================================

VELO seals a verdict deterministically. A ported capability lands in exactly ONE of two
placements, decided by whether its OUTPUT-THAT-INFLUENCES-THE-VERDICT is exact:

  SEALABLE  → may enter the decision path. Core logic is integer / `bigint` / rational
              (`Fraction`) / pure string ops. NO float, NO numpy, NO ML model, NO
              transcendental math (`exp`/`log`/`sqrt`), NO randomness, NO LLM, NO network
              in any value that reaches the seal.

  NON-SEALABLE → may ONLY feed the pre-analysis or narrative layer. It can PRODUCE markers
              or evidence records or human-readable prose; it can NEVER be a term in the
              sealed score/verdict. Floats/ML/LLM belong here and ONLY here.

Placement is the whole game. A float is not banned — a float *in a sealed value* is banned.
VIGÍA's own rule (its `CLAUDE.md`, invariant 4): "If you observe floating-point values in
intermediate scoring output, flag it as a determinism violation." VELO enforces this
mechanically: `src/seal/canonical.ts` THROWS on a non-integer `number`
(`"non-integer number ... is not allowed in the decision path — use a Fraction or a bigint"`).
That throw is your guardrail. If a port accidentally seals a float, sealing fails loudly.

Verdict scale is fixed: `NOISE | SUSPICION | MALICE | ABSTAIN`. Do NOT introduce `INTENT`
into the deterministic path. VIGÍA's full scale has an `INTENT` rung, but VIGÍA's
deterministic Mode-1 motor caps it at `SUSPICION` and VELO matches Mode-1. `INTENT` is a
Mode-2 (LLM-narrative) concept and stays out of the seal.

Daubert corroboration gate is fixed: `MALICE` requires ≥ 2 INDEPENDENT provenance sources
(distinct provenance-chain roots, not detector categories). Preserve it in every scorer edit.

Gates are PRE-EMISSION, not post-hoc: a gate intercepts a bad candidate verdict before it is
sealed (VIGÍA's self-correction pattern). Never seal-then-revise.

================================================================================
## 1. VELO CURRENT STATE — VERIFIED (do not port duplicates)
================================================================================

Read these before porting; several VIGÍA "crown jewels" from the recon pass are ALREADY
present in VELO at parity and MUST NOT be re-ported.

| VELO file | What it already is | Consequence for the port |
|---|---|---|
| `src/engine/fraction.ts` | Exact rational arithmetic substrate (`Fraction`). | This is the target type for every sealed number. Port Python `Fraction`/`Decimal` decision values to this. |
| `src/seal/canonical.ts` | Canonical serializer v2. `CANONICALIZE_VERSION = 2`; type-tagged (checks `boolean` before `number` before `bigint` before `string`); keys sorted by Unicode code point; **rejects non-integer `number`**; output prefixed `v2:`. | VIGÍA `vigia/core/canonicalize.py` (v2 type-tagging) = **PARITY. DO NOT PORT.** VELO already has it. |
| `src/seal/custody.ts` | Hash-chained chain of custody. `CUSTODY_EVENT_TYPES`, `createCustodyChain`, `appendCustodyEvent`, `chainTip`, `verifyCustodyChain` (recomputes EVERY link independently, trusts no stored hash). | VIGÍA `chain_of_custody.py` / `hash_chain.py` = **PARITY. DO NOT PORT** the base chain. OPTIONAL hardening only (see §5.6). |
| `src/engine/scorer.ts` | Rational scorer. `Verdict = NOISE|SUSPICION|MALICE|ABSTAIN`; `score: Fraction`; `corroborationCount` = distinct provenance roots; `MALICE_THRESHOLD = 33/100`; `NOISE_CEILING = 8/100`; `MIN_CORROBORATION_FOR_MALICE = 2`; ABSTAIN forced on failed custody / declared coverage gaps. | ENRICH target. Preserve the scale, thresholds, and gate. Add sealable gates/signals only. |
| `src/engine/detectors.ts` | Marker-driven detectors. `DetectorResult { name, fired, fractures[], weight: Fraction, contributors[] }`; markers → fractures; per-detector `weight = Fraction(1,4)` when fired. Existing categories: temporal / cross_source / narrative / process / anti_forensic. | ENRICH target. New fractures are added here as marker-driven detectors returning `Fraction` weights. |
| `src/engine/evidence.ts` | `Artifact` + `CoverageGap` types (evidence schema). | Extend here if a port needs a new artifact field or marker. Keep the 6 artifact types unless a port genuinely needs more. |
| `src/core/operations.ts` | The single shared backend (`analyzeCase` → `sealCase`) that the MCP, the Next.js API and the CLI all call. | WIRE new decision-path logic through here so all three interfaces get it and cannot drift (VELO red-team F8). |
| `src/mcp/server.ts` | Zod input schemas at the boundary (artifact enum, custody event enum, caseId regex). | If a port adds an input, add its Zod schema here too. |

================================================================================
## 2. RANKED PORT INVENTORY
================================================================================

Action codes:
  PORT-NEW   = net-new sealable capability VELO lacks → port into the decision path.
  ENRICH     = VELO has a thinner version → add sealable pieces, preserve existing contract.
  SKIP-DUP   = VELO already at parity → do not port.
  NARRATIVE  = non-sealable → port only as a pre-analysis/narrative signal producer, never the seal.

| # | VIGÍA source | Capability | Determinism | VELO has? | Action | Target |
|---|---|---|---|---|---|---|
| 1 | `vigia/core/eco_check.py` `[VERIFIED]` | Eco overinterpretation / scene-staging D1 gate | SEALABLE (integer `2*hits>n`) | no | **PORT-NEW** | `src/engine/eco.ts` + wire in `scorer.ts` |
| 2 | `vigia/inference/abductive_intent_engine.py` `[RECON]` | Peirce hypothesis ranking, Ockham (integer cost/coverage) | SEALABLE (integer) — but HYPOTHESIS layer, not verdict | no | **PORT-NEW (inform-only)** | `src/inference/abductive.ts` |
| 3 | `vigia_scorer.py` `[RECON]` | Composite gate cascade (B-168–B-172), TrustFusion→CAIE→decision | SEALABLE core (`Fraction` + lookup tables) | partial | **ENRICH** | `src/engine/scorer.ts` |
| 4 | `vigia/tools/caie.py` `[RECON]` | Fracture predicates (structural impossibilities) | SEALABLE (predicates) / NON-SEALABLE (Noisy-OR composite) | partial | **ENRICH (predicates only)** | `src/engine/detectors.ts` |
| 5 | `vigia/core/trust_fusion.py` `[RECON]` | Temporal confidence decay, table-driven | SEALABLE (lookup table `_EXP_NEG2_TABLE`, no `math.exp`) | no | **PORT-NEW (if needed)** | `src/engine/trust_fusion.ts` |
| 6 | `vigia/core/decision_layer.py` `[RECON]` | Risk-bounded thresholds LOW/MED/HIGH/CRITICAL | SEALABLE (`Fraction` compares) | partial (thresholds inline in scorer) | **ENRICH or SKIP** | fold into `scorer.ts` if it adds bands VELO lacks |
| 7 | `vigia/forensics/temporal_forensics.py` `[RECON]` | Temporal plausibility (causality, epoch validation) | SEALABLE (datetime compare, integer) / drift-rate float REPORT-ONLY | partial (temporal detector) | **ENRICH (validation subset)** | `src/engine/detectors.ts` |
| 8 | `vigia/core/canonicalize.py` `[RECON]` | Canonical JSON v2 type-tagging | SEALABLE | **YES (parity)** | **SKIP-DUP** | — |
| 9 | `vigia/core/chain_of_custody.py`, `hash_chain.py` `[RECON]` | Hash-chained custody | SEALABLE | **YES (parity)** | **SKIP-DUP** (+ optional hardening §5.6) | — |
| 10 | `vigia_sift_bridge::audit_grice_maxims` `[RECON]` | Grice maxim violations (4 phenomena) | SEALABLE (regex detection) / NON-SEALABLE (float score) | no | **ENRICH (regex→markers) + NARRATIVE (score)** | detection→`detectors.ts`; score→narrative |
| 11 | `analyze_stylometry` `[RECON]` | Authorship attribution | NON-SEALABLE (float prob, n-gram) | no | **NARRATIVE** | pre-analysis signal producer only |
| 12 | `calculate_shannon_entropy`, `calculate_human_entropy` `[RECON]` | Entropy / timing regularity | NON-SEALABLE (`math.log`, float variance) | no | **NARRATIVE** | may emit a MARKER the engine scores; the float never seals |
| 13 | `detect_human_jitter` `[RECON]` | Automation timing detection | NON-SEALABLE (float std/CV) | no | **NARRATIVE** | marker producer only |
| 14 | `vigia/core/likelihood_ratio.py` `[RECON]` | Bayesian LR | NON-SEALABLE (`math.log`/`exp`) | no | **NARRATIVE** | risk narrative only, never verdict |
| 15 | `vision_audit` (CLIP), entropy kernel (numpy) `[RECON]` | Vision / vectorized entropy | NON-SEALABLE (GPU/model/numpy) | no | **NARRATIVE** | pre-analysis enrichment only |

CROWN JEWELS (port first, in order): #1 eco_check, #3/#4 scorer+CAIE fracture enrichment,
#2 abductive intent (inform-only). Everything NARRATIVE waits until the sealable core is done.

================================================================================
## 3. DETERMINISM ENGINEERING RULES (apply to every port)
================================================================================

R1. Sealed number type = `Fraction` (`src/engine/fraction.ts`) or `bigint`. Never a JS
    `number` that could be non-integer. `canonical.ts` will throw on a non-integer number;
    do not defeat that — it is the guardrail, not an obstacle.

R2. Transcendental math → precomputed lookup tables. VIGÍA replaces `math.exp`/`math.log`
    with tables (`_EXP_NEG2_TABLE`, `_SUPPORT_SCORE_TABLE`, `_EPC_FACTOR_TABLE`) bucketed to
    fixed keys, so x86 and ARM produce identical bytes. When a port "needs" `exp`/`log`,
    port the TABLE, not the function. If no table exists in VIGÍA, the value is NON-SEALABLE.

R3. Float outputs are allowed ONLY as clearly-named report/narrative fields that no sealed
    value reads. Worked example from eco_check (`[VERIFIED]`): the decision is the integer
    predicate `2*len(found) > n`; the float `obvious_ratio = round(len(found)/n, 2)` is
    emitted as INFORMATIONAL ONLY and must never be summed into a score. Keep that split.

R4. Verdict scale stays `NOISE|SUSPICION|MALICE|ABSTAIN`. No `INTENT` in the sealed path.

R5. Daubert gate stays: `MALICE` ⇒ `corroborationCount ≥ 2` distinct provenance roots.

R6. Hypothesis/LLM/ML layers INFORM, never seal. A ranked hypothesis or an LLM sentence can
    appear beside the seal, never inside it, and can never move a verdict. (VIGÍA's own
    `EPISTEMIC_KERNEL` is explicitly OUTSIDE the verdict path and a regression test enforces
    that nothing in scoring imports it — replicate that boundary in VELO for #2.)

R7. Gates are pre-emission. Port a gate as a check that caps/blocks a candidate verdict
    BEFORE `sealBundle`, never as a mutation of a sealed bundle.

================================================================================
## 4. PER-PORT ACCEPTANCE CRITERIA (do not mark a port done without these)
================================================================================

A1. AUDIT-BEFORE-PORT: re-read the live Python of the source module. Confirm the determinism
    tag in §2 against the actual code (grep for `float`, `numpy`, `np.`, `math.`, `torch`,
    `random`, `Decimal`, model/LLM calls). If the decision output touches any of those and
    no lookup table isolates it, the module is NON-SEALABLE regardless of what §2 says.

A2. PARITY TEST: pin fixtures; assert the ported TS produces the SAME sealable decision (the
    boolean / integer / `Fraction`) as the Python for those inputs. Report fields (floats)
    are exempt from parity — only the sealed decision must match.

A3. DETERMINISM TEST: seal a case that exercises the new logic twice (better: reorder inputs,
    fresh process); assert byte-identical canonical digest. If sealing throws in
    `canonical.ts`, you sealed a float — fix the type, do not silence the throw.

A4. NO-LEAK TEST: grep the new decision-path code for `Number(`, `parseFloat`, `Math.`,
    `/` producing a JS number used in a sealed value. All ratios in the seal are `Fraction`.

A5. WIRE THROUGH `src/core/operations.ts` so MCP + API + CLI share it (no per-interface copy).

A6. Document what you did NOT verify. A ported gate whose Python side you skimmed is
    PLAUSIBLE, not CONFIRMED.

================================================================================
## 5. CROWN-JEWEL PORT SPECS
================================================================================

### 5.1 eco_check → `src/engine/eco.ts` (PORT-NEW, verified source) — DO THIS FIRST

Source `vigia/core/eco_check.py` `[VERIFIED, read in full]`. Public surface:
  - `OBVIOUS_BAIT_TERMS: tuple` — immutable vocabulary of ~50 "obvious bait" terms
    (`hack`, `mimikatz`, `ransomware`, `c&c`, `tor exit`, `known russian`, ...). Doctrine
    lives in this list; port it verbatim as a frozen array. Single source of truth.
  - `word_search(term, text) -> bool` — case-insensitive presence with boundary handling:
    if the term contains a non-`\w` char (`c&c`, `[ERROR]`), use `(?:^|(?<=\s))term(?=\s|$)`;
    else use `\bterm\b`. Port the regex logic exactly (JS regex supports lookbehind).
  - `text_obvious_bait_hits(text) -> list` — per-artifact hits (for the D1 per-artifact gate).
  - `eco_overinterpretation_check(evidence_list) -> dict` — SET-LEVEL decision.
    DECISION (sealable): `staged = bool(n) and (2*len(found) > n)`. Integer only.
    `obvious_ratio` is float, REPORT-ONLY (R3) — do not seal it.

Port contract:
  - `export const OBVIOUS_BAIT_TERMS: readonly string[]` (frozen).
  - `export function wordSearch(term: string, text: string): boolean`
  - `export function obviousBaitHits(text: string): string[]`
  - `export function ecoOverinterpretation(texts: string[]): { staged: boolean; hits: {text,terms}[]; obviousRatio: number /* narrative only */ }`
  - The sealed signal is `staged` (boolean) and, if wired as a fracture, a `Fraction` weight.
    `obviousRatio` may appear in the case narrative/summary; it must not be read by the scorer.

Wiring (two uses, mirror VIGÍA D1):
  (a) PER-ARTIFACT D1 pre-gate on EXCULPATORY input (VELO's `devilAdvocate` string and any
      artifact the caller frames as refutation): if `obviousBaitHits(text)` is non-empty, the
      "refutation" itself is a signal — it must NOT be allowed to reduce the score. Concretely,
      guard the point in `scorer.ts` where `devilAdvocate` weakens a MALICE candidate: if the
      devil's-advocate text trips the Eco filter, it does not weaken. Document as gate D1.
  (b) SET-LEVEL fracture: if `ecoOverinterpretation(allArtifactDescriptions).staged`, add a
      `POSSIBLE_SCENE_STAGING` fracture via a new marker-driven detector in `detectors.ts`
      (weight `Fraction`, aligned with the other detectors). This does not by itself force a
      verdict; it contributes like any fracture.
  Tests: parity on the Python fixtures (same vocab + same texts ⇒ same `staged`); a case with
  >½ bait-laden artifacts flips `staged=true`; a case at exactly half stays false (strict `>`).

### 5.2 vigia_scorer gate cascade → `src/engine/scorer.ts` (ENRICH) `[RECON]`

Source `vigia_scorer.py` (~2000 LOC). Uses `Fraction` + lookup tables, no LLM. It contains a
gate cascade (referenced as B-168–B-172) richer than VELO's single-threshold+corroboration
scorer. PORT ONLY the sealable gates VELO lacks; PRESERVE VELO's `Verdict` scale, `MALICE_THRESHOLD`,
`NOISE_CEILING`, `MIN_CORROBORATION_FOR_MALICE`, and the ABSTAIN-on-custody/coverage behavior.
Procedure:
  1. A1 audit: read the gate cascade; for each gate, classify sealable vs float-scoring.
  2. Map each sealable gate to a pre-emission check in VELO's scorer (R7). Keep VELO's
     provenance-root corroboration definition (do NOT adopt any "detector-category count"
     notion of corroboration — VELO fixed exactly that bug; see scorer.ts comments).
  3. Port lookup tables verbatim as `Fraction`-valued maps (R2). Do not port `math.exp`.
  4. Parity-test the composite verdict against VIGÍA Mode-1 on shared fixtures where the
     inputs are expressible in both engines; where they are not, document the scope gap.
CAUTION: any Noisy-OR / `Decimal`-probability composite that emits a float is NON-SEALABLE
scoring — do not put its float into VELO's `score`. If a fracture needs to contribute, it
contributes as a `Fraction` weight through the existing detector aggregation.

### 5.3 caie fracture predicates → `src/engine/detectors.ts` (ENRICH) `[RECON]`

Source `vigia/tools/caie.py` (~3500 LOC). The FRACTURE PREDICATES are pure logic
(`TEMPORAL_CAUSALITY_VIOLATION`, `EFFECT_BEFORE_CAUSE`, `NETWORK_HOST_CONTRADICTION`,
`PROCESS_MASQUERADE`, and others) — sealable. The composite Noisy-OR fusion uses
`decimal.Decimal` and emits float-formatted probabilities — NON-SEALABLE, do not port into
the score. Port each predicate as a marker-driven detector (VELO already models fractures this
way): map the predicate's triggering condition to VELO markers/artifact fields, return a
`DetectorResult` with `Fraction` weight. Reuse VELO's `markerDetector` shape. VELO already has
several of these (temporal causality, process masquerade) — ADD ONLY the ones VELO lacks; grep
VELO `detectors.ts` first to avoid duplicate fractures.

### 5.4 abductive_intent_engine → `src/inference/abductive.ts` (PORT-NEW, INFORM-ONLY) `[RECON]`

Source `vigia/inference/abductive_intent_engine.py` (~1143 LOC). Peirce hypothesis ranking by
Ockham cost. Reported sealable: cost = `len(missing_required) + len(assumed_artifacts)`
(integer, lower = better); coverage = `observed/required * 100` (integer 0–100); templates
immutable. CRITICAL PLACEMENT: this is a HYPOTHESIS GENERATOR, not a verdict producer. In
VIGÍA the abductive/epistemic kernel is explicitly OUTSIDE the verdict path (a regression test
forbids the scoring pipeline from importing it). REPLICATE THAT: port it as an inform-only
layer that ranks candidate intent hypotheses for the narrative/report, emitting integer
cost/coverage. It MUST NOT feed `score` or move a `Verdict`. Add a VELO regression test
asserting `src/engine/scorer.ts` does not import `src/inference/abductive.ts`. Even though the
math is integer (technically sealable), its ROLE is inference, not adjudication — keep it out
of the seal by construction.

### 5.5 trust_fusion temporal decay → `src/engine/trust_fusion.ts` (PORT-NEW, conditional) `[RECON]`

Source `vigia/core/trust_fusion.py`. Confidence decays with age via `_EXP_NEG2_TABLE` lookup
(no `math.exp`), `Fraction` arithmetic — sealable BY the table. Port ONLY IF VELO gains a
notion of evidence age (VELO cases are currently point-in-time; if a case carries per-artifact
validation timestamps, decay applies). Port the table verbatim (R2). If VELO has no age input,
this is premature — defer, note it.

### 5.6 custody hardening (OPTIONAL, not a port of the base chain) `[RECON from VIGÍA CLAUDE.md]`

VELO custody is already a verified hash chain (§1). VIGÍA's `tool_log_chain` v2 adds two
things VELO may lack and that are pure/sealable: (a) an `entry_hmac = HMAC-SHA256(key, entry_hash)`
so an attacker who rewrites AND recomputes the chain is still caught (SHA-256 alone is
recomputable); (b) a bundle-level TAIL ANCHOR (`chain_tip_sha256` written as a sibling OUTSIDE
the log array) so tail truncation is detected. Both are optional hardening; only adopt if VELO's
threat model wants insider/truncation detection. Keep backward-compat (absence = caveat, not
failure), exactly as VIGÍA's verifier does.

================================================================================
## 6. NON-SEALABLE ADAPTER PATTERN (for everything in §2 marked NARRATIVE)
================================================================================

stylometry, human entropy, jitter, likelihood ratio, Grice float score, vision, entropy kernel:
port these (if at all) as SIGNAL PRODUCERS that run BEFORE the deterministic engine and emit
either (a) a MARKER on an artifact (which the deterministic detectors then score with a
`Fraction` weight), or (b) a narrative field stored BESIDE the seal. The float never crosses
into the sealed value. This preserves the property that swapping/ removing the narrative layer
changes only wording, never the verdict/seal — the same test VELO already applies to its LLM
narrator. If you cannot express a capability as a marker or a narrative field, it does not
belong in VELO's decision path at all.

================================================================================
## 7. PHASED ROADMAP
================================================================================

Phase 0 — DONE (this document): VELO baseline verified; canonicalize + custody = parity (SKIP).
Phase 1 — eco_check → `src/engine/eco.ts`, wire D1 pre-gate (a) + POSSIBLE_SCENE_STAGING
          fracture (b) through `operations.ts`. Smallest, cleanest, verified source.
Phase 2 — caie fracture predicates (§5.3) into `detectors.ts`; vigia_scorer sealable gates
          (§5.2) into `scorer.ts`. Both ENRICH, both preserve the scale + Daubert gate.
Phase 3 — abductive intent (§5.4) as inform-only `src/inference/abductive.ts` + the
          no-import regression test; trust_fusion (§5.5) only if age input exists.
Phase 4 — NARRATIVE adapters (§6): stylometry / entropy / jitter / Grice-score / LR as
          marker/narrative producers. Optional custody hardening (§5.6).

================================================================================
## 8. DO-NOT (hard stops)
================================================================================

- Do NOT port `canonicalize.py`, `chain_of_custody.py`, `hash_chain.py` base — VELO parity.
- Do NOT put any float / numpy / ML / LLM output into `score` or a `Verdict`.
- Do NOT add `INTENT` to the deterministic verdict scale.
- Do NOT let the abductive engine, any LLM, or any narrative signal move a sealed verdict.
- Do NOT redefine corroboration as "detector categories" — it is distinct provenance roots.
- Do NOT seal a JS non-integer `number` (canonical.ts throws — that is correct; fix the type).
- Do NOT modify `/home/labestiadevigia/vigia-repo` (read-only source).
- Do NOT trust a `[RECON]` determinism tag without re-reading the live Python (A1).

================================================================================
## 9. SOURCE ↔ TARGET REFERENCE
================================================================================

| VIGÍA source (read-only) | VELO target | Action |
|---|---|---|
| `vigia/core/eco_check.py` | `src/engine/eco.ts` (new) + `src/engine/scorer.ts`, `detectors.ts` (wire) | PORT-NEW |
| `vigia_scorer.py` | `src/engine/scorer.ts` | ENRICH |
| `vigia/tools/caie.py` (predicates) | `src/engine/detectors.ts` | ENRICH |
| `vigia/inference/abductive_intent_engine.py` | `src/inference/abductive.ts` (new) | PORT-NEW inform-only |
| `vigia/core/trust_fusion.py` | `src/engine/trust_fusion.ts` (new) | PORT-NEW conditional |
| `vigia/core/decision_layer.py` | `src/engine/scorer.ts` | ENRICH/SKIP |
| `vigia/forensics/temporal_forensics.py` | `src/engine/detectors.ts` | ENRICH |
| `vigia/core/canonicalize.py` | — | SKIP-DUP |
| `vigia/core/chain_of_custody.py`, `hash_chain.py` | — (§5.6 optional) | SKIP-DUP |
| `audit_grice_maxims` (regex) / (score) | `detectors.ts` / narrative | ENRICH / NARRATIVE |
| stylometry / entropy / jitter / LR / vision | pre-analysis or narrative | NARRATIVE |

END.

================================================================================
## 10. EXECUTION STATUS (2026-08-14, branch feat/vigia-port)
================================================================================

Phases 1-3 executed. Every ported module was re-read from the live Python
before porting (A1); sealable decisions are parity-tested against live runs of
the Python originals (A2); the full suite (79 tests) passes including the
determinism seals (A3) and the no-import isolation test for the hypothesis
layer.

| Item | Status | Where |
|---|---|---|
| #1 eco_check | PORTED | `src/engine/eco.ts`; detector `scene_staging` + scorer gate D1; parity fixtures from a live Python run in `tests/eco.test.ts` |
| #2 abductive intent | PORTED (inform-only) | `src/inference/abductive.ts`; 32 templates / 12 phases extracted mechanically; result hash byte-identical to Python; no-import regression test in `tests/abductive.test.ts` |
| #3 vigia_scorer gates | PARTIAL | B-151a single-artifact cap ported into `scorer.ts` with audit trace. B-068 3-branch corroboration NOT ported (needs spoofability profiles + domain taxonomy VELO lacks; would also redefine corroboration, forbidden by R5/§8). Hard-MALICE B-172 NOT ported (forces MALICE from one artifact pair — bypasses the Daubert gate). UNKNOWN band NOT ported (fixed scale, R4). Integrity gates NOT ported (VELO's coverage-gap ABSTAIN and fail-closed timestamp fractures already cover the conservative direction). |
| #4 caie predicates | PARTIAL | Rules 13/14 as marker-driven fractures (DEFENSE_EVASION_ARTIFACT, PROCESS_INJECTION_ANTIFORENSIC); Rule 9 Timestomp signature + R3-1 range guard computed from timestamps. NOT ported: predicates requiring metadata VELO artifacts do not carry (claim_vs_record, structured network/process time fields, trust-chain validation, marker-classification field inventories) — scope gap, revisit if the Artifact schema grows a metadata map. Vision/verdict-conflict/metadata-concealment: NON-SEALABLE upstream ML, excluded. |
| #5 trust_fusion | PORTED (sealable subset, verdict-neutral) | `src/engine/trust_fusion.ts` + `AnalysisResult.artifactTrust`. A1 audit REFUTED the recon premise: the live module has NO evidence-age decay — `_EXP_NEG2_TABLE` keys off temporal-VIOLATION severity, and the Bayesian-neighborhood machinery is cascading-float, NON-SEALABLE. Ported: the Fraction-exact tables from the canonical scorer (EXP_NEG2, EPC depth factor, empty-chain 1/10) and effectiveTrust = provenance x temporal per artifact, reported beside the verdict. NOT adopted: VIGIA's trust verdict gates — the ABSTAIN gate (<1/100) is unreachable in VELO without an external prior_trust input (floor is 1/10 x 12957/95740 > 1/100), and the SUSPICION cap (<15/100 + fractures) counterbalances the hard-temporal MALICE gate VELO deliberately lacks; adopting it alone would make the same temporal fractures raise the score and cap the verdict. No evidence-age schema was added (premise refuted). |
| #6 decision_layer | SKIPPED | VELO thresholds already inline in scorer; no band VELO lacks survives R4. |
| #8/#9 canonicalize/custody | SKIPPED (parity) | Confirmed present; §5.6 hardening not adopted (threat model unchanged). |
| #10-#15 narrative producers | EXECUTED (portable subset) | Narrative LAYER: `src/narrative/` (post-seal narrator, Ollama + Anthropic backends, swap test, no-import boundary). PRODUCERS: `src/analysis/pre_analysis.ts` per the §6 adapter pattern — timing regularity (jitter #13 + human-entropy regular-intervals subset of #12, thresholds verified against the live bridge) suggests the existing `temporal_entropy_null` marker, advisory-only, applied by the caller through the normal input path; Grice QUANTITY maxims (#10 integer-threshold subset) as narrative signals. NOT ported, each with an input-gap reason: shannon entropy (needs raw content — `entropyMilliBits` is that signal's arrival point in VELO), Grice relation-maxim evasion phenomena (testimony/chat input VELO lacks), likelihood ratio #14 (needs the EBS z-score pipeline), stylometry #11 (needs an authorship corpus). Wired as `preAnalyzeEvidence` in operations + the `pre_analyze` MCP tool; no-import boundary test extended to `src/analysis/`. |

Deviations from this spec, with reasons:
- D1 wiring (a): the live scorer has no point where the devil's advocate
  weakens a MALICE candidate (its presence is what ENABLES MALICE under the
  scrutiny gate), so there is no reduction to block. The gate is implemented
  as a sealed-reasoning annotation instead. Verified against the live file.
- `scene_staging` contributes NO corroborating sources, diverging from
  "contributes like any fracture": on the live corpus, counting bait-carrying
  artifacts as sources inflated the Daubert count from analyst prose
  (a clean TPM reading counted as a fourth source; a negated "no exploit"
  counted as bait). Known limitation of scanning `description` (analyst
  prose, not acquired content) is documented in the affected case fixtures.
- R3-1 out-of-range timestamps raise a fail-closed fracture
  (TIMESTAMP_OUT_OF_RANGE) instead of VIGIA's log-and-ABSTAIN-gate: same
  conservative direction, VELO's existing F6 mechanism.

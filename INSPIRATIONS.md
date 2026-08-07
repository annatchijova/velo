# Inspirations

VELO is net-new code, written entirely during Midnight Hack Buenos Aires
(Aug 7-8, 2026). This file exists so reviewers don't have to guess where the
underlying concepts come from, and so nobody mistakes an *adaptation* for a
*copy*: every project listed below is written in **Python**. VELO is written
in **TypeScript and Compact**. There is no code to copy-paste between them —
the language boundary alone makes that impossible. What crosses over is the
*concept*, rewritten from memory for a different language, a different
runtime (a ZK circuit, not a Python process), and a different privacy model
(zero-knowledge, not access control).

| Concept used in VELO | Prior work it's adapted from (Python) | What specifically carries over |
|---|---|---|
| Deterministic verdict scale (NOISE/SUSPICION/MALICE/ABSTAIN), corroboration gate | [VIGÍA](https://github.com/annatchijova/vigia-intent-analysis) — `vigia_scorer.py` | Threshold logic and the ≥2-source corroboration rule for MALICE |
| Sealed bundle structure, bundle hash vs. analysis fingerprint | VIGÍA — `vigia/core/bundle_builder.py`, `vigia/core/ebs_v1.py` | The two-hash pattern (custody identity vs. reproducible analysis identity) |
| Canonical serialization (type-tagged, sorted keys, no floats) | VIGÍA — canonicalize v2 | The rules for deterministic hashing, not the code |
| Hash-chained custody log with anti-truncation tip | VIGÍA — `vigia/core/tool_log_chain.py`; [mneme](https://github.com/annatchijova/mneme) — `custody.py` | The chaining pattern (`entry_hash` over content + `prev_hash`) |
| Offline, dependency-free verifier | VIGÍA — `forensics/verify_ebs_v1.py`; mneme — `verify_offline.py`; [phylo-google](https://github.com/annatchijova/phylo-google) — `tools/verify_bundle.py` | The idea of a standalone verifier independent of the producing code |
| Consent-gated selective disclosure | [continuum](https://github.com/olgavasilievaveg-hash/continuum) — `legacy/vault/conditions.py` | Explicit, non-automatic consent before disclosure |
| Local-first UI, loopback server, no hosted backend | continuum — `continuum_web/` | The frontend pattern, not the implementation |
| Confidence ceiling by observational diversity | [cronos](https://github.com/annatchijova/cronos) — `chain.py`, `quality.py` | The idea that corroboration diversity bounds trust, not the code |
| Adversarial test model (forge, truncate, tamper) | [forge](https://github.com/annatchijova/forge) — `sealing.py`, `test_red_team_adversarial.py` | Test *categories* to cover, not test code |

## What this means concretely

- Nothing in this repository's `src/`, `contracts/`, or `tests/` directories
  was written before August 7, 2026, 10:00 GMT-3.
- No file from any repository above was opened for copy-paste during this
  event — they were read *before* the event (see each repo's own commit
  history for proof of prior, independent existence) as design reference
  only.
- Where VIGÍA's Python and this project's TypeScript/Compact happen to use
  similar variable or function names, it's because the *concept* has an
  obvious name in both languages (e.g. `corroboration_count`), not because
  code was translated line-by-line.

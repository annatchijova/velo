# Synthetic evidence cases for VELO

## Case format

```json
{
  "case_id": "VELO-XXX",
  "name": "Case name",
  "description": "...",
  "expected_verdict": "MALICE",
  "expected_corroboration_count": 2,
  "devil_advocate": "...",
  "custodyEvents": [{ "eventType": "IDENTIFIED", "timestamp": "...", "detail": "..." }, ...],
  "artifacts": [...],
  "expected_fractures": [...],
  "peirce_chain": { "firstness": "...", "secondness": "...", "thirdness": "..." },
  "demo_quote": "..."
}
```

**`artifacts[]` must match `Artifact` in `src/engine/evidence.ts` exactly** — `entropyMilliBits` (integer, bits/byte × 1000), `provenanceChain` (camelCase), and `markers` values drawn only from the closed vocabulary below. This is enforced by `tests/corpus.test.ts`, which loads every file in this directory and runs it through the real `runAllDetectors`/`score`, not by convention (red team F5: this corpus used to carry invented markers and mismatched field names that made the whole demo unreproducible against its own engine).

**`custodyEvents[]`** is the real acquisition history — `eventType` from `CUSTODY_EVENT_TYPES` in `src/seal/custody.ts` (`IDENTIFIED`, `COLLECTED`, `ACQUIRED`, `PRESERVED`, `ANALYZED`, `SEALED`). An empty array forces `ABSTAIN`, mirroring exactly how `seal_case` derives `custodyValid` over the real MCP protocol (red team F13) — there is no separate `custodyValid: true/false` flag to fake.

## Artifact types

- `file`: file on disk.
- `process`: in-memory process execution.
- `log`: log entry.
- `network`: network flow or connection.
- `registry`: Windows registry key.
- `dns_record`: DNS record.

## Detector markers

### Temporal detector (`detectTemporalViolation`)
- `cause_event`: artifact that should be a cause.
- `effect_event`: artifact that should be an effect.
- `effect_before_cause`: physical violation of causality.
- `temporal_entropy_null`: inhumanly uniform intervals.

### Cross-source contradiction detector (`detectCrossSourceContradiction`)
- `log_vs_memory`: log says X, memory doesn't confirm it.
- `network_vs_host`: network traffic contradicts host state.
- `cryptographic_inconsistency`: signature/hash/hash chain doesn't verify.

### Anti-forensic detector (`detectAntiForensicMarker`)
- `log_cleared`: log deleted/truncated.
- `timestamps_stomped`: manipulated timestamps.
- `usn_journal_gap`: gap in the USN journal.
- `mft_entry_anomaly`: MFT anomaly.
- `surgical_deletion`: deletion via shred/multi-pass overwrite.

### Narrative pattern detector (`detectNarrativePattern`)
- `competence_theater`: simulated incompetence.
- `narrative_poisoning`: emotional distraction covering a technical act.
- `false_flag_attribution`: inconsistent planted attribution.
- `documentary_fabrication`: documents with inconsistent metadata.

### Path/process detector (`detectProcessMasquerade`)
- `process_masquerade`: process trying to look like another.
- `unusual_path`: unexpected path for the process.
- `parent_anomaly`: incorrect parent process.

## Verdict rules

Exact thresholds, from `src/engine/scorer.ts` (previously this section stated `> 0.10` for SUSPICION, which didn't match the code — fixed as part of red team F5):

- `ABSTAIN`: `custodyValid` is false — no custody events, or the chain doesn't verify. Short-circuits before any detector result is even considered.
- `MALICE`: score > 33/100 **AND** `corroborationCount >= 2` **AND** `devil_advocate != ""`. Missing the devil's advocate degrades an otherwise-qualifying case to `SUSPICION` rather than publishing it.
- `SUSPICION`: score > 33/100 with `corroborationCount < 2`, **or** score in (8/100, 33/100].
- `NOISE`: score <= 8/100 (in practice: no detector fired at all — the lightest single detector weighs 1/5).

No single detector category can reach the MALICE threshold alone (the heaviest, anti-forensic, is 3/10 < 33/100) — `MALICE` structurally requires at least two different detector categories to fire, from at least two independently-sourced artifacts.

## Included cases

| Case | Verdict | Detectors | Inspired by VIGÍA |
|---|---|---|---|
| `VELO-001-peon-confesion.json` | MALICE | Temporal + anti-forensic + network | `case_083_sacrificio_del_peon` |
| `VELO-002-logs-uniformes.json` | SUSPICION | Statistical uniformity + memory contradiction | `case_002_log_fabrication` |
| `VELO-003-falso-flag.json` | MALICE | Memory anomaly + attribution mismatch | `case_003_false_flag` |
| `VELO-004-cadena-rota.json` | ABSTAIN | Provenance break | `case_004_provenance_break` |
| `VELO-005-convergencia.json` | MALICE | Memory + network + disk (TPM as unscored context) | `case_005_multi_source` |
| `VELO-006-vacio-quirurgico.json` | MALICE | Anti-forensic + entropy anomaly | `case_009_vacio_quirurgico` |
| `VELO-007-ventrilocuo.json` | MALICE | Path incongruence + network anomaly | `case_026_ventrilocuo_process_hollowing` |
| `VELO-008-mise-en-place.json` | MALICE | Code anomaly + log silence | `case_085_mise_en_place_alterada` |
| `VELO-009-trampa-soporte.json` | SUSPICION | Single competence-theater signal | `case_084_cebo_falso_layman` (no corroboration) |
| `VELO-010-dia-normal.json` | NOISE | None | benign baseline |
| `VELO-011-two-badges.json` | SUSPICION | Physical access vs. network (cross-source) | new — frontend access-model fixture |
| `VELO-012-quiet-resignation.json` | SUSPICION | Log vs. device registry (cross-source) | new — frontend access-model fixture |
| `VELO-013-anonymous-drop.json` | ABSTAIN | Provenance break | new — unclaimed-case fixture |
| `VELO-014-lo-que-no-se-miro.json` | ABSTAIN | None — declared coverage gaps | new — absence-of-evidence fixture |

`VELO-014` is the controlled twin of `VELO-010`. Both carry clean artifacts and a
valid custody chain, both score exactly `0/1`, and no detector fires in either.
The only difference is that `VELO-014` declares two `coverageGaps` — a proxy log
that rotated before it was requested, and a registry hive destroyed by a routine
reimage — so the engine returns ABSTAIN where `VELO-010` returns NOISE.

The pair exists because `NOISE` was saying two different things with one word: *I
looked everywhere and found nothing*, and *the source that would have settled this
was never available*. The first is a finding; the second is an unknown. A test
pins the comparison (`tests/corpus.test.ts`), including that withholding the gaps
returns `VELO-014` to NOISE — so the pair cannot drift into differing for some
other reason while still appearing to prove the point.

Gaps are declared by the analyst, never inferred: the engine cannot know what was
never collected. They degrade a **negative** finding only. A corroborated MALICE
with the same gaps stays MALICE — an unrelated log rotating does not erase
evidence of what is there.

`VELO-011`, `VELO-012` and `VELO-013` exist to exercise the perito-facing "my cases" view in the frontend: see [`peritos-syntetic/README.md`](../peritos-syntetic/README.md#own-vs-others-visibility-rule-for-the-frontend) for the visibility contract they're designed to test.

Run `npm test` to verify all 14 cases against the live engine (`tests/corpus.test.ts`) — this is not a one-time check, it re-runs the whole corpus against `runAllDetectors`/`score` every time the suite runs, so a future edit to either the engine's marker vocabulary or a case's artifacts that breaks the match fails the build instead of silently drifting again.

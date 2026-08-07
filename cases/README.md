# Casos sintéticos de evidencia para VELO

## Formato de un caso

```json
{
  "case_id": "VELO-XXX",
  "name": "Nombre del caso",
  "description": "...",
  "expected_verdict": "MALICE",
  "expected_corroboration_count": 2,
  "devil_advocate": "...",
  "artifacts": [...],
  "expected_fractures": [...],
  "peirce_chain": { "firstness": "...", "secondness": "...", "thirdness": "..." },
  "demo_quote": "..."
}
```

## Tipos de artefacto

- `file`: archivo en disco.
- `process`: ejecución de proceso en memoria.
- `log`: entrada de log.
- `network`: flujo o conexión de red.
- `registry`: clave de registro Windows.
- `dns_record`: registro DNS.

## Marcadores de detectores

### Detector temporal (`detectTemporalViolation`)
- `cause_event`: artefacto que debería ser causa.
- `effect_event`: artefacto que debería ser efecto.
- `effect_before_cause`: violación física de causalidad.
- `temporal_entropy_null`: intervalos inhumanamente uniformes.

### Detector de inconsistencia cross-source (`detectCrossSourceContradiction`)
- `log_vs_memory`: log dice X, memoria no lo confirma.
- `network_vs_host`: tráfico de red contradice estado del host.
- `cryptographic_inconsistency`: firma/hash/hash chain no verifica.

### Detector anti-forense (`detectAntiForensicMarker`)
- `log_cleared`: log borrado/truncado.
- `timestamps_stomped`: timestamps manipulados.
- `usn_journal_gap`: gap en USN journal.
- `mft_entry_anomaly`: anomalía MFT.
- `surgical_deletion`: borrado con shred/sobrescritura múltiple.

### Detector de patrón narrativo (`detectNarrativePattern`)
- `competence_theater`: incompetencia simulada.
- `narrative_poisoning`: distracción emocional para cubrir técnica.
- `false_flag_attribution`: atribución plantada inconsistente.
- `documentary_fabrication`: documentos con metadatos inconsistentes.

### Detector de ruta/proceso (`detectProcessMasquerade`)
- `process_masquerade`: proceso intenta parecer otro.
- `unusual_path`: ruta inesperada para el proceso.
- `parent_anomaly`: parent process incorrecto.

## Reglas de veredicto

- `MALICE`: score > 0.33 **Y** `corroboration_count >= 2`.
- `SUSPICION`: score > 0.10 pero sin corroboración suficiente.
- `NOISE`: score <= 0.08.
- `ABSTAIN`: evidencia inadmisible (cadena de custodia rota) o caso degenerado.

`MALICE` requiere `devil_advocate != ""`.

## Casos incluidos

| Caso | Veredicto | Detectores | Inspirado en VIGÍA |
|---|---|---|---|
| `VELO-001-peon-confesion.json` | MALICE | Temporal + anti-forense + network | `case_083_sacrificio_del_peon` |
| `VELO-002-logs-uniformes.json` | SUSPICION | Statistical uniformity + memory contradiction | `case_002_log_fabrication` |
| `VELO-003-falso-flag.json` | MALICE | Memory anomaly + attribution mismatch | `case_003_false_flag` |
| `VELO-004-cadena-rota.json` | ABSTAIN | Provenance break | `case_004_provenance_break` |
| `VELO-005-convergencia.json` | MALICE | Memory + network + disk + TPM | `case_005_multi_source` |
| `VELO-006-vacio-quirurgico.json` | MALICE | Anti-forense + entropy anomaly | `case_009_vacio_quirurgico` |
| `VELO-007-ventrilocuo.json` | MALICE | Path incongruence + network anomaly | `case_026_ventrilocuo_process_hollowing` |
| `VELO-008-mise-en-place.json` | MALICE | Code anomaly + log silence | `case_085_mise_en_place_alterada` |
| `VELO-009-trampa-soporte.json` | SUSPICION | Single competence-theater signal | `case_084_cebo_falso_layman` (sin corroboración) |
| `VELO-010-dia-normal.json` | NOISE | Ninguno | baseline benigno |

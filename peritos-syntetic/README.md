# Perfiles sintéticos de peritos para VELO (Capa 6 y Capa 7)

Corpus de identidades 100% sintéticas de peritos judiciales/forenses,
diseñado para alimentar el diseño de la **Capa 6** (credencial ZK del
perito, membership en Merkle tree sin revelar cuál sos) y la **Capa 7**
(segunda opinión ciega — dos peritos atestan el mismo `case_commitment`
independientemente).


## Por qué el schema tiene estos campos (grounding real)

Investigado el 2026-08-06 para no inventar una estructura arbitraria:

- **Argentina** — los peritos judiciales se inscriben por jurisdicción
  (Poder Judicial de la Nación, o por provincia — Córdoba, Buenos Aires,
  etc.), requieren **matrícula profesional vigente** certificada por el
  colegio/consejo respectivo, antigüedad mínima de matriculación
  (Buenos Aires pide 5 años), una **especialidad reconocida y validada**
  (ej. informática forense como especialidad dentro de un colegio de
  ingeniería/ciencias informáticas), y constancia de **capacitación
  continua**. La inscripción se renueva periódicamente, no es
  perpetua. [Fuentes: cpci.org.ar, justiciacordoba.gob.ar,
  scba.gov.ar, servicios.pjn.gov.ar]
- **EE.UU.** — certificaciones como GCFE (GIAC), CFCE (IACIS), EnCE
  (OpenText/Guidance), CCE, no garantizan superar un desafío Daubert por
  sí solas. Lo que de verdad sostiene la admisibilidad es la
  **trazabilidad del proceso**: notas de caso detalladas, versión exacta
  de las herramientas usadas, verificación de hashes, documentación de
  validación de la herramienta. La certificación es necesaria pero no
  suficiente. [Fuentes: giac.org, digitalforensicstoday.com,
  infosecinstitute.com]

**Conclusión de diseño:** la credencial ZK de Capa 6 no puede probar solo
"pertenezco al árbol de peritos acreditados" — tiene que probar
**vigencia en el momento de la atestación** (ventana `valid_from`/
`valid_until`, análoga a la renovación periódica argentina), porque una
matrícula vencida es exactamente el tipo de vector que un peritaje
plantado explotaría. Por eso el schema abajo separa "pertenece al árbol"
de "vigente ahora", como dos chequeos distintos — mismo patrón que VIGÍA
separa integridad de admisibilidad.

## Schema de un perfil

```json
{
  "perito_id": "VELO-PERITO-XXX",
  "public_alias": "identificador público post-atestación, NO el nombre real — lo único visible on-chain si Capa 6 no llega a anonimato completo",
  "jurisdiction_model": "AR | US | agnostic",
  "specialty": "...",
  "accrediting_body_synthetic": "nombre FICTICIO de colegio/consejo/certificadora — nunca una organización real",
  "credential_id_synthetic": "formato inspirado en matrícula/cert real pero con datos inventados",
  "matriculation_year": 20XX,
  "years_active": N,
  "valid_from": "fecha ISO",
  "valid_until": "fecha ISO",
  "continuing_education_hours_last_cycle": N,
  "cases_attested": ["VELO-XXX", ...],
  "credential_status_at_attestation": { "VELO-XXX": "VALID | EXPIRED | REVOKED" },
  "notes": "por qué este perfil existe / qué prueba de Capa 6-7 ejercita"
}
```

## Perfiles incluidos

| Perito | Modelo | Especialidad | Casos atestados | Ejercita |
|---|---|---|---|---|
| `VELO-PERITO-001` | AR | Informática forense | VELO-001, VELO-002 | Camino feliz, matrícula vigente |
| `VELO-PERITO-002` | US | Digital forensics (cert-based) | VELO-003, VELO-004 | Camino feliz, modelo US |
| `VELO-PERITO-003` | AR | Informática forense | VELO-005 (1ra opinión) | Capa 7: primera atestación independiente |
| `VELO-PERITO-004` | US | Digital forensics | VELO-005 (2da opinión) | Capa 7: segunda atestación ciega, mismo `case_commitment` |
| `VELO-PERITO-005` | agnostic | Informática forense | VELO-009, VELO-010 (vigente); VELO-006 (vencida) | Capa 6: hueco de vigencia entre dos matriculaciones — debe fallar el chequeo de vigencia en VELO-006 aunque pertenezca al árbol, y pasar en VELO-009/010 |

`VELO-PERITO-005` usa `credential_periods: [...]` (array de tramos) en vez
de un solo `valid_from`/`valid_until` — tiene una matrícula vencida sin
renovar a tiempo y una rematriculación posterior, con un hueco real entre
ambas. Los otros 4 perfiles usan el campo simple porque no necesitan
modelar un lapso. Verificado que los timestamps de los artefactos de cada
caso (`casos-sinteticos/*.json`) caen dentro (o, en el caso 005, fuera a
propósito) de la ventana declarada — no asumido de memoria.

`VELO-PERITO-005` es el caso adversarial clave: pertenece al Merkle tree
de acreditados (membership proof pasaría), pero al momento de atestar
`VELO-006` su ventana de vigencia ya había vencido — el circuito debe
rechazar por vigencia, no por pertenencia. Es el equivalente de Capa 6 al
`VELO-004-cadena-rota` de `casos-sinteticos/` (ABSTAIN por cadena de
custodia rota, no por veredicto).

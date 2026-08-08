# Auditoría de Seguridad — VELO v0.1.0 (Midnight Hack Buenos Aires)
## Red Team — Ronda 1

**Fecha:** 2026-08-07 · **Método:** Abductive Engineering (A–D–I) + Red-Team Auditing
**Alcance:** el proyecto completo entregado — 12 fuentes TypeScript + 12 JS compilados (`canonical`, `custody`, `bundle`, `verify`, `detectors`, `scorer`, `evidence`, `fraction`, `server`, `store`, `simulate`, `pipeline.test`), corpus de 13 casos VELO + 6 perfiles PERITO, y 9 documentos (README, ARCHITECTURE, CASES, FAQ, GLOSSARY, ROADMAP, PROGRESS_LOCAL, INSPIRATIONS, casos-VELO-explicados).
**Fuera de alcance (no entregado):** `contracts/velo.compact` (mencionado en PROGRESS_LOCAL como escrito pero no compilado), el frontend HTML. Todo lo dicho aquí sobre "el commitment on-chain" analiza el *diseño documentado*, no el contrato, que no pudo auditarse.
**Base:** no hay repositorio git disponible; la base son los hashes SHA-256 de los 68 archivos entregados, fijados en `redteam-evidence/BASE.sha256`. Runtime: Node.js v20.20.2, Python 3.12.12. Evidencia reproducible: `redteam-evidence/experiments/exp01…exp15` (+ `exp08_crosslang_python.py`), cada script declara su predicción **antes** de observar el resultado. Baseline verificada antes de atacar: suite 9/9 en verde, `simulate` end-to-end OK.

---

## Modelo de amenaza

Todo hallazgo se confirma **bajo este modelo**, no en abstracto:

- El atacante **PUEDE**: invocar las tools del MCP server (`seal_case`, `get_case`, `verify_commitment`, `list_my_cases`) — esa es la interfaz diseñada ("an agent can drive the flow conversationally"); controlar los campos de los artefactos que envía (markers, timestamps, `caseId`); modificar el archivo `bundle.json` local entre sellado y verificación; leer todo el código (es open source y `verify.js` se distribuye a jueces/contra-peritos).
- El atacante **NO PUEDE** (exclusiones explícitas): modificar el código del motor en la máquina del perito; comprometer el sistema operativo; alterar un ledger que **todavía no existe** (Capa 2 pendiente); romper SHA-256.
- Fronteras de confianza cruzadas: (a) cliente MCP → filesystem del perito; (b) archivo bundle local → veredicto presentado ante un juez; (c) markers declarados por el caller → veredicto sellado.

El "judge test" de la skill: *si un juez pidiera demostrar que la garantía del sistema nunca puede violarse, ¿qué habría que asumir?* Respuesta auditada: hoy hay que asumir (1) que nadie recompute SHA-256 sobre datos públicos, (2) que el caller declara markers honestos, y (3) que la promesa de Capa 2 se cumplirá tal cual está documentada. Los hallazgos F1–F4 viven en esas tres asunciones.

## Leyenda epistémica

**CODE FACT** (leído en el código) · **PLAUSIBLE HYPOTHESIS** (deducido, no ejecutado) · **CONFIRMED BY INDUCTION** (experimento ejecutado con antes/después) · **FALSIFIED** (experimento ejecutado, no se sostuvo).

Regla aplicada: ningún hallazgo dice CONFIRMED sin su experimento; los vectores que intenté y fallaron están en la tabla final — son parte del entregable.

---

## Resumen ejecutivo

| ID | Severidad | Nivel epistémico | Módulo | Hallazgo | Bucket |
|----|-----------|------------------|--------|----------|--------|
| F1 | **Crítica** | CONFIRMED | `store.ts` + `server.ts` | Path traversal de lectura/escritura vía `caseId`, explotable end-to-end por el protocolo MCP real | vulnerabilidad |
| F2 | **Alta** | CONFIRMED | `scorer.ts` + `detectors.ts` | El gate Daubert cuenta *categorías de detector*, no *fuentes independientes*: **un solo artefacto alcanza MALICE con "corroboration 4"** | vulnerabilidad de diseño |
| F3 | **Alta** | CONFIRMED | `bundle.ts` + docs | Lo que se commitea on-chain (fingerprint) **excluye la cadena de custodia**: el truncamiento/fabricación de custodia es invisible para el ancla planeado | fractura arquitectónica |
| F4 | **Alta** (build actual) | CONFIRMED | todo el perímetro | Sin secreto alguno, **cualquiera puede forjar un bundle completo** que `verify.js` acepta con `valid: true`; la salida "valid" sobrepromete "auténtico" | threat-model + semiótico |
| F5 | **Alta** (demo/credibilidad) | CONFIRMED | `cases/` ↔ `engine/` | Deriva total corpus↔motor: **8/13 casos divergen** del veredicto esperado; VELO-005 (caso insignia) → NOISE; ABSTAIN inalcanzable desde evidencia | integración |
| F6 | Media | CONFIRMED | `detectors.ts` | Detector temporal **fail-open** con timestamps inválidos (`NaN < x` → silencio) | vulnerabilidad |
| F7 | Media | CONFIRMED | `custody.ts` | El verificador chequea ligadura de hashes, no semántica: acepta eventType inventado, `seq` no consecutivo y timestamps desordenados | invariante no enforceado |
| F8 | Media-baja | CONFIRMED (deriva) / PLAUSIBLE (impacto) | `verify.ts` vs `canonical.ts` | Dos canonicalizers ya divergieron (bigint); el diseño "self-contained" garantiza deriva futura | arquitectónico |
| F9 | Media-baja | CONFIRMED | `canonical.ts` | Orden de claves UTF-16 (JS) vs code-point (otros lenguajes): un verificador independiente en Python calcula **otro hash** para el mismo bundle | especificación canónica |
| F10 | Baja-media | CONFIRMED (JS) / PLAUSIBLE (cross-parser) | `verify.ts` | Claves JSON duplicadas: el verificador valida el *último* valor; los bytes del archivo no están hasheados | robustez |
| F11 | Baja | CONFIRMED | `canonical.ts` | Enteros > 2⁵³ redondeados en silencio (`isInteger` debería ser `isSafeInteger`); colisión `-0`/`0` | higiene del camino de decisión |
| F12 | Baja | CONFIRMED | `verify.ts`, `store.ts` | Sin validación en el borde: excepciones no atrapadas (fail-closed, exit 1, nunca `valid: true`) | higiene |
| F13 | Media | CODE FACT (+corroborado en E15) | `server.ts` | `custodyValid: true` hardcodeado → ABSTAIN inalcanzable vía MCP; la cadena de custodia se fabrica *después* del análisis, con `now()` | diseño |

**Lectura honesta del conjunto:** el núcleo criptográfico local es sólido para lo que realmente es — un esquema de *integridad auto-referencial* muy bien construido (y, para 1,5 horas de trabajo, notablemente disciplinado). Los problemas serios no están en los hashes: están (1) en la única superficie de red real, que tiene un path traversal trivial; (2) en la distancia entre lo que el sistema *mide* y lo que sus documentos *prometen* (fuentes independientes, ancla anti-truncamiento); y (3) en que el corpus de demo y el motor fueron escritos por dos sesiones paralelas que nunca compartieron un contrato de esquema — hoy la demo no reproduce sus propios casos.

---

## Hallazgos

### F1 — Path traversal de lectura y escritura vía `caseId` (store.ts:22,28 → server.ts)

**Severidad:** Crítica · **Nivel:** CONFIRMED BY INDUCTION (E1 + E15) · **Bucket:** vulnerabilidad de software.

- **Sorpresa:** un sistema diseñado para que "nada salga de la máquina del perito" permite escribir archivos arbitrarios fuera de su directorio de trabajo con solo nombrar mal un caso.
- **Abducción (rivales considerados):** (a) `join()` neutraliza `..` — descartada por economía: `path.join("local-cases", "../x.json")` = `local-cases/../x.json`; (b) zod valida `caseId` en el server — descartada leyendo `server.ts:73` (`z.string()` sin patrón); (c) el traversal existe y es alcanzable por la interfaz MCP. Test más barato y discriminante primero: llamar a `saveBundle` directo, luego end-to-end.
- **Deducción:** si (c), entonces `saveBundle({caseId: "../escaped"})` escribe fuera del store, `loadBundle("../secret")` lee fuera, y un `tools/call seal_case` con `caseId: "../pwned"` por JSON-RPC real produce el mismo efecto.
- **Inducción:**
  - E1 — `saveBundle` devolvió `/tmp/velo-poc-e1/escaped.json` (fuera de `local-cases/`); `loadBundle("../secret")` devolvió el contenido del JSON externo. **Predicción cumplida.**
  - E15 — contra el MCP server real (stdio JSON-RPC, dependencias instaladas del propio `package.json`): `seal_case` con `caseId: "../pwned"` → el server respondió `"savedTo": "pwned.json"` y el archivo quedó escrito **fuera** de `local-cases/`. **Predicción cumplida.**
- **Cadena causal:**
  ```
  caseId controlado por el caller (cualquier agente MCP)
      ↓ z.string() sin patrón (server.ts:73)
  join(dir, `${caseId}.json`)  (store.ts:22, 28)
      ↓ ".." atraviesa el directorio del store
  writeFileSync / readFileSync en ruta arbitraria con sufijo .json
      ↓
  escritura: sobrescritura de cualquier .json escribible (p.ej. ../package → package.json del proyecto)
  lectura:   cualquier .json legible por el proceso devuelto por get_case/verify_commitment
  ```
- **Precondición de threat-model:** el atacante puede llamar tools MCP — que es exactamente la interfaz pública del producto. No requiere acceso local previo.
- **Fix mínimo:** validar `caseId` en el borde (`z.string().regex(/^[A-Za-z0-9._-]+$/)`) *y* defensa en profundidad en `store.ts` (`resolve()` + verificación de prefijo contra el directorio del store). Las dos: el esquema es la frontera, el store no debe confiar en sus callers.

---

### F2 — El gate Daubert cuenta categorías de detector, no fuentes independientes (scorer.ts:44-50)

**Severidad:** Alta · **Nivel:** CONFIRMED BY INDUCTION (E3) · **Bucket:** vulnerabilidad de diseño (invariante del sistema roto).

- **Sorpresa:** la regla que justifica la existencia entera del proyecto — *"MALICE requires at least two independent corroborating sources"* (README, ARCHITECTURE capa 3, GLOSSARY, y el claim del circuito ZK) — se satisface con **una sola fuente física**.
- **Abducción (rivales):** (a) el scorer cuenta artefactos — falso, leído: cuenta `detectorResults.filter(fired)`; (b) un artefacto solo puede disparar una categoría — falso, `HAS()` es por marker y los markers son strings libres del caller; (c) el claim "fuentes independientes" se cumple por construcción — hipótesis a falsar.
- **Deducción:** si el gate mide categorías, entonces UN artefacto con markers de 4 categorías + `devilAdvocate` no vacío produce `verdict=MALICE, corroborationCount=4`. Predicción discriminante: si (c) fuera cierta, el veredicto sería SUSPICION.
- **Inducción (E3-A):** un artefacto (`type:"file"`, una imagen de disco) con markers `["effect_before_cause","surgical_deletion","narrative_poisoning","process_masquerade"]` → observado: `{"verdict":"MALICE","corroborationCount":4,"score":"19/20","detectorsFired":["temporal","anti_forensic","narrative","process"]}`. **CONFIRMED bajo el threat-model donde el caller controla los markers** (que es el diseño actual: `markers: z.array(z.string())` en server.ts:30 — cualquier string pasa).
- **Hallazgo secundario (E3-B, CONFIRMED):** el detector temporal hace el producto cartesiano causa×efecto **sin exigir vínculo causal**: dos artefactos sin relación alguna (uno con `cause_event` a t₂, otro con `effect_event` a t₁<t₂) disparan `TEMPORAL_CAUSALITY_VIOLATION`. Las "fuentes" no solo no son independientes: ni siquiera necesitan estar relacionadas.
- **Cadena causal:**
  ```
  markers: strings libres declarados por el caller
      ↓ detectors.ts — HAS() por categoría, sin verificar fuente física ni relación causal
  corroborationCount = cantidad de CATEGORÍAS que dispararon (scorer.ts:44-45)
      ↓ gate: count >= 2  ✓  (con 1 artefacto: count = 4)
  MALICE sellado; verify.js re-chequea count >= 2 y también pasa
      ↓ Capa 2 (diseño documentado)
  el circuito probaría "corroboration_count >= 2" — es decir, "2 categorías", no "2 fuentes independientes"
  ```
- **Por qué es Alta y no "el perito corrupto ya estaba fuera de alcance":** la documentación exime al sistema del *perito que miente en el análisis*, pero el claim que viaja al ZK y al pitch es más fuerte: que la regla de *independencia* se cumplió. El sistema hoy no tiene ningún concepto de "fuente": `Artifact.source` es un string libre que nadie lee. Semióticamente, el signo `corroborationCount` produce en el lector (juez, jurado del hackathon) el interpretante "fuentes independientes", y su objeto es "categorías de detector disparadas". Eso es symbol abuse en el sentido estricto de la skill.
- **Fix:** definir fuente por proveniencia física (raíz distinta de `provenanceChain` / `source` normalizado) y exigir ≥2 raíces independientes; como mínimo, renombrar el campo y el claim a `detectorCategoriesFired` hasta que exista lo primero.

---

### F3 — El commitment on-chain planeado no ancla la cadena de custodia (bundle.ts:50-71 vs ARCHITECTURE capa 2 / GLOSSARY / custody.ts:87-95)

**Severidad:** Alta · **Nivel:** CONFIRMED BY INDUCTION (E12) · **Bucket:** fractura arquitectónica (Ronda 3: contratos de módulos individualmente correctos, composición que viola el invariante).

- **Sorpresa:** `custody.ts` declara que "the real defense against truncation is the on-chain commitment", y ARCHITECTURE §custody-chain que "`chain_tip` guards against silent truncation". Pero lo que los mismos documentos dicen que se commitea on-chain es el **analysis fingerprint** — que *excluye por diseño* la cadena de custodia y `sealedAt`.
- **Abducción (rivales):** (a) me equivoqué y el fingerprint incluye la cadena — falsada leyendo `deterministicCore` (bundle.ts:50-59: no está); (b) se commitea el `bundleHash`, que sí incluye el tip — contradicho por ARCHITECTURE capa 2 ("The fingerprint — not the raw bundle — is what gets committed on-chain") y GLOSSARY ("This is the value committed on-chain"); `custody.ts:91` dice "commitment/bundleHash" — **los documentos se contradicen entre sí sobre qué se commitea**; (c) la contradicción es real y el ancla anti-truncamiento, como está diseñada, no existe.
- **Deducción:** si (c), un bundle al que le trunco el evento SEALED y le recomputo solo el `bundleHash` (algoritmo público) mantiene **el mismo fingerprint** y pasa `verify.js`.
- **Inducción (E12):** sellado honesto → truncados los 2 últimos eventos → fingerprint **idéntico** (observado: `true`), `verifyBundle` → `{"valid":true,"reasons":[]}`, y `verify.js` CLI sobre el archivo truncado → `valid: true`, exit 0. **CONFIRMED bajo el threat-model donde el atacante modifica el bundle local (y recomputa hashes públicos).**
- **Cadena causal:**
  ```
  ARCHITECTURE: on-chain se commitea fingerprint
  fingerprint = sha256(canonicalize(core SIN custodyChain SIN sealedAt))
      ↓ atacante trunca/fabrica eventos de custodia
  fingerprint inalterado  →  la comparación contra el ledger (Capa 2) pasa
      ↓ bundleHash recomputado con algoritmo público
  verify.js: valid: true — historia de custodia reescrita, indetectable
  ```
- **Matiz de honestidad (Part 2 de la skill):** la limitación de truncamiento *de la cadena aislada* está ejemplarmente documentada por los autores (comentario + test que la hace visible). Lo que **no** está documentado es este segundo nivel: el ancla que invocan como defensa no cubre la cadena. Además ARCHITECTURE §"The custody chain" afirma sin calificadores que `chain_tip` detecta truncamiento — exactamente la frase que `custody.ts:93-94` prohíbe decir en el pitch. La documentación viola su propia instrucción.
- **Fix:** commitear on-chain un valor que incluya `custodyTip` (y decidir de una vez: ¿fingerprint o bundleHash? — si el reproducibility-story exige fingerprint, entonces el contrato necesita *ambos*: fingerprint para replay + tip para custodia). Alinear ARCHITECTURE, GLOSSARY y custody.ts.

---

### F4 — Sin ancla de autenticidad: forja completa de un caso que el verificador acepta (todo el perímetro)

**Severidad:** Alta en el build actual · **Nivel:** CONFIRMED BY INDUCTION (E11) · **Bucket:** threat-model assumption + defecto semiótico.

- **Sorpresa:** `verify.js` — la herramienta que se entrega al juez y al contra-perito "sin confiar en el resto del repo" — contiene la receta completa para fabricar lo que verifica. No hay secreto, firma, MAC ni ancla en ninguna parte del build: todo es `sha256` sobre datos públicos.
- **Deducción:** si no hay secreto, un atacante que controla el archivo `bundle.json` puede fabricar desde cero un caso completo (cadena ISO 27037 plausible, MALICE con 2 "fuentes", devil's advocate) que pase con exit 0.
- **Inducción (E11):** script de forja que **no importa nada del proyecto** — usa funciones copiadas verbatim de `verify.js`. Fabricó `VELO-COURT-EXHIBIT-7`, un caso inexistente con ciclo de custodia completo. `node verify.js` → `valid: true`, exit 0. **CONFIRMED bajo el threat-model donde el atacante puede modificar el bundle local.**
- **Precisión de lenguaje (Part 7 de la skill):** NO afirmo "el sello es manipulable" ni "se rompió el hash". Lo demostrado es: **se puede sellar un veredicto falso** — el sello funciona perfectamente sobre una entrada envenenada o inexistente. La garantía real del build actual es *consistencia interna*, no *autenticidad*.
- **Por qué no lo reporto como "ya documentado, no es hallazgo":** ARCHITECTURE §"What the proof does not establish" y el FAQ sí admiten "corrupt expert" y que el ancla es Capa 2 (pendiente). Pero hay una brecha semiótica que los documentos no cierran: `verify.js` imprime `valid: true` a secas. El interpretante que ese signo produce en un juez —"esto es auténtico"— excede su objeto —"esto es auto-consistente"—. En la herramienta dirigida explícitamente a no-técnicos, esa es la palabra más importante del sistema.
- **Fix:** renombrar la salida a `internally_consistent: true` + línea explícita "esto no prueba quién produjo el bundle ni cuándo; la autenticidad la ancla la atestación on-chain (pendiente)". Considerar un ancla interina local (firma Ed25519 con clave del perito) hasta que exista Capa 2.

---

### F5 — Deriva total corpus ↔ motor: la demo no reproduce sus propios casos (cases/*.json ↔ engine/*)

**Severidad:** Alta (credibilidad/demo) · **Nivel:** CONFIRMED BY INDUCTION (E4 + análisis estático) · **Bucket:** integración / composición entre sesiones paralelas.

- **Sorpresa:** CASES.md promete "ten synthetic cases the engine is designed to classify". Ejecutados de verdad, **8 de 13 divergen** del veredicto esperado.
- **Hechos de código (CODE FACT):** el corpus usa 46 markers; **32 no existen** en el union type `Marker` del motor (`process_injection`, `c2_beacon`, `known_malware_hash`, `orphaned_provenance`, `statistical_uniformity`…). 6 markers del motor nunca aparecen en el corpus. Los campos tampoco coinciden: `entropy` (float, p.ej. 3.145 — que `canonicalize` rechazaría) vs `entropyMilliBits` (int); `provenance_chain` vs `provenanceChain`; `case_id` vs `caseId`. PROGRESS_LOCAL confirma la causa: dos sesiones de Claude Code en paralelo sin contrato compartido.
- **Deducción:** si los markers no existen, los detectores no disparan; los casos MALICE ricos en markers desconocidos caen a NOISE, y ABSTAIN —que en el motor solo se alcanza por `custodyValid=false`, no por evidencia huérfana— es inalcanzable desde los casos.
- **Inducción (E4, mapeo de campos caritativo a favor del corpus):**
  - VELO-005 (el caso insignia, "four independent sources converge", MALICE esperado corr 4) → **NOISE, corr 0**. Los 7 markers del caso son desconocidos.
  - VELO-004 y VELO-013 (ABSTAIN esperado por cadena de custodia rota) → **NOISE**. El motor no tiene ningún detector de proveniencia: la historia "un hash fuerte sin custodia es inadmisible" no está implementada — ABSTAIN solo existe como flag externo.
  - VELO-003/006/007/008/011 (MALICE) → SUSPICION o NOISE.
  - VELO-002 "matchea" SUSPICION pero con `corroborationCount=2` donde el caso declara 1 — matchea por la razón equivocada.
  - Observado en total: **8/13 divergen**.
- **Cadena causal:** sesiones paralelas sin esquema compartido → el corpus habla un vocabulario que el motor no tipa → los detectores (string matching exacto) no disparan → veredictos distintos de los documentados → el pitch ("the engine classifies these cases") no es reproducible hoy.
- **Fix:** un solo `Marker` union importado por ambos lados (o codegen del union desde los casos), zod/TS estricto en el loader de casos, y un test CI que corra el corpus contra `expected_verdict` — la skill lo diría así: convertir el contrato en construcción, no en convención. Y decidir si ABSTAIN-por-proveniencia es un detector (markers `orphaned_provenance` ya existen en el corpus) o sigue siendo externo.

---

### F6 — Detector temporal fail-open con timestamps inválidos (detectors.ts:28)

**Severidad:** Media · **Nivel:** CONFIRMED BY INDUCTION (E5) · **Bucket:** vulnerabilidad (validación ausente en el borde).

- **Deducción:** `new Date("basura").getTime()` = `NaN`; `NaN < x` es `false`; ningún schema valida ISO 8601 (`timestamp: z.string()` en server.ts:25) → un timestamp inválido silencia la comparación.
- **Inducción (E5):** par causa/efecto invertido con timestamps válidos → dispara (`TEMPORAL_CAUSALITY_VIOLATION`); el mismo par con `timestamp: "no-es-una-fecha"` en el efecto → **no dispara, sin error ni log**. CONFIRMED: fail-open silencioso.
- **Fix:** validar `z.string().datetime()` en el borde y/o hacer que el detector falle cerrado (fractura `TIMESTAMP_UNPARSEABLE`, que además es forensemente interesante: un timestamp ilegible *es* una anomalía).

### F7 — El verificador de custodia valida hashes, no semántica (custody.ts:97-118)

**Severidad:** Media · **Nivel:** CONFIRMED BY INDUCTION (E10) · **Bucket:** invariante declarado no enforceado.

- `custody.ts:4-8` declara un "closed vocabulary" inspirado en ISO/IEC 27037. **Inducción (E10):** cadena con `eventType: "EVENTO_INVENTADO"`, `seq` = 0,1,42 y timestamps en orden cronológico inverso → `verifyCustodyChain` → `valid: true, "All links verified independently."` El vocabulario cerrado es un comentario, no una construcción (Part 4, regla 5 de la skill de abducción: los enums cerrados deben ser construcción del sistema, no prosa). El TS type se borra en runtime; y el verificador standalone —la herramienta del juez— ni siquiera conoce el vocabulario.
- **Fix:** en `verifyCustodyChain` (ambas copias): `eventType ∈ CUSTODY_EVENT_TYPES`, `seq === índice`, timestamps parseables. Costo: ~6 líneas.

### F8 — Dos canonicalizers, ya divergidos (verify.ts:49-66 vs canonical.ts:35-69)

**Severidad:** Media-baja · **Nivel:** deriva CONFIRMED BY INDUCTION (E13); impacto PLAUSIBLE HYPOTHESIS · **Bucket:** fractura de mantenimiento.

- El verificador "deliberately self-contained" copia `canonicalize` en vez de importarla. **Ya divergieron:** `canonical.ts` acepta `bigint` (`5n` → `"5n"`); la copia en `verify.ts` lanza `unsupported type bigint` (E13, ambas ramas ejecutadas). La alcanzabilidad hoy es baja (JSON no porta bigint; los bundles reales no lo contienen) — por eso el impacto queda en hipótesis. Pero la dirección está garantizada: cada cambio futuro de `canonical.ts` exige recordar sincronizar a mano la copia cuya única razón de ser es *no depender* del original. Es la paradoja del diseño: la independencia del verificador se compró con doble fuente de verdad.
- **Fix:** generar `verify.js` por build desde `canonical.ts` (bundleo de un solo archivo, cero deps — se mantiene la propiedad "juez no necesita el repo"), o al menos una suite de vectores de conformencia (entradas → hashes esperados) ejecutada contra ambas implementaciones en CI.

### F9 — Orden de claves UTF-16 vs code-point: el verificador independiente calcula otro hash (canonical.ts:64)

**Severidad:** Media-baja · **Nivel:** CONFIRMED BY INDUCTION (E8) · **Bucket:** defecto de especificación canónica.

- `Object.keys(record).sort()` ordena por unidades de código UTF-16. Los caracteres del plano astral (emoji, CJK ext-B) se comparan como pares sustitutos. En casi todo otro lenguaje, `sorted()` ordena por code point. **Inducción (E8):** el objeto `{"😀":1,"\uE000":2,"normal":3}` canoniza en Node como `v1:{"normal":3,"😀":1,"":2}` (sha256 `a091…`) y en una reimplementación razonable en Python como `v1:{"normal":3,"":2,"😀":1}` (sha256 `1331…`). Mismo valor lógico, dos hashes → un contra-perito que reimplemente el verificador (el caso de uso explícito de `verify.js`) concluiría "hash mismatch — evidencia alterada" sobre un bundle íntegro. En un contexto judicial, un falso negativo de integridad es casi tan dañino como un falso positivo.
- **Fix:** especificar el orden *explícitamente* en el formato v2 ("ordenar por unidad UTF-16" o "por code point", con vectores de test incluyendo plano astral) e implementar comparador explícito, no el default del lenguaje.

### F10 — Claves JSON duplicadas: el archivo y lo verificado pueden contar historias distintas (verify.ts:163)

**Severidad:** Baja-media · **Nivel:** CONFIRMED en JS (E9) / PLAUSIBLE cross-parser · **Bucket:** robustez de canonicalización.

- Lo que se hashea es la forma canónica del valor *parseado*, nunca los bytes del archivo. **Inducción (E9):** bundle con `"verdict": "NOISE"` seguido de `"verdict": "MALICE"` → `grep` muestra ambas, `JSON.parse` (last-wins) toma MALICE, `verify.js` → `valid: true`, exit 0. Un lector humano del archivo ve NOISE primero; el verificador certifica MALICE. RFC 8259 declara impredecible el comportamiento ante claves duplicadas: parsers que toman el *primer* valor (existen en el ecosistema Java/Go) producirían el veredicto opuesto sobre los mismos bytes.
- **Fix:** rechazar duplicados al parsear (reviver/parse manual) o sellar *además* el hash de los bytes crudos del archivo.

### F11 — Enteros inseguros y `-0` en el camino de decisión (canonical.ts:45-54)

**Severidad:** Baja · **Nivel:** CONFIRMED BY INDUCTION (E6, E7) · **Bucket:** higiene del camino de decisión.

- E6: el JSON fuente dice `"seq": 9007199254740993`; el parser redondea a `…992` *en silencio*; `Number.isInteger` lo acepta; el sello certifica un número que no es el del documento. La regla del propio comentario ("throws rather than silently losing precision") se viola para enteros > 2⁵³: debería ser `Number.isSafeInteger`. E7: `canonicalize(-0) === canonicalize(0)` aunque `Object.is(-0,0)===false` — colisión real pero inalcanzable vía JSON (no preserva `-0`); solo in-memory. Impacto práctico acotado (los campos actuales son chicos), pero el invariante "sin pérdida silenciosa" es el corazón del sistema: merece el chequeo.

### F12 — Sin validación en el borde: el verificador crashea en vez de invalidar (verify.ts:163)

**Severidad:** Baja · **Nivel:** CONFIRMED BY INDUCTION (E2) · **Bucket:** higiene.

- Batería sobre `verify.js`: JSON malformado → `SyntaxError`; JSON que es un string → `TypeError: Cannot read properties of undefined`; `custodyChain: null` → `TypeError`; `evidenceManifest` anidado 100.000 niveles → crash del parser con dump del archivo. **En todos los casos: exit 1 y jamás se imprime `valid: true` — falla cerrada**, lo cual es lo importante y está bien. Lo que falta es la forma: un juez recibe un stack trace en vez de "inválido: no es un bundle". Adicional (CODE FACT, no ejecutado — etiquetado honestamente): `store.listBundles` parsea todo `.json` del directorio sin `try`, así que un solo archivo corrupto tumba `list_my_cases`; y `loadBundle` castea a `SealedBundle` sin validar.

### F13 — El camino MCP fabrica la custodia a posteriori y anula ABSTAIN (server.ts:78-87)

**Severidad:** Media · **Nivel:** CODE FACT (corroborado en E15) · **Bucket:** diseño.

- `seal_case` llama `score({..., custodyValid: true})` — hardcodeado: el gate "custodia rota → ABSTAIN" (el test estrella de la suite) es **inalcanzable por la interfaz real del producto**. Y la cadena que se sella se construye en ese momento, con dos eventos genéricos (`IDENTIFIED`, `ANALYZED`) y timestamps `new Date()` — *después* del análisis, no ligada a ninguna adquisición real de evidencia. En el camino MCP, la cadena de custodia es decorativa: certifica que el server corrió, no que la evidencia fue custodiada. Combinado con F4, un bundle sellado vía MCP afirma una historia de custodia que nadie vivió.

---

## Vectores descartados (intentados, no explotables)

La falsificación es un resultado de primera clase. Estos ataques se ejecutaron y **fallaron** — el sistema los resiste:

| Vector | Experimento | Resultado | Por qué falló |
|---|---|---|---|
| Alterar un campo del bundle sin recomputar hashes | E14(a): `verdict` MALICE→NOISE | **Detectado** (`fingerprint mismatch`) | el fingerprint cubre todo el núcleo |
| Reordenar eventos medios de la cadena | E14(b): swap seq 0↔1 | **Detectado** (`Broken link`) | ligadura prevHash correcta |
| Inyectar un evento en el medio sin recomputar los siguientes | E14(c) | **Detectado** (`Tampered entry`) | ídem |
| Truncar la cadena **sin** recomputar `bundleHash` | E14(g) | **Detectado** | el tip está dentro del bundleHash (refina F3: el bypass exige recomputar, lo cual es público) |
| MALICE con un solo detector por score | E14(d): los 5 markers anti-forenses juntos (peso 3/10) | **Rechazado** (SUSPICION) | el peso máximo individual (3/10 ≤ 33/100) está alineado con el gate — decisión de diseño correcta |
| Romper monotonía: que agregar evidencia *baje* el score | E14(e): los 19×19 pares de markers | **0 violaciones** | pesos ≥ 0 y `HAS()` por existencia: el score es monótono por construcción |
| Colisión NFC/NFD (dos strings distintos, un hash) | E14(f): `"café"` compuesto vs descompuesto | **FALSIFICADO como vuln** | la normalización NFC es intencional y colapsa equivalentes semánticos; comportamiento correcto |
| Injertar la cadena a otro `caseId` | suite propia (`pipeline.test.js`) + E11 (control negativo) | **Detectado** (`Genesis hash does not match`) | génesis ligada al caseId |

## Fortalezas observadas (constancia para el juez de la auditoría)

- Aritmética exacta (`Fraction` con bigint, sin floats en decisión) y *fail-closed* en todos los crashes observados: ningún input hostil produjo jamás `valid: true`.
- Separación fingerprint/bundleHash conceptualmente correcta y bien motivada (lección EBS v1 documentada).
- El scorer degrada MALICE→SUSPICION sin devil's advocate: la propia regla Daubert falla cerrada.
- Documentación inusualmente honesta: la limitación de truncamiento de la cadena aislada tiene comentario + test que la hace visible a propósito; las tools pendientes devuelven error explícito en vez de simular; "what the proof does **not** establish" está escrito.
- 9/9 tests reales incluyendo tests adversariales; el verificador standalone no tiene dependencias.

## Recomendaciones (fuera del alcance de este informe — solo registro)

1. **F1 (hoy):** regex de `caseId` en zod + `resolve()`/prefix-check en `store.ts`.
2. **F2 (antes de cualquier pitch):** redefinir corroboración por raíz de proveniencia física, o renombrar el claim a "categorías de detector" en README/ARCHITECTURE/GLOSSARY/contrato.
3. **F3 (antes de compilar el contrato):** decidir qué se commitea (fingerprint **y** tip de custodia) y alinear los tres documentos que hoy se contradicen.
4. **F4:** salida del verificador: `internally_consistent`, con una línea sobre lo que no prueba; evaluar firma local interina.
5. **F5:** contrato de esquema único casos↔motor + test CI del corpus contra `expected_verdict`; decidir si ABSTAIN-por-proveniencia es un detector.
6. **F6/F7/F11/F12:** validaciones de borde (datetime, safe-integer, vocabulario de custodia, parse estricto) — todas de pocas líneas.
7. **F8/F9:** canonicalizer único generado + orden de claves especificado explícitamente con vectores astrales.
8. **F13:** construir la custodia ligada a la adquisición real; no hardcodear `custodyValid`.

## Qué NO se verificó (fallibilismo explícito)

- `contracts/velo.compact`: no fue entregado; las observaciones sobre Capa 2 son sobre el *diseño documentado*. Los propios autores ya marcaron dos puntos para revisión (`persistentHash` vs `persistentCommit`, necesidad real de `disclose()`) — quedan pendientes para cuando el contrato esté disponible.
- El frontend HTML (en construcción por otro miembro, no entregado).
- Comportamiento del SDK MCP en otras versiones; la E15 corrió con las versiones fijadas en `package-lock.json` entregado.
- No se auditó el contenido semántico de los 6 perfiles PERITO (son fixtures de credenciales para capas futuras sin código que los consuma hoy).
- Un hallazgo confirmado no cierra la búsqueda de una segunda causa contribuyente: F2 y F5 podrían tener más instancias en caminos no ejercitados (p.ej. interacciones entre drift de markers y detector temporal).

## Reproducibilidad

- **Scripts:** `redteam-evidence/experiments/exp01…exp15` (+ `exp08_crosslang_python.py`); cada uno imprime `PREDICCION` antes de `OBSERVADO`. Artefactos generados: `velo-forged-bundle.json`, `velo-truncated-bundle.json`, `velo-dupkey-bundle.json` (misma carpeta).
- **Proyecto runnable reconstruido:** `redteam-evidence/project/` con el layout original (`src/engine`, `src/seal`, `src/mcp`, `tests`); baseline: `node --test tests/` → 9/9; `node src/simulate.js` → flujo completo.
- **Base fijada:** `redteam-evidence/BASE.sha256` (68 archivos, hashes SHA-256 de lo entregado). Runtime: Node.js v20.20.2, Python 3.12.12, `@modelcontextprotocol/sdk` y `zod` según `package-lock.json` entregado.
- **Re-correr todo:** `cd redteam-evidence/experiments && for e in exp*.mjs; do node $e; done && python3 exp08_crosslang_python.py`.

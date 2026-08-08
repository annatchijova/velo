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

**Writing** needs Bun, a funded wallet with NIGHT *registered for dust
generation*, and a local proof server. The full runbook — including the two
errors you will hit and their real causes — is [`docs/CHAIN.md`](./CHAIN.md).
Do not improvise that part; the errors are misleading (`Insufficient Funds` is
not a funding problem) and CHAIN.md exists because we lost hours to exactly
that.

Use a disposable wallet. The deploy dependency logs its seed unconditionally;
this repo redacts it, but that is a mitigation around a third-party default,
not a guarantee.

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

**Escribir** necesita Bun, una billetera con NIGHT *registrado para generación
de dust*, y un proof server local. El runbook completo, con los dos errores que
te vas a encontrar y sus causas reales, está en [`docs/CHAIN.md`](./CHAIN.md).
No improvises esa parte: los errores son engañosos (`Insufficient Funds` no es
un problema de fondos) y CHAIN.md existe porque perdimos horas exactamente ahí.

Usá una billetera descartable. La dependencia de deploy loguea su semilla
incondicionalmente; este repo la redacta, pero eso es una mitigación alrededor
de un default ajeno, no una garantía.

## 6. Si algo se rompe

| Síntoma | Causa |
|---|---|
| `Cannot find module '../dist/...'` | Te salteaste `npm run build`, o `npm run clean` lo borró |
| El frontend no resuelve `velo/*` | Corriste `npm install` dentro de `frontend/`. Borrá `frontend/node_modules` y corré `npm install` en la raíz |
| Un script de verificación "pasa" al instante sin imprimir nada | Revisá el runtime — F16 y el chequeo del salt son sensibles al runtime a propósito |
| `Insufficient Funds: could not balance dust` | No son fondos. El NIGHT tiene que estar *registrado* para generar dust. [CHAIN.md](./CHAIN.md) |
| `1010: ... Custom error: 170` | Estado de DUST viejo, no un desajuste de versiones. Volvé a correrlo. [CHAIN.md](./CHAIN.md) |

Dónde vive cada cosa: [`docs/STRUCTURE.md`](./STRUCTURE.md).

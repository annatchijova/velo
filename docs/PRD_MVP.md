# MVP PRD — VELO on Cloud Run

> The working app, not the showcase: queryable sealed cases, expert identity,
> and on-chain attestation status — deployed, phased, and tested.
>
> La app funcional, no la vidriera: casos sellados consultables, identidad de
> perito y estado de atestación on-chain — desplegado, por fases y testeado.

Related documents: [`ADRS_001_006.md`](./ADRS_001_006.md) (the decisions),
[`CHAIN.md`](./CHAIN.md) (the on-chain runbook this MVP builds on),
[`FRONTEND_TDD.md`](./FRONTEND_TDD.md) and [`ROOT_TDD.md`](./ROOT_TDD.md)
(the mandatory test workflows).

---

## English

### Context

The initial build closed the loop locally: a case is sealed, attested on-chain
with a real ZK proof (`deploy/attest-case.ts`, one attestation live on
`preview`), and read back from the ledger (`GET /api/chain`,
`src/chain/read.ts`). None of that is reachable by anyone but the person
running the repo, and nothing persists: a sealed case exists only in the
browser tab or the `local-cases/` file that produced it.

The MVP turns that loop into a deployed product:

1. The frontend is hosted on **Google Cloud Run** (live at
   `https://velo-1028999311218.us-central1.run.app`) so anyone can run the
   engine, seal, and verify. The Vercel deployment was abandoned due to a
   platform-side error; Cloud Run was chosen as the hosting target.
2. Sealed cases persist in a database and become a public, queryable ledger.
3. Experts get an identity (their Midnight wallet) and their seals carry it.
4. On-chain attestations are linked to sealed cases and shown with precise
   trust labels.

**Phase status** (as of 2026-08-08):
- **Phase 1** (PRD/ADR/ROOT_TDD docs): ✅ Done (PR #14 merged)
- **Phase 2** (deploy config): ✅ Done (PR #15 merged; Vercel-specific deploy
  superseded by Cloud Run deployment)
- **Phase 3** (persistence + wallet identity): 🔄 In progress
- **Phase 4** (attestation linkage + verification panel): ⏳ Pending

**Red team**: 6 rounds, 35 findings. F19/F20/F23/F25 fixed. F15/F21/F22 open.
F24 partial (seam type drift).

### Personas

| Persona | Who | Account |
|---|---|---|
| Forensic expert (perito) | Runs analyses, seals cases, attests on-chain | Midnight wallet (Lace/1AM), registered in the role registry |
| Judge / reviewer / opposing expert | Queries sealed cases, verifies commitments and attestation status | None — public reads |
| Anonymous public | Browses the corpus, runs demo seal/verify | None |

### Journeys and acceptance criteria

Test files reference these IDs (per `docs/FRONTEND_TDD.md` and
`docs/ROOT_TDD.md`).

**J1 — Anonymous demo (exists today).** Browse the corpus, run the engine,
demo seal/verify including the tamper demos; nothing persists.

- **AC-J1.1** Landing loads; EN/ES toggle works.
- **AC-J1.2** `/cases` lists the 14 synthetic cases with search and verdict
  filters.
- **AC-J1.3** Case detail: engine run → seal → verify; every tamper mode
  fails verification.
- **AC-J1.4** Demo-mode attestation is refused. *(Superseded in Phase 4: the
  browser attest path is retired entirely — demo users get an explanatory
  message, never a fake attestation seam.)*

**J2 — Expert seals and persists (net-new).** Connect wallet → recognized
via role registry → seal → bundle persisted under the expert's identity →
appears in the public sealed ledger.

- **AC-J2.1** Wallet connect (Lace/1AM) issues a server session (signed
  httpOnly cookie).
- **AC-J2.2** `POST /api/seal` (scenario `seal`): expert session → persists,
  returns `persisted: true` + id; anonymous → current behavior,
  `persisted: false`.
- **AC-J2.3** `GET /api/sealed`: public, filters (verdict, expert, date),
  pagination.
- **AC-J2.4** `GET /api/sealed/:id`: full stored bundle (public read).
- **AC-J2.5** Sealed ledger UI with filters; anonymous users get "demo only"
  messaging.
- **AC-J2.6** Unknown wallet address (connected but not in the registry) →
  session exists, persistence refused.

**J3 — Expert attests locally (CLI exists; the linkage is net-new).**
`deploy/attest-case.ts <caseId>` already proves and submits real
attestations. What is missing: posting the attestation record to the web API
and linking it to the persisted sealed case.

- **AC-J3.1** CLI loads the bundle, builds witnesses, submits via proof
  server + wallet. *(Already satisfied by `deploy/attest-case.ts`.)*
- **AC-J3.2** CLI posts `{bundleHash, txHash, commitment}` to
  `POST /api/attestations`, authenticated by an expert API key; the API
  resolves the sealed bundle by hash and verifies the expert owns it
  (ADR-006).
- **AC-J3.3** Refusals: internally inconsistent bundle → refuse; re-attesting
  the same commitment → refused by the circuit's replay guard.
- **AC-J3.4** Ledger and case detail show an attestation badge once recorded.

**J4 — Reviewer verifies, no account (net-new).** Query by case id or
commitment → internal-consistency + custody result + on-chain status.

- **AC-J4.1** Public verification panel at `/verify`; query by sealed-case id
  or commitment.
- **AC-J4.2** Shows internal consistency, custody validity, and on-chain
  status (attested / pending / not found) with explicit **chain-verified** vs
  **expert-reported** labels (ADR-003); covers list; never evidence.
- **AC-J4.3** Chain read unavailable → "chain status unavailable"; the page
  still works (an unreachable indexer is not the same as zero attestations).

### Non-goals (MVP)

Selective disclosure, the anonymous ZK expert credential, the blind second
opinion, mainnet, custom domain, reviewer accounts, browser-side proving,
MCP server hosting.

### Phase map

| Phase | Deliverable | Journeys | Status |
|---|---|---|---|
| 1 | This PRD + ADRs + ROOT_TDD + docs consistency | — | ✅ Done (PR #14) |
| 2 | Frontend live on **Cloud Run** (corpus served statically, chain reads work; Vercel config superseded by Dockerfile + gcloud deploy) | J1 | ✅ Done (PR #15 + Cloud Run deploy) |
| 3 | Persistence behind a DB adapter (Neon or Cloud SQL, picked at deploy time) + wallet identity + sealed ledger | J2 | 🔄 In progress |
| 4 | Attestation linkage + `/verify` panel + browser-seam retirement | J3, J4 | ⏳ Pending |

---

## Español

### Contexto

La construcción inicial cerró el ciclo localmente: un caso se sella, se atesta on-chain
con una prueba ZK real (`deploy/attest-case.ts`, una atestación viva en
`preview`) y se lee de vuelta del ledger (`GET /api/chain`,
`src/chain/read.ts`). Nada de eso es alcanzable más que por quien corre el
repositorio, y nada persiste: un caso sellado existe solo en la pestaña del
navegador o en el archivo `local-cases/` que lo produjo.

El MVP convierte ese ciclo en un producto desplegado:

1. El frontend queda hosteado en **Google Cloud Run** (vivo en
   `https://velo-1028999311218.us-central1.run.app`) para que cualquiera pueda
   correr el motor, sellar y verificar. El despliegue en Vercel se abandonó por
   un error del lado de la plataforma; Cloud Run quedó como destino de hosting.
2. Los casos sellados persisten en una base de datos y se vuelven un ledger
   público y consultable.
3. Los peritos tienen identidad (su wallet de Midnight) y sus sellos la
   llevan.
4. Las atestaciones on-chain quedan vinculadas a los casos sellados y se
   muestran con etiquetas de confianza precisas.

**Estado de fases** (al 2026-08-08):
- **Fase 1** (docs PRD/ADR/ROOT_TDD): ✅ Hecho (PR #14 mergeado)
- **Fase 2** (config de despliegue): ✅ Hecho (PR #15 mergeado; el deploy
  específico de Vercel fue reemplazado por el despliegue en Cloud Run)
- **Fase 3** (persistencia + identidad de wallet): 🔄 En progreso
- **Fase 4** (vínculo de atestaciones + panel de verificación): ⏳ Pendiente

**Red team**: 6 rondas, 35 hallazgos. F19/F20/F23/F25 arreglados. F15/F21/F22
abiertos. F24 parcial (deriva de tipos en la costura).

### Personas

| Persona | Quién | Cuenta |
|---|---|---|
| Perito forense | Corre análisis, sella casos, atesta on-chain | Wallet de Midnight (Lace/1AM), registrado en el registro de roles |
| Juez / revisor / perito de parte | Consulta casos sellados, verifica compromisos y estado de atestación | Ninguna — lecturas públicas |
| Público anónimo | Recorre el corpus, corre sellado/verificación demo | Ninguna |

### Recorridos y criterios de aceptación

Los archivos de test referencian estos IDs (según `docs/FRONTEND_TDD.md` y
`docs/ROOT_TDD.md`).

**J1 — Demo anónima (existe hoy).** Recorrer el corpus, correr el motor,
sellado/verificación demo incluyendo los tamper demos; nada persiste.

- **AC-J1.1** El landing carga; el toggle EN/ES funciona.
- **AC-J1.2** `/cases` lista los 14 casos sintéticos con búsqueda y filtros
  por veredicto.
- **AC-J1.3** Detalle de caso: corrida del motor → sellar → verificar; cada
  modo de tamper falla la verificación.
- **AC-J1.4** La atestación en modo demo se rechaza. *(Reemplazado en la Fase
  4: el camino de atestación del navegador se retira por completo — los
  usuarios demo reciben un mensaje explicativo, nunca una costura falsa.)*

**J2 — El perito sella y persiste (net-new).** Conectar wallet → reconocido
vía registro de roles → sellar → el bundle persiste bajo la identidad del
perito → aparece en el ledger público de casos sellados.

- **AC-J2.1** La conexión de wallet (Lace/1AM) emite una sesión de servidor
  (cookie httpOnly firmada).
- **AC-J2.2** `POST /api/seal` (escenario `seal`): sesión de perito →
  persiste y devuelve `persisted: true` + id; anónimo → comportamiento
  actual, `persisted: false`.
- **AC-J2.3** `GET /api/sealed`: público, filtros (veredicto, perito, fecha),
  paginación.
- **AC-J2.4** `GET /api/sealed/:id`: bundle completo almacenado (lectura
  pública).
- **AC-J2.5** UI del ledger de sellados con filtros; los usuarios anónimos
  ven el mensaje "solo demo".
- **AC-J2.6** Dirección de wallet desconocida (conectada pero fuera del
  registro) → la sesión existe, la persistencia se rechaza.

**J3 — El perito atesta localmente (el CLI existe; el vínculo es net-new).**
`deploy/attest-case.ts <caseId>` ya prueba y envía atestaciones reales. Lo
que falta: publicar el registro de atestación en la API web y vincularlo al
caso sellado persistido.

- **AC-J3.1** El CLI carga el bundle, construye los witnesses y envía vía
  proof server + wallet. *(Ya cumplido por `deploy/attest-case.ts`.)*
- **AC-J3.2** El CLI publica `{bundleHash, txHash, commitment}` en
  `POST /api/attestations`, autenticado con una API key del perito; la API
  resuelve el bundle por hash y verifica que el perito es su dueño (ADR-006).
- **AC-J3.3** Rechazos: bundle internamente inconsistente → rechazar;
  re-atestar el mismo commitment → rechazado por el replay guard del
  circuito.
- **AC-J3.4** El ledger y el detalle de caso muestran una insignia de
  atestación cuando queda registrada.

**J4 — El revisor verifica, sin cuenta (net-new).** Consulta por id de caso o
commitment → consistencia interna + custodia + estado on-chain.

- **AC-J4.1** Panel público de verificación en `/verify`; consulta por id de
  caso sellado o commitment.
- **AC-J4.2** Muestra consistencia interna, validez de custodia y estado
  on-chain (attested / pending / not found) con etiquetas explícitas
  **chain-verified** vs **expert-reported** (ADR-003); lista de coberturas;
  nunca evidencia.
- **AC-J4.3** Lectura de cadena no disponible → "chain status unavailable";
  la página sigue funcionando (un indexer inalcanzable no es lo mismo que
  cero atestaciones).

### No-objetivos (MVP)

Divulgación selectiva, credencial ZK anónima del perito, segunda opinión
ciega, mainnet, dominio propio, cuentas de revisor, proving en el navegador,
hostear el servidor MCP.

### Mapa de fases

| Fase | Entregable | Recorridos | Estado |
|---|---|---|---|
| 1 | Este PRD + ADRs + ROOT_TDD + consistencia de docs | — | ✅ Hecho (PR #14) |
| 2 | Frontend vivo en **Cloud Run** (corpus estático, lecturas de cadena funcionando; la config de Vercel fue reemplazada por Dockerfile + deploy gcloud) | J1 | ✅ Hecho (PR #15 + deploy Cloud Run) |
| 3 | Persistencia detrás de un adaptador de BD (Neon o Cloud SQL, elegido al desplegar) + identidad de wallet + ledger de sellados | J2 | 🔄 En progreso |
| 4 | Vínculo de atestaciones + panel `/verify` + retiro de la costura del navegador | J3, J4 | ⏳ Pendiente |

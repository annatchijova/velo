# Roadmap

## English

**Current MVP plan.** The deployed-app roadmap — specified in
[`PRD_MVP.md`](./PRD_MVP.md), decisions in
[`ADRS_001_006.md`](./ADRS_001_006.md) (ADR-001…007):

- ✅ **Phase 1** — PRD, ADRs, root-package TDD workflow, docs consistency
  (PR #14).
- ✅ **Phase 2** — deployed frontend. The Vercel path shipped as config
  (PR #15) but the Vercel builder failed reproducibly on its side; the app is
  **live on Google Cloud Run** instead (ADR-007):
  `https://velo-1028999311218.us-central1.run.app` — corpus served
  statically, real on-chain ledger reads, no wallet needed to browse.
- 🔄 **Phase 3** — persisted, queryable sealed cases behind a database
  adapter (`NeonAdapter`/`CloudSQLAdapter`, engine chosen at deploy time) and
  wallet-based expert identity.
- ⏳ **Phase 4** — attestation linkage (CLI → web record) and the public
  verification panel with chain-verified vs expert-reported labels; retirement
  of the browser attest seam.

Deferred hardening from red team rounds: F15 (MCP prompt injection), F21
(seed-redaction multi-word leak). F22 (request-body size cap) is folded into
Phase 3 route work.

This document keeps the initial-build history and the longer horizon below.

**Initial build scope (net-new code only).** The
deterministic engine and local sealing (layers 1-2), the Compact contract
enforcing the corroboration rule as a circuit constraint (layer 3), a local
frontend and MCP interface exercising seal / attest / verify end-to-end (layer
4), and tests covering thresholds, the corroboration gate, determinism, and
basic adversarial cases (layer 5). Selective disclosure, the anonymous expert
credential, and the blind second-opinion extension are scoped in only as time
allows, and are documented honestly as partial or unimplemented rather than
presented as finished. From this point forward, all frontend work follows the
mandatory TDD workflow documented in `docs/FRONTEND_TDD.md`.

**Beyond the initial build (net-new restriction no longer applies):**

- Replace the initial mini-engine with a production-grade forensic engine
  validated against a large case corpus, piloted against real referrals.
- Run an independent adversarial audit against VELO itself before any real use.
- Selective disclosure with threshold secret-sharing (K-of-N) instead of a
  single grant/deny, and a real accreditation credential with fail-closed
  revocation.
- A multi-expert attestation network, and outside investment conversations once
  the product has real users.
- A judge/reviewer verification panel, an independently published offline
  verifier, and a demonstrated bit-for-bit determinism proof, ahead of any
  mainnet deployment.

## Español

**Plan MVP actual.** La hoja de ruta de la app desplegada — especificada en
[`PRD_MVP.md`](./PRD_MVP.md), decisiones en
[`ADRS_001_006.md`](./ADRS_001_006.md) (ADR-001…007):

- ✅ **Fase 1** — PRD, ADRs, flujo TDD del paquete raíz, consistencia de docs
  (PR #14).
- ✅ **Fase 2** — frontend desplegado. El camino Vercel se commiteó como
  configuración (PR #15) pero el builder de Vercel falló de forma reproducible
  de su lado; la app está **viva en Google Cloud Run** en su lugar (ADR-007):
  `https://velo-1028999311218.us-central1.run.app` — corpus servido
  estáticamente, lecturas reales del ledger on-chain, sin wallet para navegar.
- 🔄 **Fase 3** — casos sellados persistidos y consultables detrás de un
  adaptador de base de datos (`NeonAdapter`/`CloudSQLAdapter`, motor elegido al
  desplegar) e identidad de perito por wallet.
- ⏳ **Fase 4** — vínculo de atestaciones (CLI → registro web) y el panel
  público de verificación con etiquetas chain-verified vs expert-reported;
  retiro de la costura de atestación del navegador.

Endurecimiento diferido de las rondas de red team: F15 (prompt injection en
MCP), F21 (filtración multi-palabra en la redacción de seeds). F22 (límite de
tamaño de cuerpo de request) se incorpora al trabajo de rutas de la Fase 3.

Este documento conserva la historia de la construcción inicial y el horizonte
más largo de abajo.

**Alcance de la construcción inicial (solo código net-new).** El
motor determinista y el sellado local (capas 1-2), el contrato Compact que
aplica la regla de corroboración como restricción del circuito (capa 3), un
frontend local e interfaz MCP que ejercitan sellar / atestar / verificar de
punta a punta (capa 4), y tests que cubren umbrales, el gate de corroboración,
determinismo y casos adversariales básicos (capa 5). La divulgación selectiva,
la credencial anónima del perito y la extensión de segunda opinión ciega entran
solo si el tiempo alcanza, y se documentan honestamente como parciales o no
implementadas en vez de presentarse como terminadas. De aquí en adelante, todo
trabajo de frontend sigue el flujo de TDD obligatorio documentado en
`docs/FRONTEND_TDD.md`.

**Más allá de la construcción inicial (ya no rige la restricción net-new):**

- Reemplazar el mini-motor inicial por un motor forense de nivel productivo,
  validado contra un corpus de casos grande, con piloto sobre oficios reales.
- Correr una auditoría adversarial independiente sobre VELO mismo antes de
  cualquier uso real.
- Divulgación selectiva con reparto de secreto por umbral (K-de-N) en vez de un
  simple aprobar/rechazar, y una credencial de acreditación real con revocación
  fail-closed.
- Una red de atestación multi-perito, y conversaciones de inversión externa una
  vez que el producto tenga usuarios reales.
- Un panel de verificación para jueces/revisores, un verificador offline
  publicado de forma independiente, y una prueba demostrada de determinismo bit
  a bit, antes de cualquier despliegue en mainnet.

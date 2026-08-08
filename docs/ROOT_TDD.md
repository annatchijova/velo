# Root-package TDD workflow

Extends mandatory Test-Driven Development to the **root `velo` package** —
the engine, sealing, witnesses, chain read, MCP server, and deploy/CLI
tooling. Frontend work follows [`FRONTEND_TDD.md`](./FRONTEND_TDD.md); this
document covers everything outside `frontend/`.

---

## English

### Scope

Applies to: `src/engine/`, `src/seal/`, `src/witness/`, `src/chain/`,
`src/core/`, `src/mcp/`, `deploy/*.ts`, and `scripts/*.mjs`.

Does **not** apply to `frontend/` (see FRONTEND_TDD.md). Does not authorize
changes to historical records (`CHANGELOG.md`, `docs/RED_TEAM_ROUND_*.md`).

### Framework and location

- Runner: Node's built-in test runner, `node --test`.
- Tests live in `tests/` at the repo root (compiled to `dist/tests/` by
  `npm run build`, then executed by `npm test`).
- Test files: `tests/<area>.test.ts`. The existing suite (53 tests) covers
  thresholds, the Daubert corroboration gate, determinism, custody-chain
  adversarial cases, canonicalization, and witnesses.

### The loop (same discipline as the frontend)

1. **Write a failing test first.** Before adding or changing behavior in a
   root module, add a test in `tests/` that expresses the acceptance
   criterion and fails. Run `npm run build && npm test` and confirm the new
   test fails for the right reason.
2. **Write the minimal implementation** to make it pass. No speculative
   generality.
3. **Refactor while green.** Behavior is pinned by the test; clean up without
   changing outcomes.
4. **Full suite green before commit.** `npm run build && npm test` — every
   root test, not just the one you touched.

### Rules

- **AC mapping.** When a change implements a PRD acceptance criterion,
  reference it in the test name: e.g. `"AC-J3.3 CLI refuses an internally
  inconsistent bundle"`. This is how reviewers trace a criterion to its
  evidence.
- **Determinism is load-bearing.** The decision path uses exact rationals and
  canonical hashing; any test that could pass by accident (floating-point
  tolerance, unsorted keys, wall-clock time) is a bug in the test. Determinism
  tests must run the same input twice and compare exact outputs.
- **Adversarial tests are first-class.** Tamper a field, truncate the custody
  chain, submit a mismatched commitment, replay an attestation — the refusal
  is the feature. Keep at least one adversarial test per invariant you touch.
- **No real network in unit tests.** Chain reads, proof servers, wallets and
  indexers are mocked at the seam (dependency injection / module boundary).
  Real-network behavior is exercised by the documented runbook scripts
  (`scripts/verify-chain-read.mjs`, `deploy/attest-case.ts`), never by the
  unit suite.
- **Do not skip or mute.** No `.skip`, no `.only` left behind, no caught-and-
  ignored assertion failures. A red test blocks the commit.

### What counts as "root work" requiring this workflow

Any change that alters engine scoring, sealing/canonicalization, custody
hashing, witness construction, chain-read parsing, MCP tool behavior, or the
attest/deploy CLI. Pure documentation and comment-only changes do not, but a
behavior change hiding in a "docs" commit does.

---

## Español

### Alcance

Aplica a: `src/engine/`, `src/seal/`, `src/witness/`, `src/chain/`,
`src/core/`, `src/mcp/`, `deploy/*.ts` y `scripts/*.mjs`.

**No** aplica a `frontend/` (ver FRONTEND_TDD.md). No autoriza cambios a
registros históricos (`CHANGELOG.md`, `docs/RED_TEAM_ROUND_*.md`).

### Framework y ubicación

- Runner: el test runner nativo de Node, `node --test`.
- Los tests viven en `tests/` en la raíz del repo (compilados a `dist/tests/`
  por `npm run build`, ejecutados por `npm test`).
- Archivos: `tests/<area>.test.ts`. La suite existente (53 tests) cubre
  umbrales, el gate de corroboración Daubert, determinismo, casos
  adversariales de la cadena de custodia, canonicalización y witnesses.

### El ciclo (misma disciplina que el frontend)

1. **Escribí primero un test que falle.** Antes de agregar o cambiar
   comportamiento en un módulo raíz, agregá un test en `tests/` que exprese el
   criterio de aceptación y falle. Corré `npm run build && npm test` y
   confirmá que el test nuevo falla por la razón correcta.
2. **Escribí la implementación mínima** para que pase. Nada de generalidad
   especulativa.
3. **Refactorizá en verde.** El comportamiento está fijado por el test;
   limpiá sin cambiar resultados.
4. **Suite completa en verde antes de commitear.** `npm run build && npm test`
   — todos los tests raíz, no solo el que tocaste.

### Reglas

- **Mapeo a ACs.** Cuando un cambio implementa un criterio de aceptación del
  PRD, referencialo en el nombre del test: p. ej. `"AC-J3.3 CLI refuses an
  internally inconsistent bundle"`. Así los revisores trazan un criterio hasta
  su evidencia.
- **El determinismo es estructural.** El camino de decisión usa racionales
  exactos y hashing canónico; cualquier test que pueda pasar por accidente
  (tolerancia de punto flotante, claves sin ordenar, hora de pared) es un bug
  del test. Los tests de determinismo deben correr la misma entrada dos veces
  y comparar salidas exactas.
- **Los tests adversariales son de primera clase.** Alterá un campo, truncá la
  cadena de custodia, mandá un commitment que no coincide, re-atestá una
  atestación — el rechazo ES la funcionalidad. Mantené al menos un test
  adversarial por cada invariante que toques.
- **Nada de red real en tests unitarios.** Lecturas de cadena, proof servers,
  wallets e indexers se mockean en la costura (inyección de dependencias /
  límite de módulo). El comportamiento con red real se ejercita con los
  scripts del runbook (`scripts/verify-chain-read.mjs`,
  `deploy/attest-case.ts`), nunca con la suite unitaria.
- **No saltear ni silenciar.** Nada de `.skip`, ningún `.only` olvidado,
  ninguna falla de aserción capturada e ignorada. Un test en rojo bloquea el
  commit.

### Qué cuenta como "trabajo raíz" que requiere este flujo

Cualquier cambio que altere el scoring del motor, sellado/canonicalización,
hashing de custodia, construcción de witnesses, parsing de lecturas de cadena,
comportamiento de herramientas MCP, o el CLI de attest/deploy. Los cambios de
pura documentación o solo comentarios no, pero un cambio de comportamiento
escondido en un commit "de docs" sí.

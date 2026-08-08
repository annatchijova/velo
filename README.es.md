# VELO

> **El veredicto se ve, la víctima no.**

Atestación de veredictos forenses con conocimiento cero sobre [Midnight](https://midnight.network).
Un perito puede probar que su veredicto es legítimo **sin publicar nunca la
evidencia de la que salió**.

`Apache-2.0` · `TypeScript + Compact` · Midnight Hack Buenos Aires, 7–8 de agosto de 2026

📄 **[English README](./README.md)** — versión completa, con diagramas, la API y las
instrucciones de deploy.

**Demo en vivo: [velo-1028999311218.us-central1.run.app](https://velo-1028999311218.us-central1.run.app)** — leyendo el contrato real desplegado en Midnight preview. Sin wallet, claves ni instalación para navegarla.

![VELO — del registro de casos a un veredicto MALICIA que se gana, y una ABSTENCIÓN cuando la cadena de custodia está rota](./visual/velo-demo-ES.gif)

## Explorar

Cada página es bilingüe (EN/ES).

- **[App en vivo](https://velo-1028999311218.us-central1.run.app)** — el frontend corriendo en Google Cloud Run, leyendo el ledger real on-chain.
- **[Pitch deck](https://annatchijova.github.io/vigia/velo-pitch-deck.html)** — el deck de slides bilingüe.
- **[Diagrama de arquitectura](https://annatchijova.github.io/vigia/veloarchitecture-diagram.html)** — la vista de una imagen: "un lado prueba, el otro queda sellado".
- **[Arquitectura](https://annatchijova.github.io/vigia/velo-architecture.html)** — el documento completo, desde [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
- **[Estado técnico](https://annatchijova.github.io/vigia/velotechnical-status.html)** — qué es real y qué está pendiente, capa por capa.
- **[Modelo de identidad](https://annatchijova.github.io/vigia/velo-identity.html)** — autorización de perito acreditado, no identificación biométrica.
- **[Caso de negocio](https://annatchijova.github.io/vigia/velo-business.html)** — la capa de reputación forense y sus casos de uso.
- **[Roadmap](https://annatchijova.github.io/vigia/velo-roadmap.html)** — las capas entregadas y lo que viene.

## Levantarlo localmente

No hacen falta secretos para ver la demo — la wallet y las claves solo importan para *atestar* (el write path), nunca para correr la UI ni leer la cadena.

```bash
git clone https://github.com/annatchijova/velo.git
cd velo

npm install        # workspaces de npm: instala el motor root + el frontend
npm run build      # compila dist/, que el frontend importa como `velo/*`

cd frontend
npm run dev        # http://localhost:3000
```

Requiere Node 20+. La primera carga compila on-demand, así que tarda unos
segundos — es Next.js buildeando, no está colgado.

---

## El problema

Hoy un perito forense tiene dos opciones, y las dos son malas:

1. **Publicar la evidencia cruda** para que otros puedan verificar el veredicto.
   La víctima queda expuesta ante todos los que no necesitaban verla.
2. **No publicar nada**, y pedirle al tribunal que confíe en su palabra.

Todo flujo de trabajo forense en producción elige una de las dos. VELO no elige
ninguna.

## Cómo

El perito corre un motor determinista en su propia máquina, sella el resultado, y
publica **solo un commitment y una prueba de conocimiento cero**. La prueba
establece dos cosas a la vez: que el veredicto publicado corresponde al análisis
sellado, y que se cumplió un criterio de admisibilidad formalizado, inspirado en el
estándar *Daubert* — *al menos dos fuentes, declaradas independientes por el
analista y distintas por raíz de cadena de proveniencia, para un veredicto*
`MALICE`.

Esa regla no es una nota de política ni una convención de code review. Es una
**restricción dentro del circuito**: una atestación que la viole no puede
producirse.

La evidencia cruda nunca cruza el límite. Lo que cruza es un commitment, el
veredicto declarado, un timestamp y una prueba sobre ellos.

## Lo que lo hace real: el sistema se niega

Cualquiera puede construir algo que diga que sí. Lo interesante es **cómo se
niega**. `npm run simulate` demuestra las dos negativas en vivo:

**Negativa 1 — no hay fuentes independientes suficientes.** Evidencia que
alcanzaría para `MALICE`, pero toda rastreable a una sola adquisición:

```
[VEREDICTO INTENTADO] SUSPICION
[POR QUÉ] Score 0.3000 por encima del piso de ruido pero por debajo del umbral de MALICE.
```

**Negativa 2 — sin cadena de custodia.** Los *mismos* artefactos byte por byte,
quitando solo el registro de cómo se adquirieron:

```
[VEREDICTO CON CUSTODIA]     MALICE
[VEREDICTO SIN CUSTODIA]     ABSTAIN
```

Evidencia idéntica, resultado opuesto. La admisibilidad es una propiedad del
**proceso**, no de qué tan incriminatoria se ve la evidencia. Un hallazgo que nadie
puede rastrear hasta una adquisición legal no es un hallazgo más débil: es uno
inadmisible.

## Probalo

```bash
npm install
npm test          # 53 tests, incluidos los adversariales
npm run simulate  # historia completa, las dos negativas
```

El ciclo completo contra Midnight `preview` está en
**[`docs/CHAIN.md`](./docs/CHAIN.md)**: sellar local → atestar on-chain → leer
desde el ledger.

### Despliegue en Vercel

El frontend Next.js se despliega en Vercel como proyecto monorepo: **Root
Directory `frontend/`**, framework Next.js, Node 20+. Dos configuraciones en
`frontend/vercel.json` son estructurales:

- `installCommand: "cd .. && npm ci"` — instala desde el lockfile de la raíz
  del workspace, para que el paquete `velo` (el motor) resuelva.
- `buildCommand: "npm run build:deploy"` — compila el paquete raíz (`tsc`)
  antes de `next build`, porque el frontend importa `velo/*` → `dist/src/*`.

Las rutas del corpus (`/api/cases`, `/api/cases/:id`, `/api/peritos`) son
**estáticas en el build** (`force-static` + `generateStaticParams`), así el
runtime serverless nunca lee el filesystem del repo para servirlas. Las
lecturas de cadena (`GET /api/chain`) corren serverless con los bindings del
contrato commiteados (`contracts/managed/`) — sin wallet, sin claves, sin
costo. Las **escrituras** de atestación nunca corren en Vercel; quedan en la
máquina del perito (`deploy/attest-case.ts`, ver [CHAIN](./docs/CHAIN.md)).

## Estado — qué es real y qué no

| Capa | Estado |
|---|---|
| Motor determinista + gate de Daubert | **Funciona**, 53 tests |
| Sellado local, cadena de custodia, hashing canónico | **Funciona** |
| Verificador offline sin dependencias | **Funciona** |
| Servidor MCP | **Funciona**, probado sobre JSON-RPC real |
| Contrato Compact | **Compila** — `compactc 0.31.1`, ambos circuitos, claves reales |
| Contrato desplegado | **Vivo en `preview`** — [`46cac58c…3d9d`](./docs/CHAIN.md) |
| Atestación on-chain | **Funciona** vía CLI (`deploy/attest-case.ts`). Una atestación real registrada |
| Lectura del ledger | **Funciona** — `GET /api/chain`, MCP `chain_status` |
| Firma desde el navegador | **No construida** — ver Limitaciones |
| Red team | **6 rondas** — reportes completos RT1–RT6 abajo |

---

## Limitaciones conocidas

Esta sección existe porque un sistema construido para no sobreafirmar tiene que
empezar por no sobreafirmar sobre sí mismo. Nada de lo que sigue es un bug abierto:
son **fronteras de lo que una prueba de conocimiento cero puede establecer**, y
están documentadas en detalle en las rondas de red team.

### Lo que el circuito no puede ver

**El binding de los witnesses a una corrida real del motor** *(G1, G3 — Ronda 2)*
El circuito prueba perfectamente las relaciones **entre** los witnesses que recibe:
que el veredicto está atado al fingerprint, que el conteo cumple el gate. Lo que no
puede ver es si esos witnesses describen **una corrida real del motor sobre
evidencia real**. Ese binding vive solo en el llamador (`src/witness/witnesses.ts`),
que es exactamente la parte que una prueba ZK no cubre.

En concreto: `corroborationCount` es un número que el prover provee. El circuito
verifica que sea `>= 2`, no que las dos fuentes sean *realmente* independientes —
eso se computa off-chain contando raíces de proveniencia distintas, y es **declarado
por el analista**, no probado criptográficamente.

Cerrarlo requiere un mecanismo de proveniencia de witnesses: firma del binario del
motor, credencial de perito acreditado, o attestation del entorno de ejecución. Es
diseño criptográfico real, no plomería.

**Esto no es una debilidad específica de VELO** — es lo que "prueba de conocimiento
cero" significa para *cualquier* sistema que atesta hechos del mundo real en vez de
computación pura. La respuesta correcta es la que se tomó acá: arreglar lo que se
arregla, y nombrar con precisión lo que no, para que nadie pueda decir que se
escondió.

### Lo que se filtra aunque la evidencia no

**Enlazabilidad por wallet** *(G5)*
Cada atestación es una transacción desde una wallet. Si un perito atesta siempre
desde la misma dirección, todos sus commitments son enlazables entre sí — sin
revelar ningún contenido de caso, pero sí su cantidad de casos, distribución de
veredictos y cadencia. Lo mitiga la credencial ZK anónima, que no está construida.

**Metadata del propio ledger** *(G4)*
El commitment, el veredicto y un timestamp **sí** salen, por diseño. Alguien
mirando la cadena aprende que existió una investigación, aproximadamente cuándo, y
su categoría de resultado — sin ver el caso.

### Lo que depende de que exista algo más

**Sin versionado de reglas** *(G7)* — El umbral de corroboración (`>= 2`) está
fijo en el circuito. Si cambiara, las atestaciones viejas no llevan marca de contra
qué regla se verificaron. Solo importa cuando exista una segunda versión del
contrato.

**Sin modelo de revocación** *(G8)* — Qué pasa si un perito pierde su matrícula.
No tiene sentido diseñarlo antes que la credencial que revocaría.

### Lo que el servidor no valida

**Parámetros que provienen de un agente** *(F15 — Ronda 3)*
Cuando un agente LLM construye la llamada a `seal_case`, el texto libre de la
evidencia entra en su contexto. Un intento de inyección de prompt fue **probado y
falló** — el agente lo reconoció y lo rechazó — pero esa defensa vino del juicio del
modelo, **no del servidor**. VELO no verifica que el `devilAdvocate` esté anclado a
la evidencia real. Un framing distinto, u otro modelo, podría dar otro resultado.

### Lo que no está construido

**Firma desde el navegador** — Hoy se atesta por CLI, firmando con una wallet
derivada de seed en la máquina del perito. Arquitectónicamente es el equivalente CLI
de la wallet del perito, pero **no** es la UI conectada a 1AM: `POST /api/attest`
sigue calculando un commitment local.

**Divulgación selectiva, credencial ZK del perito, segunda opinión ciega** — Están
diseñadas ([`docs/IDENTITY.md`](./docs/IDENTITY.md),
[`docs/ROADMAP.md`](./docs/ROADMAP.md)) y no implementadas.

### Y lo que explícitamente no resuelve

VELO **no impide que un perito mienta desde el principio**. Elimina la manipulación
posterior al sellado y las afirmaciones de experiencia no verificables. No elimina a
un perito corrupto — eso sigue siendo responsabilidad humana y judicial, igual que
con cualquier peritaje hoy.

---

## Documentación

Toda bilingüe (EN/ES): [`ARCHITECTURE`](./docs/ARCHITECTURE.md) ·
[`GLOSSARY`](./docs/GLOSSARY.md) · [`CASES`](./docs/CASES.md) ·
[`FAQ`](./docs/FAQ.md) · [`BUSINESS`](./docs/BUSINESS.md) ·
[`IDENTITY`](./docs/IDENTITY.md) · [`ROADMAP`](./docs/ROADMAP.md) ·
[`CHAIN`](./docs/CHAIN.md) · [`LEARNINGS`](./docs/LEARNINGS.md) ·
[`STRUCTURE`](./docs/STRUCTURE.md) ·
[`RED TEAM 1`](./docs/RED_TEAM_ROUND_1.md) ·
[`RED TEAM 2`](./docs/RED_TEAM_ROUND_2.md) ·
[`RED TEAM 3`](./docs/RED_TEAM_ROUND_3.md) ·
[`RED TEAM 4`](./docs/RED_TEAM_ROUND_4.md) ·
[`RED TEAM 5`](./docs/RED_TEAM_ROUND_5.md) ·
[`RED TEAM 6`](./docs/RED_TEAM_ROUND_6.md) ·
[`FRONTEND TDD`](./docs/FRONTEND_TDD.md) · [`ROOT TDD`](./docs/ROOT_TDD.md) ·
[`PRD MVP`](./docs/PRD_MVP.md) · [`ADRs MVP`](./docs/ADRS_001_006.md)

[`LEARNINGS.md`](./docs/LEARNINGS.md) registra lo que este equipo entendió mal
primero y bien después — se mantiene porque un proyecto construido sobre "no
confíes en la descripción, leé la cosa" debería mostrar dónde tuvo que aprenderlo
por las malas.

---

## Autores

- [annatchijova](https://github.com/annatchijova)
- [olgavasilievaveg-hash](https://github.com/olgavasilievaveg-hash/)
- [Dahgoth](https://github.com/Dahgoth)

## Licencia

Apache License 2.0 — ver [`LICENSE`](./LICENSE).

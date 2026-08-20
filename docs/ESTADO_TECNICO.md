# VELO — Estado técnico

**Atestación forense de conocimiento cero sobre Midnight**
v0.1.0 · estado al 2026-08-07

> El veredicto se ve, la víctima no.

---

## 0. Cómo leer este documento

Cada afirmación de acá abajo es una de tres cosas: **verificada** (lo corrimos y
leímos la salida), un **hecho de código** (leído en el fuente exacto que se
entrega, no de memoria ni del documento que lo describe), o está **marcada
explícitamente como todavía no establecida**. Esa distinción no es decorativa:
es la misma escalera epistémica que usan las seis rondas de red team del
proyecto, y aplicarla a nuestro propio informe de estado es la única versión de
este documento que sobreviviría a que la chequeen.

Donde un número viene de un artefacto específico del repositorio, el artefacto
está nombrado. Donde no pudimos verificar algo, este documento lo dice en vez de
redondearlo para arriba.

**Lo único que hay que llevarse de esta página:** VELO no es un demo que dibuja
un veredicto. Es un sistema con *propiedades demostrables* — determinismo,
evidencia de manipulación, y una regla de admisibilidad legal impuesta como
restricción criptográfica en vez de como promesa — y un contrato desplegado en
la red `preview` real de Midnight. Las propiedades son el producto. La UI es
cómo se las mira.

---

## 1. Qué existe y está corriendo

| | Estado |
|---|---|
| Contrato ZK en Compact, compilado | **Sí** — `compact` 0.5.1 / `compactc` 0.31.1, exit 0, claves reales de prover y verifier para ambos circuitos |
| Contrato desplegado en una red viva | **Sí** — Midnight `preview`, dirección `46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d` |
| Motor forense determinista | **Sí** — 5 detectores, aritmética racional exacta, ningún float en el camino de decisión |
| Sellado local + custodia hash-encadenada | **Sí** — serialización canónica v2, bundle de dos hashes, vocabulario de eventos derivado de ISO/IEC 27037 |
| Verificador offline sin dependencias | **Sí** — solo `node:crypto` y `node:fs`, corre sin npm, re-chequea el gate de admisibilidad por su cuenta |
| Servidor MCP (superficie con forma de wallet) | **Sí** — `list_my_cases`, `get_case`, `seal_case`, `verify_commitment`, `attest_case` |
| Frontend local-first (Next.js 15 / React 19) | **Sí** — landing, conexión de wallet (Lace y 1AM vía DApp Connector v4), ledger de casos, corrida en vivo del motor, sellar → atestar → verificar, demo adversarial de manipulación |
| Corpus sintético sin PII | **Sí** — 14 casos cubriendo los cuatro veredictos, 6 perfiles de perito |
| Se distingue ausencia de evidencia de evidencia de ausencia | **Sí** — los huecos de cobertura declarados degradan un hallazgo *negativo* a `ABSTAIN` y quedan sellados en el fingerprint. Ver §3.10 |
| Auditoría adversarial de nuestro propio sistema | **Sí** — 6 rondas de red team, 35 hallazgos, 11 vectores de ataque ejecutados y bloqueados |
| Prueba end-to-end contra el contrato desplegado | **Sí** — un caso sellado fue probado y atestado en `preview`; el commitment `632dbf0159cb6df7360507b1c01cc2a62d26035cb20e56b57e7bae0ce8fb3b2b` registra `MALICE`, legible por cualquiera. Vía CLI (`deploy/attest-case.ts`); el camino firmado desde el navegador **no** está construido. Ver §5 |
| Lectura del ledger | **Sí** — `GET /api/chain`, MCP `chain_status` / `lookup_commitment`, y `scripts/verify-chain-read.mjs`. Leer no requiere wallet, claves ni fees |

---

## 2. Vía A — profundidad de plataforma: qué ata realmente el circuito

### 2.1 El commitment ata seis elementos, no tres

La forma más común de que un sistema de atestación ZK esté hueco es que el
commitment cubra el *entorno* de la afirmación pero no la afirmación misma. El
circuito que se entrega computa:

```
commitment = persistentHash<Vector<6, Bytes<32>>>([
    pad(32, "velo:attestation:v1"),   // separador de dominio
    bundle_fingerprint,               // el análisis
    custody_tip,                      // la cadena de custodia
    verdict        as Field as Bytes<32>,
    corroborationCount as Field as Bytes<32>,
    salt                              // 32 bytes de CSPRNG, por caso
])
```

Una versión anterior de este contrato hasheaba solo `[fingerprint, tip, salt]`,
dejando el `verdict` como argumento público libre y `corroborationCount` como
witness no ligado. Esa versión era **vacua exactamente donde importa**: un
análisis legítimamente sellado como `NOISE` podía atestarse on-chain como
`MALICE`. Lo encontramos nosotros, en la ronda 1 de red team (hallazgo **F3**,
addendum posterior a la compilación), y ensanchamos el hash. Hoy el veredicto
está adentro de lo que dice probar.

### 2.2 La regla de admisibilidad es una restricción del circuito, no una nota de política

El gate de corroboración de VELO — inspirado en el estándar *Daubert* para
testimonio pericial — no es un chequeo que la aplicación hace y después reporta.
Es un `assert` adentro del circuito de prueba:

> Un veredicto `MALICE` no puede atestarse sin `corroboration_count >= 2`.

Intentar atestar `MALICE` con una sola fuente no produce una transacción
rechazada. **Directamente no produce ninguna prueba.** No hay camino de código,
ni override de admin, ni flag que te dé una atestación `MALICE` válida con una
sola fuente, porque la restricción es parte de lo que "prueba válida" significa
acá.

Esa es la diferencia entre una regla y una garantía, y es la razón por la que el
gate vive en el circuito y no en `scorer.ts`.

**VERIFICADO POR INDUCCIÓN, no afirmado (2026-08-08).** Es la frase que más
peso carga en el proyecto, así que era la única afirmación que no debía
descansar en leer el código. `deploy/attest-forced-malice.ts` la ataca
directamente contra el contrato desplegado en `preview`, salteando todos los
controles de la aplicación: el motor no puede producir ese estado (`scorer.ts`
degrada `MALICE` a `SUSPICION` con menos de dos fuentes) y `attest-case.ts` lo
rechaza localmente, así que la sonda fuerza `corroborationCountWitness` a
devolver `1` mientras pasa `MALICE` como argumento público. Solo se falsifica
el conteo — un bundle que además mintiera sobre su fingerprint fallaría por
otra razón y no probaría nada sobre corroboración. No queda nada entre la
llamada y el circuito.

La predicción se enunció antes de correr, y la transacción fue rechazada por
el assert del propio circuito:

```
failed assert: MALICE requires at least 2 independent corroborating sources — the Daubert gate
```

La sonda reporta cualquiera de los dos resultados y sale con código distinto de
cero si la cadena *acepta* la atestación forzada, diciendo que esta sección es
falsa tal como está escrita — un experimento que solo puede confirmar no es un
experimento. También distingue "rechazado por el gate" de "rechazado por otra
razón", así una falla de dust o de red no puede leerse como un resultado
verde.

### 2.3 Protección contra replay

La ronda 2 (hallazgo **G2**) encontró que re-atestar una tupla idéntica
`(fingerprint, tip, verdict, count, salt)` volvía a insertar en `caseVerdicts` e
inflaba `attestationCount` — una forma de fabricar la apariencia de
corroboración independiente pagando la fee dos veces. El comentario del propio
contrato decía en ese momento "KNOWN, NOT FIXED". Ya está arreglado, en una
línea que es todo el punto del hallazgo:

```compact
assert(!caseVerdicts.member(disclose(commitment)), "this attestation already exists");
```

### 2.4 El límite de dual-ledger lo impone el compilador

| | Público (on-chain, para siempre) | Privado (witness, nunca sale de la máquina) |
|---|---|---|
| Contiene | `commitment`, veredicto declarado, `attestation_count`, `case_commitment` | `bundle_fingerprint`, `custody_tip`, detalle del veredicto, `corroboration_count`, `secret_salt` |
| Quién lo lee | Cualquiera | Nadie salvo el perito |

Nada cruza esa línea salvo que el autor del contrato lo marque con
`disclose()`. No es una convención que seguimos: es un error de compilación si
no lo hacemos.

Los cuatro witnesses privados son `bundleFingerprint(): Bytes<32>`,
`custodyTip(): Bytes<32>`, `bundleSalt(): Bytes<32>` y
`corroborationCountWitness(): Uint<0..17>`. El salt son 32 bytes de un CSPRNG,
generados una vez por caso y nunca reutilizados entre casos — reutilizarlo haría
que dos casos distintos produzcan commitments públicos byte a byte idénticos.

### 2.5 Lo que elegimos *no* hacer, y por qué las razones están cerradas

**No computamos el commitment en TypeScript.** `persistentHash` no es SHA-256, y
ni la codificación de dominio `pad(32, ...)` ni el cast `Field → Bytes<32>` están
exportados o documentados. Reimplementarlos a ojo nos daría un número que parece
correcto y está mal. Por eso el `src/lib/contract.ts` del frontend lleva un
*placeholder rotulado* que dice sin vueltas que va a producir bytes distintos a
los del circuito compilado — una costura honesta, no una interacción de cadena
simulada.

**No guardamos evidencia en IPFS ni Arweave.** Dos razones cerradas: (a) el
cifrado de hoy no es privacidad para siempre, y publicar la evidencia cifrada de
una víctima en una red pública permanente es apostar a que la criptografía
actual aguante indefinidamente; (b) si un juez ordena destruir evidencia, un
archivo en una red p2p permanente no se puede borrar. Solo viajan el commitment
y la prueba.

**No usamos reconocimiento facial ni biometría.** La biometría responde "¿hay una
persona real acá?", que sola es casi inútil jurídicamente. La pregunta que un
juez realmente hace es "¿esta persona está *autorizada* a emitir este análisis?"
— eso es un chequeo de credencial. Agregar una cara además metería un secreto
permanente y no revocable en un sistema cuya premisa entera es minimizar
exactamente eso. El argumento completo está en `IDENTITY.md`.

### 2.6 Chocamos con tres paredes reales de la plataforma y documentamos las tres

Están en `LEARNINGS.md` porque "entendimos la plataforma al primer intento" no es
algo que este proyecto pueda afirmar con honestidad.

- **L1 — `Insufficient Funds: could not balance dust` con la wallet fondeada.**
  En Midnight las fees se pagan en DUST; el DUST no es un token que manda el
  faucet, lo *genera* el NIGHT que fue explícitamente registrado para generación
  de dust. La dependencia de deploy tiene la función, su propio comentario dice
  que es obligatoria, y `deployMidnightContract` nunca la llama: su armado de
  wallet espera solo el balance shielded y descarta el balance de dust que
  calcula. Lo encontramos bajando el tarball publicado real de
  `@effectstream/midnight-contracts@0.103.2` desde npm y siguiendo el camino de
  llamadas, no adivinando mejor el mensaje. Fix: un `deploy/register-dust.ts`
  aparte. Confirmado en vivo — el dust pasó de `0` a `1127246784999999999`
  después de una sola transacción de registro.
- **L3 — `1010: Invalid Transaction: Custom error: 170`.** La respuesta publicada
  para ese error es un bump de versión del ledger. Era cierto para quien lo
  escribió y falso para nosotros. El error 170 es `InvalidDustSpendProof`: el
  nodo rechazó la **prueba de la fee en DUST**, no la prueba del deploy del
  contrato. Cada componente ya coincidía con la matriz de compatibilidad de
  Preview (compilador 0.31.1, runtime 0.16.0, midnight-js 4.1.1, compact-js
  2.5.1, proof server 8.1.0; los digests de Docker de `:latest` y `:8.1.0` son
  byte a byte idénticos, `sha256:801bbc03…`). La causa real era **falta de
  frescura**: en la corrida que falló, el sync de dust fue
  `true → false → false → true` en sus últimos 30 segundos, así que la prueba de
  gasto referenciaba un merkle root que estaba siendo superado. **No cambiamos
  nada entre la corrida fallida y la exitosa tres minutos después.** Consejo
  extraído: registrar dust y desplegar enseguida.
- **Un casi-error que vale la pena registrar.** El instinto era hacer
  `docker rm -f` del proof server y volver a bajarlo. Dos chequeos de un minuto
  lo frenaron: la comparación de digests que mostraba que `:latest` *era* `8.1.0`,
  y darse cuenta de que el alarmante `created=1970-01-01T00:00:01Z` del contenedor
  es un sello de época de build reproducible (estándar en imágenes construidas con
  Nix), no evidencia de una descarga vieja. Borrar un contenedor sano habría
  costado mucho más y no habría arreglado nada.

---

## 3. Vía B — rigor de ingeniería: las propiedades, y cómo se sostienen

### 3.1 El determinismo se impone, no se espera

Un umbral de veredicto comparado con punto flotante es un veredicto que puede
dar distinto en máquinas distintas. Así que no hay floats en ninguna parte del
camino de decisión.

`Fraction` es aritmética racional exacta sobre `bigint`: numerador y denominador
siempre en mínima expresión, el signo normalizado sobre el numerador, y
`gcd(0,0)` protegido para que nunca dé cero. La suma multiplica cruzado; **la
comparación multiplica cruzado y nunca divide**, así que no hay ningún paso de
redondeo entre la evidencia y el veredicto. `toDisplayString()` existe y lleva el
comentario *"Only for display — never for a decision."*

Las constantes, textuales de `scorer.ts`:

```ts
const MALICE_THRESHOLD = new Fraction(33, 100);
const NOISE_CEILING    = new Fraction(8, 100);
const MIN_CORROBORATION_FOR_MALICE = 2;
```

Los pesos de los detectores son `1/4, 1/4, 3/10, 1/5, 1/5` — score máximo
posible `6/5`. De esa aritmética salen dos consecuencias estructurales, y
ninguna de las dos la impone un `if`:

- El peso individual más grande es `3/10 = 0.30`, que está **por debajo** del
  umbral de malicia `33/100`. Entonces `MALICE` requiere estructuralmente que
  disparen al menos dos *categorías de detector distintas*, además de las dos
  fuentes independientes que exige el gate.
- La comparación del umbral es `greaterThan` — estrictamente mayor. Exactamente
  `33/100` no alcanza.

### 3.2 Fail-closed por default, en cinco lugares independientes

- **Sin custodia no hay veredicto.** `score()` corta a `ABSTAIN` *antes de
  consultar cualquier salida de detector* si la cadena de custodia falla.
  `custodyValid` es **derivado, nunca afirmado por el llamador**
  (`custodyCheck.valid && events.length > 0`): cero eventos de custodia significa
  `ABSTAIN` sin importar lo que muestre la evidencia. `ABSTAIN` deliberadamente
  no es un veredicto, es el motor negándose a fallar.
- **La malicia sin escrutinio se degrada.** Score sobre el umbral, corroboración
  satisfecha, pero el campo de abogado del diablo vacío → el veredicto baja a
  `SUSPICION`. No publicamos un hallazgo de malicia que nadie discutió.
- **Los secretos faltantes tiran error.** `MIDNIGHT_STORAGE_PASSWORD` no tiene
  default. Lo tenía (`"velo-local-dev-password-16"`, en un repo público,
  protegiendo un store local de claves de firma) hasta el hallazgo **F17** de la
  ronda 4. Fallar cerrado ante un secreto faltante; nunca sustituirlo en silencio
  por uno público.
- **La entrada malformada devuelve una oración, no un stack trace.** El
  verificador offline valida la forma en el borde y sale con código distinto de
  cero — nunca llega a `valid: true` por accidente (hallazgo **F12**).
- **Sin cobertura no hay hallazgo negativo.** Si el perito declara que una fuente
  que debía examinarse no se examinó, un resultado de "no se encontró nada" se
  degrada a `ABSTAIN` y nombra qué faltó. Ver §3.10.

### 3.3 Canonicalización: hecha para que la reimplementación del perito de la contraparte coincida

Es la parte menos vistosa de VELO y la que más probablemente decida si un
veredicto sobrevive a una impugnación. Si un perito de la contraparte
reimplementa el verificador en Python y computa un hash distinto para un bundle
intacto, concluye que la evidencia fue alterada. El bug es nuestro; la
consecuencia es de la víctima.

Forma canónica v2 (todo string canónico empieza literalmente con `v2:`):

- **Type tags**, para que tipos distintos nunca colisionen: `bigint` lleva sufijo
  `n`, los strings se normalizan a NFC y después se citan como JSON, `-0` colapsa
  a `0`.
- **Claves ordenadas por code point Unicode, no por code unit UTF-16.** El
  `Array.sort()` común ordena los caracteres del plano astral *antes* de
  U+E000–U+FFFF, mientras que Python, Go y Rust los ordenan *después*. Hallazgo
  **F9**: mismo bundle, hash distinto, en otro lenguaje. Arreglado con un
  `compareByCodePoint` explícito.
- **Los números se rechazan, no se coercionan.** No finito tira error. No entero
  tira error (*"usá un Fraction o un bigint"*). Enteros más allá de 2⁵³−1 tiran
  error, porque a esa altura la precisión ya se puede haber perdido (hallazgo
  **F11**).
- **Dos canonicalizadores independientes, fijados uno contra el otro.** El
  verificador offline duplica esta lógica a propósito, para tener cero
  dependencias de npm. La duplicación garantiza deriva — los dos *ya* habían
  divergido en el manejo de bigint cuando lo encontramos (hallazgo **F8**). El
  arreglo no fue borrar uno: fue una **suite de conformidad que fija a los dos
  contra 20 vectores compartidos**, para que la deriva rompa un test en vez de
  aparecer en un tribunal.
- **Las claves JSON duplicadas se rechazan de plano** (hallazgo **F10**).
  `JSON.parse` se queda con el último valor; otros lenguajes se quedan con el
  primero. Los mismos bytes podrían verificar a veredictos opuestos según quién
  abra el archivo.

### 3.4 Cadena de custodia

```
genesis_hash = sha256("VELO_GENESIS:" + caseId)
entry_hash   = sha256(canonicalize({ seq, eventType, timestamp, detail, prevHash }))
```

El génesis queda atado al identificador del caso por ese prefijo de dominio, así
que una cadena no se puede levantar de un caso e injertar en otro. El vocabulario
de eventos es **cerrado** — `IDENTIFIED, COLLECTED, ACQUIRED, PRESERVED,
ANALYZED, SEALED`: los cuatro procesos nombrados por ISO/IEC 27037:2012 más los
dos que esa norma no anticipa porque es anterior al sellado criptográfico. Ese
vocabulario se impone **en runtime**, no solo como tipo de TypeScript, porque los
tipos desaparecen en runtime y una cadena con `eventType: "EVENTO_INVENTADO"`
antes verificaba limpio (hallazgo **F7**). La verificación además re-chequea que
`seq` sea consecutivo desde cero, que los timestamps parseen, y que nunca corran
para atrás.

**La limitación para la que escribimos un test que prueba que la tenemos.** Una
cadena de hashes a la que se le borraron las últimas N entradas sigue siendo
internamente consistente: el truncamiento no se detecta mirando la cadena sola.
`pipeline.test.ts` contiene un test que afirma `valid === true` sobre una cadena
truncada, *a propósito*, para que el hueco se vea en la suite en vez de quedar
implícito en un doc. La defensa real es que el `custody_tip` está adentro del
commitment on-chain: una cadena local acortada ya no coincide con el valor
publicado, y el atacante no puede reescribir el ledger. **El tip es el punto de
anclaje; el ledger es el ancla.**

### 3.5 Dos hashes, a propósito

- `analysisFingerprint` — solo sobre el núcleo determinista, **sin timestamp y
  sin cadena de custodia**. Volver a correr el motor sobre la misma evidencia lo
  reproduce exactamente. Es lo que hace que la verificación por replay tenga
  sentido.
- `bundleHash` — el núcleo *más* `sealedAt` y el tip de custodia. Único para este
  evento de sellado en particular.

Colapsar los dos en un solo hash es el error que hace imposible "demostrá que lo
volviste a correr y te dio lo mismo".

### 3.6 El modelo está fuera del camino de decisión

Ningún LLM puntúa, clasifica ni decide nada. El scorer es aritmética
determinista; el veredicto queda sellado antes de que ocurra cualquier
narración. Es una decisión de arquitectura deliberada, no una omisión: un sistema
cuya salida es evidencia no puede tener un componente probabilístico entre la
entrada y el veredicto.

### 3.7 Auditoría adversarial de nuestro propio sistema: seis rondas

| Ronda | Alcance | Hallazgos | Resultado |
|---|---|---|---|
| 1 | Barrido completo de código — motor, sellado, MCP, store | 13 (**F1–F13**) | 13 arreglados |
| 2 | Promesa vs. garantía — ¿los docs afirman lo que la prueba establece? | 10 entradas (**G1–G10**) | 5 arreglados, 4 registrados como limitaciones conocidas, 1 reclasificado como encuadre de negocio |
| 3 | Superficie web / loopback | 2 (**F14–F15**) | 1 arreglado, 1 ataque falsado, 1 hueco arquitectónico abierto |
| 4 | Tooling de deploy y la wallet que maneja valor real | 3 (**F16–F18**) | 1 mitigado, 2 arreglados |

**Totales de las seis rondas: 36 entradas / 35 hallazgos. 26 arreglados, 1
mitigado, 4 documentados como limitaciones vigentes, 1 ataque falsado y
conservado en el registro, 1 reclasificado como encuadre de negocio y no como
defecto, 3 abiertos y documentados (ronda 6). Se ejecutaron y bloquearon 11 vectores de ataque distintos** — entre ellos path
traversal en seis codificaciones, reordenamiento de la cadena, inserción en el
medio, injerto de cadena en otro caso, truncamiento sin rehash, un intento de
`MALICE` con un solo detector, y un barrido de monotonicidad sobre los 19×19
pares de marcadores que dio **cero violaciones**.

Algunos hallazgos concretos, porque los específicos son el argumento:

- **F1 (Crítico)** — path traversal de lectura/escritura vía `caseId`, explotado
  de punta a punta sobre el protocolo MCP real, no teorizado. Arreglado.
- **F2 (Alto)** — el gate de corroboración contaba *categorías de detector* en
  vez de *fuentes independientes*. Un solo artefacto llegaba a `MALICE` con
  "corroboración 4". Arreglado: hoy la corroboración resuelve cada artefacto que
  contribuyó hasta su raíz de procedencia y de-duplica.
- **F5 (Alto)** — corrimos el corpus del demo por su propio motor y **8 de 13
  casos discrepaban con su veredicto documentado.** Una corrección que salió de
  ahí: el veredicto documentado de VELO-011 bajó de `MALICE` a `SUSPICION`,
  porque una sola contradicción entre fuentes desde una única fuente no puede
  pasar el gate real. Forzarlo de vuelta a `MALICE` habría sido exactamente la
  deriva de la que hablaba el hallazgo.
- **F14 (Crítico al encontrarlo)** — cross-origin request forgery en la API de
  loopback. Demostrado en Chromium real con Playwright: un formulario
  cross-origin auto-enviado desde otro puerto local **sobrescribió un veredicto
  `MALICE` sellado y lo dejó en `ABSTAIN`, corroboración 0.** Arreglado con un
  chequeo estricto y compartido de `Content-Type` que devuelve 415; verificado
  contra un servidor vivo y re-corriendo el ataque original en el navegador.
- **F15** — un intento de prompt injection contra un agente que manejaba
  `seal_case`. El agente resistió: escribió un abogado del diablo real anclado en
  la evidencia, se negó a la lectura cruzada inyectada, y marcó el texto
  inyectado como no confiable. **Registrado como FALSADO, no como CERRADO** — un
  agente, un modelo, un encuadre, una corrida. El hueco arquitectónico al que
  apuntaba (el servidor no valida nada sobre escrituras manejadas por agentes)
  sigue listado como abierto en §5.

### 3.8 Postura de dependencias: un upgrade tomado y uno deliberadamente no

`next` se subió de **15.5.7 a 15.5.23** — un bump de parche dentro de 15.5.x —
lo que limpió alrededor de treinta advisories, incluyendo SSRF en Server
Actions, envenenamiento de caché de respuestas RSC, XSS vía nonces de CSP, y
divulgación no autenticada de endpoints internos de Server Functions. Verificado
después: typecheck limpio, `next build` compila, todas las rutas presentes.

Quedan dos advisories (`postcss`, path traversal vía `sourceMappingURL`;
`sharp`, CVEs heredadas de libvips). El único remedio que ofrece npm es
`next@16.3.0`, un major que rompe. No lo tomamos, por dos razones declaradas:
ninguno de los dos paquetes está en un camino que llegue a la evidencia de un
usuario (`postcss` procesa únicamente nuestro propio CSS; `sharp` corre en un
optimizador de imágenes configurado sin remote patterns), y un upgrade mayor de
framework la noche anterior a una demostración tiene como modo de falla "la UI no
compila y no hay tiempo para averiguar por qué". Está escrito en
`DEPENDENCY_SECURITY.md` como **una decisión acotada y fechada, no como una
afirmación de que las advisories son inofensivas.** Next 16 es el primer upgrade
a intentar antes de que esto corra en cualquier lado real.

### 3.9 Postura de testing

El trabajo de frontend es **TDD obligatorio**: test que falla primero,
implementación mínima, refactor en verde, suite completa antes del push, y
ninguna implementación de frontend se commitea sin que su test se haya escrito
antes y después pase. Vitest y React Testing Library para unitarios e
integración, Playwright para end-to-end. Tres viewports fijos (375 / 768 / 1440),
contraste WCAG 2.1 AA, targets táctiles de 44×44 px, orden de `:focus-visible`,
`prefers-reduced-motion`.

Progresión de la suite a lo largo de las rondas de auditoría, tal como quedó
registrada en su momento: **9/9 → 14/14 → 34/34 → 41/41 → 38/38 → 53/53 → 58/58 → 115/115** (la única
caída es el retiro del servidor HTTP de loopback después de F14, no una
regresión; el trabajo de huecos de cobertura y lectura on-chain lo llevó a 58, y
el port de VIGÍA a 115). Entre las dos suites los runners informan **231
tests pasando: 115 en el motor (`npm test`) y 116 en el frontend (`vitest run` en
`frontend/`)**. Son runners separados, así que una suite raíz en verde no dice
nada sobre el frontend ni al revés — se dan los dos números porque cualquiera
solo subestima la cobertura. Versiones anteriores de este documento estimaban el
total a mano; en §6 queda registrado por qué se retiró esa estimación.

---

### 3.10 La ausencia de evidencia no es evidencia de ausencia

El motor decía dos cosas distintas con una sola palabra.

| Qué pasó realmente | Qué informaba el motor |
|---|---|
| Examinamos todo y no encontramos nada | `NOISE` |
| El log que lo habría resuelto rotó antes de que alguien lo pidiera | `NOISE` |
| La segunda máquina nunca se imagenó | `NOISE` |

Lo primero es un hallazgo. Los otros dos son un **desconocido**. Informarlos
igual es exactamente la sobreafirmación que este proyecto existe para prevenir,
cometida por el motor sobre su propia salida — y se verificó como comportamiento
real antes de cambiar nada: cero artefactos con cadena de custodia válida
devolvía `NOISE`.

Ahora el perito puede declarar un **hueco de cobertura**: una fuente que debía
examinarse y no se examinó, con el motivo. Un hueco declarado degrada un
hallazgo **negativo** a `ABSTAIN` y nombra qué faltó:

> No se encontró nada anómalo en lo examinado, pero 2 fuente(s) esperada(s) no
> pudieron examinarse: logs del proxy corporativo, 8–20 de julio de 2026 (se
> retienen 7 días y rotaron…); historial de dispositivos USB (…). Un hallazgo
> negativo no se sostiene sobre evidencia que nunca estuvo disponible.

Tres propiedades lo convierten en un mecanismo y no en una etiqueta:

- **Degrada solo negativos.** Un `MALICE` corroborado con los mismos huecos
  sigue siendo `MALICE`. Que un log no relacionado haya rotado no borra la
  evidencia de lo que **sí** está. El hueco socava la afirmación de que no hay
  nada, no el hallazgo.
- **Se declara, nunca se infiere.** El motor no puede saber qué nunca se
  recolectó, así que esto es una afirmación humana del mismo tipo que un evento
  de custodia. Un test fija ese límite para que nadie después intente detectarlo
  automáticamente.
- **Va sellado dentro del fingerprint del análisis.** Borrar los huecos para
  promover un `ABSTAIN` de vuelta a `NOISE` falla la verificación: no coinciden
  ni el fingerprint ni el hash del bundle. Dejarlos fuera del commitment habría
  sido el mismo defecto que F3, donde el tip de custodia quedaba fuera del hash
  que supuestamente lo anclaba.

**La demostración es un par controlado.** `VELO-010` y `VELO-014` se
construyeron como gemelos:

| | `VELO-010` | `VELO-014` |
|---|---|---|
| Score | `0/1` | `0/1` |
| Detectores disparados | ninguno | ninguno |
| Cadena de custodia | válida | válida |
| Huecos de cobertura declarados | ninguno | 2 |
| **Veredicto** | **`NOISE`** | **`ABSTAIN`** |

Idéntico peso probatorio, una sola diferencia, y el veredicto se mueve. Un test
fija que los scores se mantengan idénticos — sin eso el par podría terminar
difiriendo por alguna razón no relacionada y seguir pareciendo que aísla la
variable —, que el razonamiento nombre cada fuente faltante, y que retirar los
huecos devuelva `VELO-014` a `NOISE`.

Los dos huecos de `VELO-014` son un log de proxy que rotó siete días antes de
que lo pidieran y una rama de registro destruida por un reimagen de rutina de
IT. Los dos son proceso ordinario, nadie escondiendo nada. Es deliberado: la
versión honesta de este problema no es el sabotaje, es un caso que llega al
laboratorio tres semanas tarde.

Notar que la *evidencia de ausencia* ya estaba resuelta y siempre lo estuvo:
`log_cleared`, `usn_journal_gap` y `surgical_deletion` son marcadores de
detector, y `VELO-006` ("El Vacío Quirúrgico") está construido exactamente sobre
eso. Lo que no tenía a dónde ir era la *ausencia de evidencia*.

## 4. Las cinco cosas que no se pueden fingir en diez horas

Si un jurado quiere un solo filtro para separar un sistema real de un demo bien
decorado, es este: **los demos acumulan features, los sistemas de ingeniería
acumulan resultados negativos.** Los nuestros están en el repositorio, fechados.

1. **Un test escrito para probar que existe una limitación.**
   `pipeline.test.ts` afirma que el truncamiento de custodia pasa la
   verificación local. Nadie escribe ese test para quedar bien. Existe para que
   el hueco no se cierre en silencio.
2. **Una mitigación que falló, documentada como fallida.** El primer wrapper de
   redacción del seed de F16 pasó 10/10 bajo Node, quedó registrado como
   MITIGATED, y el seed se imprimió entero en el primer deploy real — porque el
   deploy corre bajo Bun, que implementa `console` de forma nativa y se saltea
   `process.stdout.write` por completo. Reescribimos el doc para que dijera
   "falló en la primera corrida real" antes de reescribir el código.
3. **Un test que pasó mientras lo que testeaba estaba visiblemente roto.** Bajo
   Bun, el script de verificación imprimió el seed tres veces entero y justo
   abajo afirmó `PASS — el seed crudo nunca llega al stream`. Capturaba la salida
   reemplazando `process.stdout.write` — el mecanismo exacto que Bun se saltea —
   así que el array de captura quedó vacío, y `!"".includes(seed)` es `true`.
   **Un check que no observa nada aprueba todo.** El arreglo fue dejar de
   interceptar: hoy el script lanza un subproceso, lo deja escribir a un pipe
   real, y busca en los bytes que realmente salieron — agnóstico del runtime por
   construcción. Ahora 10/10 bajo **los dos**, Bun y Node.
4. **Un ataque falsado conservado en el registro.** La prompt injection de F15 no
   funcionó. Escribimos que no funcionó, y que eso no cierra la pregunta.
5. **Un corpus chequeado contra su propio motor.** F5 encontró 8 de 13 casos de
   demo discrepando con su veredicto documentado. El corpus que se entrega es el
   que sobrevivió a que lo corrieran.

---

## 5. Qué *no* establece esto

Dicho lo más llanamente que podemos, porque una herramienta forense que exagera
su propia garantía es el modo de falla que existe para prevenir.

**En una frase:** VELO prueba que un veredicto específico fue producido por un
proceso específico, bajo restricciones especificadas, y que la atestación
resultante no puede alterarse después. No reemplaza el juicio forense; lo hace
auditable.

| Hueco | Qué significa | Dónde vive |
|---|---|---|
| **G1 — procedencia del witness** | Un circuito ZK prueba una relación *entre los valores de witness que se le dan*, no que esos valores describan algo que ocurrió. Un prover que evita el código normal de llamada y provee bytes de witness a mano puede producir una prueba válida sobre evidencia que nunca se analizó. Hoy ese binding existe solo en `src/witness/witnesses.ts` — TypeScript, fuera de la prueba. | Roadmap: firma del binario del motor verificada en circuito, credencial de perito acreditado, o attestation del entorno |
| **G3 — la independencia se declara, no se prueba** | El circuito chequea `corroboration_count >= 2`. No chequea que las fuentes sean *independientes*; ese chequeo corre off-chain en `scorer.ts` y se confía. Dos archivos extraídos del mismo disco físico pueden dar count 2. **Esto sobrevive incluso si G1 se resuelve del todo.** | Roadmap: raíces de fuente como witnesses, desigualdad de a pares afirmada en circuito |
| **G5 — vinculación entre casos** | Las atestaciones desde la misma wallet son vinculables por dirección, exponiendo la cantidad de casos de un perito, su distribución de veredictos y su cadencia, aunque no se filtre contenido de ningún caso. | Interino: rotación de dirección por caso. Arreglo real: credencial de membresía ZK |
| **G7 — sin binding de versión de regla** | El umbral `>= 2` está hardcodeado. Si algún día pasa a 3, las atestaciones ya publicadas no llevan ninguna marca de qué regla las chequeó. | Fix: meter `ruleVersion` en el commitment junto al separador de dominio |
| **G8 — sin modelo de revocación** | Hoy no es un defecto, porque todavía no existe la credencial de acreditación. Cuando exista, un perito revocado tiene que dejar de poder producir pruebas válidas. | Patrón estándar: árbol de Merkle de revocación, prueba de no-membresía al atestar |
| **G10 — el abogado del diablo no es verificable** | El gate chequea que el campo no esté vacío después de trimear. `"x"` pasa. **Deliberadamente no "arreglado"** — una heurística de palabras clave es gameable y generaría falsa confianza, y un grader LLM volvería a meter un modelo en el camino de decisión. | Roadmap: un resultado estructurado cuya *forma* sí se pueda chequear, sin pretender verificar el contenido |
| **F15 — las escrituras manejadas por agentes no se validan del lado del servidor** | Nada en el servidor chequea que un abogado del diablo esté anclado en evidencia real. Toda la resistencia en la única corrida testeada vino del criterio del modelo que llamaba — no es una propiedad que podamos testear contra regresiones. | Hueco arquitectónico abierto |
| **Firma desde el navegador** | El ciclo completo (sellar → atestar → leer) corre contra `preview`, pero la firma la hace una wallet derivada de seed en la máquina del perito vía `deploy/attest-case.ts`. `POST /api/attest` sigue calculando un commitment local: la wallet 1AM del perito **no** firma desde la UI todavía. | Próximo hito |
| **Deriva en la documentación del corpus** | `CASES.md` documenta 10 casos; se entregan 14 fixtures (VELO-011 a -014 no están documentados ahí; `cases/README.md` sí los cubre). Además queda en el árbol un set anterior de fixtures en español, previo a F5, que hoy fallaría el canonicalizador. | Tarea de higiene, trackeada |

Aparte, e independientemente de todo lo anterior: VELO no establece que el
análisis original del perito se haya hecho honestamente. Eso sigue siendo
responsabilidad humana y judicial, igual que con cualquier peritaje hoy. **VELO
elimina la manipulación posterior de un veredicto sellado. No elimina a un perito
corrupto en el momento del análisis.**

---

## 6. Números, con procedencia

| Métrica | Valor | Fuente |
|---|---|---|
| Dirección del contrato desplegado (`preview`) | `46cac58c…73023d9d` | `deploy/managed-shim/velo-contract.preview.json`; log de deploy, 2026-08-07 |
| Elementos atados en el commitment | 6 | `contracts/velo.compact`, addendum F3 |
| Detectores | 5 | `src/engine/detectors.ts` |
| Umbral de malicia / techo de ruido | `33/100` / `8/100` | `src/engine/scorer.ts` |
| Fuentes independientes mínimas para `MALICE` | 2 | restricción del circuito + `scorer.ts` |
| Versión del formato canónico | v2 | `src/seal/canonical.ts` |
| Vocabulario de eventos de custodia | 6 tipos cerrados | ISO/IEC 27037:2012 + `SEALED`, `ANALYZED` |
| Casos sintéticos / perfiles de perito | 14 / 6 | `cases/`, `peritos-syntetic/` |
| Rondas de red team | 4 | `docs/RED_TEAM_ROUND_1–4.md` |
| Hallazgos levantados / arreglados | 27 / 21 | ídem |
| Vectores de ataque ejecutados y bloqueados | 11 | tablas de vectores descartados de las rondas 1 y 3 |
| Vectores de conformidad que fijan los dos canonicalizadores | 20 | `tests/conformance.test.ts` |
| Barrido de monotonicidad de pares de marcadores | 19×19, 0 violaciones | ronda 1, experimento E14e |
| Advisories de npm limpiadas por el bump de parche de Next | ~30 | `DEPENDENCY_SECURITY.md` |
| Advisories diferidas conscientemente | 2 | ídem, con razonamiento fechado |
| Suite raíz | 115/115 en verde | `npm test`, 2026-08-20 |
| Suite de frontend | 116/116 en verde | `vitest run` en `frontend/`, 2026-08-20 |
| **Las dos suites** | **231/231 en verde** | medido, no derivado — `node scripts/count-tests.mjs` |

**Salvedad sobre el conteo de tests, retirada — y después impuesta.** Versiones
anteriores de este documento informaban "unos 83 casos en runtime", una cifra
derivada a mano porque el test de corpus del motor declara un solo `test(...)`
dentro de un loop sobre los fixtures y varios tests de frontend usan `it.each`.
Esa estimación ya no hace falta: las dos suites se corren y se cuentan. Los
runners informan **115** y **116**, que es lo que dice la tabla.

Medir una vez no alcanzó. Entre el 2026-08-08 y el 2026-08-20 este documento
siguió diciendo 58 y 44 mientras las suites crecían a 115 y 116, y el
`README.md` se desvió a un tercer par de números — tres cifras, ninguna actual.
Un documento que afirma verificabilidad no puede ser lo menos verificado del
repositorio. `scripts/count-tests.mjs` ahora vuelve a medir las dos suites y
falla si algún conteo documentado no coincide con los runners, o si alguna
frase que tiene que vigilar fue reescrita por debajo. El número ya no depende de
que alguien se acuerde de actualizarlo.

**Salvedad sobre el tiempo transcurrido.** La afirmación "construido en un solo
ciclo de trabajo" se verifica en el historial de git, no en este documento.
Lo que este documento afirma es el *estado*, no el cronómetro.

---

## 7. Qué sigue

**Inmediato (cerrar el loop que ya está abierto):**

1. Conectar las *interfaces* a la interacción de cadena que el CLI ya prueba.
   `deploy/attest-case.ts` produce pruebas reales y una atestación real, pero
   `attest_case` (MCP) y `POST /api/attest` siguen devolviendo
   `local_pending_contract`. Lo que queda es plomería, no demostración: la
   pregunta difícil — si el circuito acepta una prueba real — ya está contestada.
2. Reconciliar `CASES.md` con los 14 fixtures que se entregan y sacar del árbol
   la generación anterior a F5 del corpus en español.
3. Meter `ruleVersion` en el commitment (G7) — un cambio chico con una vida
   media larga, y mucho más barato ahora que después de que existan
   atestaciones.

**Siguiente capa de la arquitectura (diseñada, todavía no construida):**

4. **Divulgación selectiva** — un juez con autorización pide la evidencia
   subyacente; el perito la aprueba o la rechaza explícitamente; el
   consentimiento queda registrado on-chain, la entrega de la evidencia sigue
   siendo off-chain y cifrada para quien la solicitó. Nada se divulga
   automáticamente. Más adelante: reparto de secreto por umbral (K-de-N) en vez
   de un simple aprobar/rechazar.
5. **Credencial anónima del perito** — una prueba de membresía de Merkle adentro
   de la prueba ZK, para que el circuito pueda probar que atestó *un perito
   acreditado* sin revelar cuál. Es el mismo mecanismo que cierra la mitad de
   autorización de G1, la vinculabilidad de G5 y la revocación de G8, y por eso
   es la próxima pieza estructural y no tres piezas separadas.
6. **Segunda opinión ciega** — un segundo perito atesta el mismo
   `case_commitment` de forma independiente; el contrato registra coincidencia o
   contradicción sin que ninguno vea el análisis del otro.

**Antes de cualquier uso real:**

7. Binding de raíces de fuente en circuito (G3), para que la independencia se
   pruebe en vez de declararse.
8. Una auditoría adversarial independiente — la nuestra es rigurosa y sigue
   siendo auto-auditoría.
9. Un motor de nivel productivo validado contra un corpus de casos grande, un
   verificador offline publicado de forma independiente, un panel de
   verificación para jueces, y una prueba demostrada de determinismo bit a bit,
   antes de cualquier despliegue en mainnet.

---

## 8. Cuatro preguntas que va a hacer un jurado

**"Tiene diez horas de vida. ¿Cómo va a ser serio?"**
La edad no es la medida; la medida es *qué queda atado*. El contrato está
desplegado, el commitment cubre seis elementos incluyendo el veredicto mismo, la
regla de admisibilidad es una restricción de circuito y no una nota de política,
y el sistema fue atacado seis veces por sus propios autores con 35 hallazgos
escritos y 26 arreglados. Miren lo que registramos como roto: esa es la parte
que lleva tiempo y no se puede pedir prestada.

**"¿Qué les impide atestar lo que se les cante?"**
Para `MALICE` con una sola fuente: el circuito. No hay prueba que enviar. Para la
versión más profunda de la pregunta — qué impide que un prover provea bytes de
witness a mano — nada todavía, y lo nombramos nosotros como G1 en la ronda 2 en
vez de esperar a que lo nombraran ustedes. El arreglo es una credencial de perito
acreditado, y es la próxima pieza estructural que construimos.

**"¿Por qué no publicar la evidencia, o ponerla en IPFS?"**
Porque el cifrado de hoy no es privacidad para siempre, y porque un juez puede
ordenar destruir evidencia mientras que una red p2p permanente no la puede
borrar. Viaja el commitment; la evidencia se queda en la infraestructura de
custodia de la institución que la resguarda.

**"¿Cuál es la parte más débil?"**
Que el circuito prueba una relación entre los valores de witness que recibe, no
que un motor haya corrido alguna vez sobre evidencia real (G1) — y que la
independencia de las fuentes de corroboración se declara en vez de probarse
(G3), lo cual sobrevive incluso si G1 se resuelve. Los dos están en
`ARCHITECTURE.md`, en la sección titulada *"Qué prueba la prueba y qué no"*. Esa
sección la escribimos antes de que nadie preguntara.

---

## Mapa del repositorio

```
contracts/velo.compact          el circuito — commitment, gate Daubert, guarda de replay
src/engine/                     fraction, detectors, scorer, evidence  (sin floats)
src/seal/                       canonical, custody, bundle, verify     (verificador offline)
src/witness/witnesses.ts        los cuatro inputs privados de la prueba
src/core/operations.ts          única fuente de verdad compartida por MCP, HTTP y CLI
src/mcp/                        superficie de tools con forma de wallet
src/simulate.ts                 demo end-to-end, con los dos momentos de rechazo
deploy/                         register-dust, deploy-contract, redact-seed
frontend/                       Next.js 15 · TDD obligatorio · Vitest + Playwright
cases/  peritos-syntetic/       14 casos sintéticos, 6 perfiles de perito, cero PII
docs/RED_TEAM_ROUND_1–4.md      la auditoría adversarial
docs/LEARNINGS.md               lo que entendimos mal primero y bien después
docs/DEPENDENCY_SECURITY.md     el upgrade que tomamos y el que diferimos a propósito
```

---

*Presentado el 2026-08-08; estado verificado el 2026-08-07. Cada ID de
hallazgo de este documento resuelve a una sección fechada del propio registro de
auditoría del repositorio. Versión en inglés: `TECHNICAL_STATUS.md`.*

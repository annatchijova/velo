# Architecture

## English

### Problem

A forensic expert who wants a verdict trusted today has two options: publish the
raw evidence (a victim's photos, a private conversation, a personal device image),
or keep it sealed and ask the court to trust the expert's word. VELO removes that
tradeoff by separating what must be *provable* from what must be *private*.

### Design principle: two ledgers, one boundary

Midnight's dual-ledger model gives VELO a public side and a private side with an
explicit, compiler-enforced boundary (`disclose()`). Nothing crosses that boundary
unless the contract author marks it explicitly.

| | Public (on-chain ledger) | Private (witness, expert's machine only) |
|---|---|---|
| Contains | `commitment`, declared `verdict`, `attestation_count`, `case_commitment` | `bundle_fingerprint`, `custody_tip`, `verdict` detail, `corroboration_count`, `secret_salt` |
| Who sees it | Anyone, forever, immutable | Nobody but the expert, never leaves the machine |
| Proves | That an attestation exists and follows the rules | Nothing directly — it is the input to a ZK proof |

The circuit does not re-run the forensic analysis and does not hash the full
evidence bundle inside the proof — both are unnecessary and impractical. It proves
a narrower, sufficient claim: *the expert knows a `bundle_fingerprint` whose
commitment is the one published, the published verdict is bound to that
fingerprint, and if the verdict is `MALICE`, at least two independent
corroborating sources exist.*

### Layer map

VELO is built in ordered layers. Each layer, on its own, leaves a working product —
later layers extend it, they don't gate it.

1. **Deterministic forensic engine.** A small set of detectors run over evidence
   and produce a verdict on a fixed scale: `NOISE / SUSPICION / MALICE / ABSTAIN`.
   Arithmetic in the decision path uses exact rationals, never floats — a threshold
   comparison must give the same answer on every machine, forever.
2. **Local sealing.** The verdict, the score, which detectors fired, and a
   custody chain are canonicalized (type-tagged, sorted keys, no floats, versioned)
   and hashed into a bundle. Two distinct hashes are kept apart on purpose: a
   `bundle_hash` that includes the timestamp (identifies *this specific sealing
   event*) and an `analysis_fingerprint` that excludes it (identifies *the
   analysis itself*, so a deterministic replay produces the same fingerprint). The
   fingerprint and the custody chain's tip — not the raw bundle — are among the
   values hashed into the on-chain commitment: the fingerprint so a replay of the
   same analysis still matches, the tip so the custody history is anchored to
   something published.
3. **The Compact contract (the gate).** Publishes `commitment = persistentHash
   (domain, bundle_fingerprint, custody_tip, verdict, corroboration_count, salt)` —
   every value the attestation asserts is inside the hash — and enforces the
   corroboration rule as a circuit constraint rather than a policy note: a
   `MALICE` verdict cannot be attested without `corroboration_count >= 2`. Any
   attempt to attest `MALICE` from a single source fails to produce a proof at all.
4. **Interfaces.** The Next.js frontend — hosted on Vercel (the engine runs
   serverless there), developed locally from `frontend/` — exposes seal,
   verify and chain reads; attestation writes stay on the expert's machine
   (`deploy/attest-case.ts`, see [`CHAIN.md`](./CHAIN.md)), and a parallel MCP
   server exposes the same actions as tools, following the same shape as a
   crypto wallet: the asset is a sealed case, not a token. What crosses the
   hosted boundary: artifact manifest metadata, custody events,
   verdict/score/bundle JSON. What never crosses it: raw evidence bytes,
   wallet keys, salts, witness values. Both TDD workflows are mandatory:
   [`FRONTEND_TDD.md`](./FRONTEND_TDD.md) for the frontend and
   [`ROOT_TDD.md`](./ROOT_TDD.md) for the root package.
5. **Tests and simulation.** Threshold tests, corroboration-gate tests,
   determinism tests (same input twice → same fingerprint), and adversarial tests
   (truncate the custody chain, tamper with a field, submit a mismatched
   commitment) validate the engine and the contract independently.
6. **Selective disclosure (scope permitting).** A judge with standing can request
   disclosure of the underlying evidence; the expert grants or denies it
   explicitly. Consent is recorded on-chain; the evidence transfer itself stays
   off-chain, encrypted to the requester. Nothing is disclosed automatically.
7. **Anonymous expert credential (scope permitting).** An accreditation authority
   publishes commitments for accredited experts. The circuit proves membership
   (via a Merkle proof inside the ZK proof) without revealing which expert
   attested — the same relationship a wallet address has to its owner's identity.
   This is a credential check, not a biometric one — see
   [`IDENTITY.md`](./IDENTITY.md) for why.
8. **Blind second opinion (scope permitting).** A second expert can attest the
   same `case_commitment` independently; the contract records agreement or
   contradiction between attestations without either expert seeing the other's
   analysis.

### The custody chain

Each sealing event links to the previous one by hashing over its content plus the
previous entry's hash (`entry_hash = hash(content, prev_hash)`), with the genesis
entry bound to the case identifier so a chain cannot be grafted onto an unrelated
case. Altering, reordering or inserting an entry is caught by replaying the
chain. Truncation is a different problem: a chain with the last N entries
dropped is still internally consistent, so it cannot be caught by looking at
the chain by itself. What catches it is that the `chain_tip` is part of the
on-chain commitment — a shortened local chain no longer matches the published
value, and the attacker cannot rewrite what is already on the ledger. The tip
is the anchor point; the ledger is the anchor.

### Why not store evidence on IPFS or Arweave

Two closed reasons, not a preference:

- **Encryption today is not privacy forever.** Publishing an encrypted blob to a
  public, permanent, p2p network is a bet that today's cryptography stays
  unbroken indefinitely — not an acceptable bet for a victim's evidence.
- **Judicial purge.** If a court orders evidence destroyed, a file on IPFS or
  Arweave cannot be deleted. That conflicts directly with a real legal
  obligation. Raw evidence stays inside the custody infrastructure of the
  institution that holds it (air-gapped storage, not a public network); only the
  `commitment` and the proof travel to the ledger.

### What the proof does and does not establish

**In one sentence:** VELO proves that a specific verdict was produced by a
specific process, under specified constraints, and that the resulting
attestation cannot be altered afterward. It does not replace forensic
judgment; it makes forensic judgment auditable.

The proof establishes that a verdict consistent with the Daubert-inspired
corroboration gate was bound, at the moment of attestation, to a specific
analysis fingerprint and custody tip, and that this binding cannot be altered
afterward — a structural, cryptographic guarantee. It does **not** establish
that the fingerprint corresponds to a real engine run on real evidence: that
binding exists today only in the TypeScript caller (`src/witness/witnesses.ts`),
not inside the circuit, which — by the nature of a ZK circuit — proves a
relationship *between whatever witness values it is given*, not that those
values describe anything that actually happened. A prover who bypasses the
normal calling code and hand-supplies witness bytes can produce a valid proof
for evidence that was never analyzed. Closing that gap requires a
witness-provenance mechanism (an engine signature, an expert accreditation
credential, or an environment attestation) that does not exist yet — see
`docs/RED_TEAM_ROUND_2.md` (finding G1) and the roadmap.

Separately, and independently of the above: it does **not** establish that the
expert's original analysis was performed honestly; that remains a human and
judicial responsibility, exactly as with any forensic report today. VELO
removes the possibility of *post-hoc* tampering with a sealed verdict — it does
not remove the possibility of a corrupt expert at the moment of analysis, and it
does not (yet) remove the possibility of no real analysis having happened at
all.

---

## Español

### Problema

Un perito forense que quiere que le crean un veredicto hoy tiene dos opciones:
publicar la evidencia cruda (fotos de una víctima, una conversación privada, la
imagen de un dispositivo personal) o mantenerla sellada y pedirle al tribunal que
confíe en su palabra. VELO elimina ese dilema separando lo que debe ser
*demostrable* de lo que debe ser *privado*.

### Principio de diseño: dos ledgers, un límite

El modelo de dual-ledger de Midnight le da a VELO un lado público y un lado
privado con un límite explícito, impuesto por el compilador (`disclose()`). Nada
cruza ese límite salvo que el autor del contrato lo marque explícitamente.

| | Público (ledger on-chain) | Privado (witness, solo en la máquina del perito) |
|---|---|---|
| Contiene | `commitment`, veredicto declarado, `attestation_count`, `case_commitment` | `bundle_fingerprint`, `custody_tip`, detalle del `verdict`, `corroboration_count`, `secret_salt` |
| Quién lo ve | Cualquiera, para siempre, inmutable | Nadie salvo el perito, nunca sale de la máquina |
| Prueba | Que existe una atestación y que sigue las reglas | Nada directamente — es el insumo de una prueba ZK |

El circuito no vuelve a correr el análisis forense ni hashea el bundle completo
de evidencia dentro de la prueba — ambas cosas son innecesarias e imprácticas.
Prueba una afirmación más acotada y suficiente: *el perito conoce un
`bundle_fingerprint` cuyo commitment es el que se publicó, el veredicto publicado
está ligado a ese fingerprint, y si el veredicto es `MALICE`, existen al menos
dos fuentes de corroboración independientes.*

### Mapa de capas

VELO se construye en capas ordenadas. Cada capa, por sí sola, deja un producto
que funciona — las capas siguientes lo extienden, no lo condicionan.

1. **Motor forense determinista.** Un conjunto acotado de detectores corre sobre
   la evidencia y produce un veredicto en una escala fija: `NOISE / SUSPICION /
   MALICE / ABSTAIN`. La aritmética en el camino de decisión usa racionales
   exactos, nunca floats — una comparación de umbral tiene que dar la misma
   respuesta en cualquier máquina, siempre.
2. **Sellado local.** El veredicto, el score, qué detectores dispararon y una
   cadena de custodia se canonicalizan (type-tags, claves ordenadas, sin floats,
   versionado) y se hashean en un bundle. Se mantienen dos hashes distintos a
   propósito: un `bundle_hash` que incluye el timestamp (identifica *este evento
   de sellado en particular*) y un `analysis_fingerprint` que lo excluye
   (identifica *el análisis en sí*, de modo que un replay determinista produce el
   mismo fingerprint). El fingerprint y el tip de la cadena de custodia — no el
   bundle crudo — están entre los valores hasheados dentro del commitment
   on-chain: el fingerprint para que un replay del mismo análisis siga
   coincidiendo, el tip para que la historia de custodia quede anclada a algo
   publicado.
3. **El contrato Compact (el gate).** Publica `commitment = persistentHash
   (dominio, bundle_fingerprint, custody_tip, veredicto, corroboration_count, salt)`
   —todo lo que la atestación afirma está dentro del hash— y aplica la regla de
   corroboración como una restricción del circuito, no como una nota de
   política: un veredicto `MALICE` no puede atestarse sin
   `corroboration_count >= 2`. Cualquier intento de atestar `MALICE` con una sola
   fuente directamente no produce una prueba.
4. **Interfaces.** El frontend Next.js — hosteado en Vercel (el motor corre
   serverless ahí), desarrollado localmente desde `frontend/` — expone sellar,
   verificar y lecturas de cadena; las escrituras de atestación quedan en la
   máquina del perito (`deploy/attest-case.ts`, ver
   [`CHAIN.md`](./CHAIN.md)), y un servidor MCP paralelo expone las mismas
   acciones como tools, siguiendo la misma forma que una wallet cripto: el
   activo es un caso sellado, no un token. Lo que cruza el límite hosteado:
   metadatos del manifiesto de artefactos, eventos de custodia, JSON de
   veredicto/score/bundle. Lo que nunca lo cruza: bytes de evidencia cruda,
   claves de wallet, salts, valores de witness. Ambos flujos de TDD son
   obligatorios: [`FRONTEND_TDD.md`](./FRONTEND_TDD.md) para el frontend y
   [`ROOT_TDD.md`](./ROOT_TDD.md) para el paquete raíz.
5. **Tests y simulación.** Tests de umbrales, del gate de corroboración, de
   determinismo (mismo input dos veces → mismo fingerprint), y tests
   adversariales (truncar la cadena de custodia, alterar un campo, enviar un
   commitment que no coincide) validan el motor y el contrato de forma
   independiente.
6. **Divulgación selectiva (si el alcance lo permite).** Un juez con
   autorización puede pedir la divulgación de la evidencia subyacente; el
   perito la aprueba o la rechaza explícitamente. El consentimiento queda
   registrado on-chain; la entrega de evidencia en sí sigue siendo off-chain,
   cifrada para quien la solicitó. Nada se divulga automáticamente.
7. **Credencial anónima del perito (si el alcance lo permite).** Una autoridad
   de acreditación publica commitments de peritos acreditados. El circuito
   prueba pertenencia (vía una prueba de Merkle dentro de la prueba ZK) sin
   revelar cuál perito atestó — la misma relación que tiene una dirección de
   wallet con la identidad de su dueño. Es un chequeo de credencial, no
   biométrico — ver [`IDENTITY.md`](./IDENTITY.md) para el porqué.
8. **Segunda opinión ciega (si el alcance lo permite).** Un segundo perito puede
   atestar el mismo `case_commitment` de forma independiente; el contrato
   registra coincidencia o contradicción entre atestaciones sin que ninguno de
   los dos vea el análisis del otro.

### La cadena de custodia

Cada evento de sellado se liga al anterior hasheando su contenido junto con el
hash de la entrada previa (`entry_hash = hash(contenido, prev_hash)`), con la
entrada génesis atada al identificador del caso para que una cadena no pueda
injertarse en un caso distinto. Alterar, reordenar o insertar una entrada se
detecta reproduciendo la cadena. El truncamiento es otro problema: una cadena a
la que se le borraron las últimas N entradas sigue siendo internamente
consistente, así que no se detecta mirando la cadena por sí sola. Lo que sí lo
detecta es que el `chain_tip` forme parte del commitment on-chain — una cadena
local acortada ya no coincide con el valor publicado, y el atacante no puede
reescribir lo que ya está en el ledger. El tip es el punto de anclaje; el
ledger es el ancla.

### Por qué no se guarda la evidencia en IPFS o Arweave

Dos razones cerradas, no una preferencia:

- **El cifrado de hoy no es privacidad para siempre.** Publicar un blob cifrado
  en una red p2p pública y permanente es apostar a que la criptografía actual
  siga siendo irrompible indefinidamente — una apuesta inaceptable para la
  evidencia de una víctima.
- **Purga judicial.** Si un juez ordena destruir evidencia, un archivo en IPFS o
  Arweave no se puede borrar. Eso choca directamente con una obligación legal
  real. La evidencia cruda vive dentro de la infraestructura de custodia de la
  institución que la resguarda (almacenamiento air-gapped, no una red pública);
  a la red solo viajan el `commitment` y la prueba.

### Qué prueba la prueba y qué no

**En una frase:** VELO prueba que un veredicto específico fue producido por un
proceso específico, bajo restricciones especificadas, y que la atestación
resultante no puede alterarse después. No reemplaza el juicio forense; lo hace
auditable.

La prueba establece que un veredicto consistente con el gate de corroboración
inspirado en Daubert quedó atado, en el momento de la atestación, a un
fingerprint de análisis y un custody tip específicos, y que ese binding no
puede alterarse después — una garantía estructural y criptográfica. **No**
establece que el fingerprint corresponda a una corrida real del motor sobre
evidencia real: ese binding hoy existe solo en el caller de TypeScript
(`src/witness/witnesses.ts`), no dentro del circuito, que — por la naturaleza
de un circuito ZK — prueba una relación *entre los valores de witness que se
le dan*, no que esos valores describan algo que realmente ocurrió. Un prover
que evita el código normal de llamada y provee bytes de witness a mano puede
producir una prueba válida para evidencia que nunca fue analizada. Cerrar ese
hueco requiere un mecanismo de procedencia del witness (firma del motor,
credencial de perito acreditado, o attestation del entorno) que todavía no
existe — ver `docs/RED_TEAM_ROUND_2.md` (hallazgo G1) y el roadmap.

Por separado, e independientemente de lo anterior: **no** establece que el
análisis original del perito se hizo de forma honesta; eso sigue siendo
responsabilidad humana y judicial, igual que con cualquier peritaje hoy. VELO
elimina la posibilidad de manipulación *posterior* de un veredicto sellado —
no elimina la posibilidad de un perito corrupto en el momento del análisis, y
todavía no elimina la posibilidad de que no haya habido ningún análisis real.

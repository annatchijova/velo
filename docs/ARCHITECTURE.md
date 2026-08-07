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
| Contains | `commitment`, declared `verdict`, `attestation_count`, `case_commitment` | `bundle_fingerprint`, `verdict` detail, `corroboration_count`, `secret_salt` |
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
   fingerprint — not the raw bundle — is what gets committed on-chain.
3. **The Compact contract (the gate).** Publishes `commitment = persistentHash
   (bundle_fingerprint, salt)` and the declared verdict, and enforces the
   corroboration rule as a circuit constraint rather than a policy note: a
   `MALICE` verdict cannot be attested without `corroboration_count >= 2`. Any
   attempt to attest `MALICE` from a single source fails to produce a proof at all.
4. **Interfaces.** A local frontend (loopback server, no hosted backend) exposes
   three actions — seal, attest, verify — and a parallel MCP server exposes the
   same actions as tools, following the same shape as a crypto wallet: the asset
   is a sealed case, not a token.
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
8. **Blind second opinion (scope permitting).** A second expert can attest the
   same `case_commitment` independently; the contract records agreement or
   contradiction between attestations without either expert seeing the other's
   analysis.

### The custody chain

Each sealing event links to the previous one by hashing over its content plus the
previous entry's hash (`entry_hash = hash(content, prev_hash)`), with the genesis
entry bound to the case identifier so a chain cannot be grafted onto an unrelated
case. A `chain_tip` value guards against silent truncation: dropping the last N
entries changes the tip, so a shortened chain is detectable even without replaying
every entry.

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

The proof establishes that the published verdict was not altered after sealing
and that the corroboration rule was actually satisfied — a structural,
cryptographic guarantee, not a claim resting on trust in the expert. It does
**not** establish that the expert's original analysis was performed honestly;
that remains a human and judicial responsibility, exactly as with any forensic
report today. VELO removes the possibility of *post-hoc* tampering with a sealed
verdict — it does not remove the possibility of a corrupt expert at the moment of
analysis.

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
| Contiene | `commitment`, veredicto declarado, `attestation_count`, `case_commitment` | `bundle_fingerprint`, detalle del `verdict`, `corroboration_count`, `secret_salt` |
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
   mismo fingerprint). El fingerprint — no el bundle crudo — es lo que se
   commitea on-chain.
3. **El contrato Compact (el gate).** Publica `commitment = persistentHash
   (bundle_fingerprint, salt)` y el veredicto declarado, y aplica la regla de
   corroboración como una restricción del circuito, no como una nota de
   política: un veredicto `MALICE` no puede atestarse sin
   `corroboration_count >= 2`. Cualquier intento de atestar `MALICE` con una sola
   fuente directamente no produce una prueba.
4. **Interfaces.** Un frontend local (servidor loopback, sin backend hosteado)
   expone tres acciones — sellar, atestar, verificar — y un servidor MCP paralelo
   expone las mismas acciones como tools, siguiendo la misma forma que una
   wallet cripto: el activo es un caso sellado, no un token.
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
   wallet con la identidad de su dueño.
8. **Segunda opinión ciega (si el alcance lo permite).** Un segundo perito puede
   atestar el mismo `case_commitment` de forma independiente; el contrato
   registra coincidencia o contradicción entre atestaciones sin que ninguno de
   los dos vea el análisis del otro.

### La cadena de custodia

Cada evento de sellado se liga al anterior hasheando su contenido junto con el
hash de la entrada previa (`entry_hash = hash(contenido, prev_hash)`), con la
entrada génesis atada al identificador del caso para que una cadena no pueda
injertarse en un caso distinto. Un valor `chain_tip` protege contra el
truncamiento silencioso: borrar las últimas N entradas cambia el tip, así que una
cadena acortada es detectable incluso sin reproducir cada entrada.

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

La prueba establece que el veredicto publicado no fue alterado después del
sellado y que la regla de corroboración efectivamente se cumplió — una garantía
estructural y criptográfica, no una afirmación que descansa en confiar en el
perito. **No** establece que el análisis original del perito se hizo de forma
honesta; eso sigue siendo responsabilidad humana y judicial, igual que con
cualquier peritaje hoy. VELO elimina la posibilidad de manipulación *posterior*
de un veredicto sellado — no elimina la posibilidad de un perito corrupto en el
momento del análisis.

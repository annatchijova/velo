# Business Case

This document reframes VELO's positioning and lays out the commercial case beyond
the current deliverable. **None of this is being built yet.** The current
scope is fixed by [`ROADMAP.md`](./ROADMAP.md); this document is the
vision layer that scope serves, kept separate on purpose so a pitch slide never
gets mistaken for a shipped feature.

## English

### The positioning problem

"Zero-knowledge attestation of forensic verdicts" is accurate and uninteresting
to the person who would actually pay for it. Nobody buys a cryptographic
primitive. What a forensic expert, a law firm, or an institution buys is
**reputation, track record, and the ability to demonstrate reliability** — VELO
is a mechanism for delivering that without exposing the evidence a case was
built on.

The reframe is already latent in the product itself. The MCP interface was
designed as a wallet from the start (`README.md`: *"a wallet, but the asset is
a sealed case instead of money"*). Taking that seriously as the product
identity, not just an implementation metaphor, is the actual repositioning:

**VELO is a professional evidence wallet** — a cryptographic identity for a
forensic expert, holding a portfolio of sealed, provable work instead of funds.

```
EXPERT
  |
  +-- ZK professional credential
  |
  +-- Sealed cases
        |
        +-- Case type
        +-- Date
        +-- Jurisdiction
        +-- Rule satisfied
        +-- Outcome
        +-- Commitment
        +-- ZK proof
        +-- Audit history
```

It does not store evidence. It stores proof that verifiable analysis happened.
The closest existing analogy is a verifiable professional record — but where
LinkedIn says "I claim expertise," VELO says "cryptographic proof exists that I
participated in analyses that satisfied specific rules."

### Case 1 — Expert reputation

**Today:** a judge or attorney receives "Dr. X is a digital forensics expert,"
backed by PDF certificates, testimonials, years of experience — entirely
social proof.

**With VELO:** "This expert has 143 sealed cases, 98 accepted under the
admissibility rule, 12 independent audits, zero invalidated attestations" —
without revealing victims, evidence, or clients.

### Case 2 — Expert marketplace

An insurer needing a fraud investigator today searches by contacts, price, and
reputation. With a reputation layer, the search becomes structured and
verifiable:

```
Experts:
  specialty: digital fraud
  jurisdiction: Argentina
  sealed cases: >50
  acceptance rate: 96%
  credential: active
```

The expert doesn't show cases. They show proof of track record.

### Case 3 — Evidence escrow

Day 0: the expert analyzes evidence; VELO creates a commitment and records
that the analysis existed. Day 100: at trial, the defense asks "how do we know
this wasn't changed after the fact?" VELO answers: "this analysis existed
before trial and satisfies the admissibility rule" — without disclosing the
underlying evidence.

### Case 4 — Institutions

Likely the most monetizable case. Customers: forensic labs, prosecutors'
offices, law firms, insurers, corporate compliance. An institution accumulates
an aggregate, verifiable trust layer over its own output:

```
Prosecutor's Office X
  |
  +-- 2,500 VELO-sealed cases
  |
  +-- 98% with a verifiable chain
  +-- 0 post-sealing alterations
```

### The pitch line

Not "blockchain for evidence" — that reads as generic. The stronger framing:

> *"VELO is a reputation layer for forensic professionals: it lets experts
> prove the quality and admissibility of their work without exposing the
> evidence they were trusted to protect."*

This is also where Midnight stops being an implementation detail and becomes
the point: private evidence, public result, public reputation, private proof —
the dual-ledger split *is* the product, not a means to it.

### Why this needs the credential layer, not just sealed cases

The red team's F4 finding (`RED_TEAM_ROUND_1.md`) is directly relevant here: a
sealed bundle proves internal consistency, not authenticity — it does not by
itself prove *who* produced it. A reputation layer without a way to bind a
case to a specific accredited expert has no reputation to aggregate.

That is exactly what the anonymous expert credential (Layer 7 in
`ARCHITECTURE.md`) is for: a case proves membership in an accredited-experts
set via a ZK Merkle proof, without revealing which expert — the same relation
a wallet address has to its owner's identity. Under this framing, that layer
stops being an optional stretch goal and becomes the piece that makes
"reputation" a well-founded claim instead of an unverified label. It remains
scoped as a **later** layer; the business case explains *why* it
matters, not a change to *when* it gets built.

### What this means in the near term

This document changes what the demo *says*, not what gets *built* now. Recommended, in order:

1. Close the open red-team item and the critical invariants (done — F5
   fixed and verified against the corpus).
2. Wire the Compact contract end to end, even minimally (`attest_case` against
   the now-compiling contract) — the reputation story needs a real on-chain
   attestation, not a stub, to mean anything.
3. Build a minimal wallet UI: expert profile, a list of cases, one verifiable
   case, and the line "evidence never leaves this wallet" made visible, not
   just documented.
4. Rehearse the demo as a narrative, not a code walkthrough: *"I'm an expert.
   Here's a case. The judge wants to verify it. I give them a proof. They
   never saw the evidence."*

No new product surface (marketplace, escrow flow, institutional dashboard)
gets built for the event. Those stay in this document, as the reason the
judges should care about what *is* being shown.

---

## Español

### El problema de posicionamiento

"Atestación de conocimiento cero de veredictos forenses" es preciso y poco
interesante para quien realmente lo pagaría. Nadie compra una primitiva
criptográfica. Lo que compra un perito, un estudio jurídico o una institución
es **reputación, trayectoria y capacidad de demostrar confiabilidad** — VELO es
un mecanismo para entregar eso sin exponer la evidencia sobre la que se
construyó un caso.

El reencuadre ya está latente en el producto. La interfaz MCP se diseñó como
una wallet desde el principio (`README.md`: *"a wallet, but the asset is a
sealed case instead of money"*). Tomar eso en serio como identidad del
producto, no solo como metáfora de implementación, es el reposicionamiento
real:

**VELO es una billetera profesional de evidencia** — una identidad
criptográfica para un perito, que sostiene un portfolio de trabajo sellado y
demostrable en vez de fondos.

```
PERITO
  |
  +-- Credencial profesional ZK
  |
  +-- Casos sellados
        |
        +-- Tipo de caso
        +-- Fecha
        +-- Jurisdicción
        +-- Regla satisfecha
        +-- Resultado
        +-- Commitment
        +-- Prueba ZK
        +-- Historial de auditorías
```

No almacena evidencia. Almacena prueba de que ocurrió un análisis verificable.
La analogía más cercana es un historial profesional verificable — pero donde
LinkedIn dice "tengo experiencia", VELO dice "existe una prueba criptográfica
de que participé en análisis que cumplieron reglas específicas".

### Caso 1 — Reputación del perito

**Hoy:** un juez o abogado recibe "el Dr. X es experto en informática
forense", respaldado por certificados en PDF, testimonios, años de
experiencia — prueba enteramente social.

**Con VELO:** "Este perito tiene 143 casos sellados, 98 aceptados bajo la
regla de admisibilidad, 12 auditorías independientes, cero atestaciones
invalidadas" — sin revelar víctimas, evidencia ni clientes.

### Caso 2 — Marketplace de peritos

Una aseguradora que hoy necesita un investigador de fraude busca por
contactos, precio y reputación. Con una capa de reputación, la búsqueda se
vuelve estructurada y verificable:

```
Peritos:
  especialidad: fraude digital
  jurisdicción: Argentina
  casos sellados: >50
  tasa de aceptación: 96%
  credencial vigente: sí
```

El perito no muestra los casos. Muestra prueba de trayectoria.

### Caso 3 — Escrow de evidencia

Día 0: el perito analiza evidencia; VELO crea un commitment y registra que el
análisis existió. Día 100: en el juicio, la defensa pregunta "¿cómo sabemos
que esto no se modificó después?". VELO responde: "este análisis existía
antes del juicio y cumple la regla de admisibilidad" — sin divulgar la
evidencia subyacente.

### Caso 4 — Instituciones

Probablemente el caso más rentable. Clientes: laboratorios forenses,
fiscalías, estudios jurídicos, aseguradoras, compliance corporativo. Una
institución acumula una capa de confianza agregada y verificable sobre su
propio trabajo:

```
Fiscalía X
  |
  +-- 2500 peritajes sellados con VELO
  |
  +-- 98% con cadena verificable
  +-- 0 alteraciones post-sellado
```

### La frase de pitch

No "blockchain para evidencia" — suena genérico. El encuadre más fuerte:

> *"VELO es una capa de reputación para profesionales forenses: permite que
> un perito pruebe la calidad y admisibilidad de su trabajo sin exponer la
> evidencia que se le confió proteger."*

Acá Midnight deja de ser un detalle de implementación y pasa a ser el punto:
evidencia privada, resultado público, reputación pública, prueba privada — el
split de dual-ledger **es** el producto, no un medio para llegar a él.

### Por qué esto necesita la capa de credencial, no solo casos sellados

El hallazgo F4 del propio red team (`RED_TEAM_ROUND_1.md`) es directamente
relevante acá: un bundle sellado prueba consistencia interna, no autenticidad
— no prueba por sí solo *quién* lo produjo. Una capa de reputación sin una
forma de atar un caso a un perito acreditado específico no tiene reputación
para agregar.

Para eso exactamente sirve la credencial anónima del perito (Capa 7 en
`ARCHITECTURE.md`): un caso prueba pertenencia a un conjunto de peritos
acreditados vía una prueba de Merkle en ZK, sin revelar cuál perito — la misma
relación que tiene una dirección de wallet con la identidad de su dueño. Bajo
este encuadre, esa capa deja de ser un stretch goal opcional y pasa a ser la
pieza que hace de "reputación" una afirmación bien fundada en vez de una
etiqueta sin verificar. Sigue siendo una capa **posterior**; el caso de
negocio explica *por qué* importa, no cambia *cuándo* se construye.

### Qué significa esto en el corto plazo

Este documento cambia lo que la demo *dice*, no lo que se *construye* ahora.
Recomendado, en orden:

1. Cerrar el hallazgo de red team abierto y los invariantes críticos (hecho —
   F5 arreglado y verificado contra el corpus).
2. Cablear el contrato Compact de punta a punta, aunque sea mínimo
   (`attest_case` contra el contrato que ya compila) — la historia de
   reputación necesita una atestación on-chain real, no un stub, para
   significar algo.
3. Construir una UI de wallet mínima: perfil del perito, lista de casos, un
   caso verificable, y la frase "la evidencia nunca sale de esta wallet"
   visible, no solo documentada.
4. Ensayar la demo como narrativa, no como recorrido de código: *"Soy un
   perito. Tengo este caso. El juez quiere verificarlo. Le doy una prueba.
   Nunca vio la evidencia."*

Ninguna superficie de producto nueva (marketplace, flujo de escrow, dashboard
institucional) se construye para el evento. Eso queda en este documento, como
la razón por la que el jurado debería importarle lo que sí se muestra.

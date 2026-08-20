# Identity & Credentials: Why VELO Does Not Use Biometrics

**Status:** design decision, not yet built. The mechanism this document argues
for — the anonymous expert credential — is Layer 7 in
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and is explicitly scoped as a
stretch goal, not part of the current delivery. This document exists so the
*absence* of facial recognition or other biometrics in VELO reads as a
deliberate boundary, not an oversight.

## English

### The decision

VELO does not, and will not, use facial recognition or other biometrics to
identify the expert behind an attestation. Identity is handled by a
cryptographic accreditation credential instead. This is a design decision, not
a missing feature — adding biometrics later would not complete VELO, it would
compromise it.

### The question that actually needs an answer

"Identity" collapses three distinct questions that a judge asks separately,
whether or not they use these words:

| Layer | The real question | What answers it |
|---|---|---|
| 1. Existence | "Is there a real person behind this?" | Any identity document; biometrics help here, but this layer alone is legally useless |
| 2. Accreditation | "Is this person authorized to produce a forensic attestation?" | A credential issued by an accreditation authority (a professional board, a court registry) |
| 3. Operational binding | "Is the key that signed *this* attestation actually held by that accredited person?" | A digital signature / ZK membership proof, not a fresh biometric check per case |

Facial recognition answers layer 1. The layer that actually matters for VELO —
the one a judge is really asking about — is layer 2. A system that gets very
good at layer 1 while leaving layer 2 unanswered has solved the wrong problem
convincingly.

### Why not biometrics, specifically

**It proves the wrong claim.** A face match proves "this person matches a
previously captured biometric record." It does not prove "this person is an
accredited forensic expert authorized to issue this type of analysis." VELO
needs the second claim. Biometrics is not a weaker version of the credential
check — it is an answer to a different question that happens to sound similar.

**It adds a permanent, non-revocable secret to a project whose entire premise
is minimizing exposed secrets.** A password can be rotated; a face cannot. A
system built to keep a victim's evidence from ever becoming a standing
liability should not create a second, permanent liability — the expert's own
biometric template — as the price of using it.

**It attacks the credibility it is meant to provide.** Face recognition
carries a known, adversarially-relevant failure surface: deepfakes, replay
attacks, lighting- and aging-related false negatives, and spoofing. Wiring a
biometric surface into an anti-tampering system is close to self-contradictory
— exactly the kind of thing [Round 2 of the red team](./RED_TEAM_ROUND_2.md)
exists to catch before a jury does.

**It does not travel across jurisdictions cleanly.** Biometric data is
regulated more strictly, and more inconsistently, than almost any other
category of personal data (GDPR's special-category rules, US state biometric
statutes, consent and retention requirements that vary by country). A forensic
tool aimed at multiple jurisdictions inherits a much harder compliance problem
the moment it stores biometric templates, for a claim (layer 2, above) that
biometrics doesn't even establish.

### Where biometric verification does fit

Onboarding — outside VELO's protocol, not inside it:

```
Day 0 (once, off-protocol):
  Expert applies for accreditation
        |
        v
  Accreditation authority verifies identity
  (whatever process the jurisdiction requires —
   in-person check, documents, biometrics if the
   authority's own policy calls for it)
        |
        v
  Authority issues a ZK-provable credential

Every case after that (on-protocol):
  VELO proves: "a holder of a valid, unrevoked
  credential produced this attestation"
  — without re-verifying a face, and without
    revealing which credential holder it was,
    unless a court compels disclosure.
```

The face, if used at all, verifies the *person applying for a credential*,
once. It is never re-checked per case, and it never becomes part of what a ZK
proof is computed over. This is the same separation VELO already draws between
the raw evidence (handled by the institution's own custody infrastructure) and
the commitment that gets attested — apply the identical logic to the expert's
identity instead of the victim's evidence, and biometrics falls on the "stays
outside the protocol" side of the line for the same reason raw evidence does.

### How this connects to what VELO's own audit already found

This is not a new finding — it is the correct next step given three gaps
[Round 2](./RED_TEAM_ROUND_2.md) already named honestly:

- **G1** (the circuit cannot see whether a witness came from a real engine
  run): biometrics would not close this gap even if added. It answers "who is
  the human," not "did an engine actually run on real evidence" — a face scan
  bolted onto `attest_case` would not make G1's witness-provenance problem any
  smaller. The credential-based fix already on the roadmap for G1 (a
  membership proof required alongside the Daubert gate) is a strictly better
  fit, because it proves *authorization*, which is the actual missing
  guarantee.
- **G5** (cross-case linkability through a persistent attesting wallet):
  adding biometrics would make this strictly worse, not better — a face tied
  to a wallet is a permanent, un-rotatable link between every case that wallet
  ever attests. The credential model is the mitigation *already* named for
  G5, precisely because ZK membership proofs let an expert attest without a
  persistent identifying handle.
- **G8** (no revocation model): biometrics has no natural revocation
  primitive — you cannot un-know what someone's face looks like. A credential
  does: the standard pattern is a revocation Merkle tree checked by
  non-membership proof at attestation time, so a revoked expert simply can no
  longer produce a valid proof going forward. This is the honest answer to
  "what happens when a perito loses their license" — and it only exists if
  identity is credential-based, not biometric.

### Tiered disclosure, once the credential exists

```
Public (anyone reading the ledger):
  Accredited expert:  yes
  Specialty:           yes (e.g. "digital forensics")
  Identity:             hidden

Court, under order:
  Full identity disclosed, exactly like the
  selective-disclosure flow already designed
  for evidence (Layer 6) — consent-gated,
  never automatic.
```

### The line worth saying in the pitch

> "Biometrics identifies a person. Credentials authorize a role. VELO does not
> need to know that someone has a face — it needs to know that the person
> producing this attestation is authorized to. Meeting the wrong requirement
> more precisely does not meet the real one."

A shorter version for a technical judge who asks directly:

> "We don't use facial recognition because it answers a different question
> than the one that matters. A forensic system doesn't need to prove someone
> has a face — it needs to prove they're an accredited expert authorized to
> issue this analysis. That's a credential check, not a biometric one.
> Identity verification belongs to the accreditation authority's onboarding
> process — which may use biometrics if the jurisdiction requires it — never
> to VELO's protocol itself. Putting a face inside every attestation would add
> a permanent, non-revocable secret and a new attack surface to a system whose
> entire point is minimizing exactly that."

---

## Español

### La decisión

VELO no usa, ni va a usar, reconocimiento facial ni otra biometría para
identificar al perito detrás de una atestación. La identidad se resuelve con
una credencial criptográfica de acreditación en su lugar. Esto es una decisión
de diseño, no una funcionalidad faltante — agregar biometría después no
completaría VELO, lo comprometería.

### La pregunta que realmente hay que responder

"Identidad" mezcla tres preguntas distintas que un juez hace por separado,
use esas palabras o no:

| Capa | La pregunta real | Qué la responde |
|---|---|---|
| 1. Existencia | "¿Hay una persona real detrás de esto?" | Cualquier documento de identidad; la biometría ayuda acá, pero esta capa sola es jurídicamente inútil |
| 2. Acreditación | "¿Esta persona está autorizada a producir una atestación forense?" | Una credencial emitida por una autoridad de acreditación (un colegio profesional, un registro judicial) |
| 3. Vínculo operacional | "¿La clave que firmó *esta* atestación la tiene realmente esa persona acreditada?" | Una firma digital / prueba ZK de membresía, no un chequeo biométrico nuevo por caso |

El reconocimiento facial responde la capa 1. La capa que realmente importa
para VELO — la que un juez está preguntando en el fondo — es la capa 2. Un
sistema que se vuelve muy bueno en la capa 1 dejando la capa 2 sin responder
resolvió el problema equivocado de forma convincente.

### Por qué no biometría, específicamente

**Prueba la afirmación equivocada.** Una coincidencia facial prueba "esta
persona coincide con un registro biométrico capturado antes". No prueba "esta
persona es un perito forense acreditado autorizado a emitir este tipo de
análisis". VELO necesita la segunda afirmación. La biometría no es una versión
más débil del chequeo de credencial — es la respuesta a una pregunta distinta
que suena parecida.

**Agrega un secreto permanente y no revocable a un proyecto cuya premisa
entera es minimizar secretos expuestos.** Una contraseña se puede rotar; una
cara no. Un sistema construido para que la evidencia de una víctima nunca se
vuelva un pasivo permanente no debería crear un segundo pasivo permanente —
la plantilla biométrica del propio perito — como precio de usarlo.

**Ataca la credibilidad que se supone que aporta.** El reconocimiento facial
tiene una superficie de fallo conocida y adversarialmente relevante:
deepfakes, ataques de repetición, falsos negativos por iluminación o
envejecimiento, suplantación. Meter una superficie biométrica dentro de un
sistema anti-manipulación es casi autocontradictorio — exactamente el tipo de
cosa que [la Ronda 2 del red team](./RED_TEAM_ROUND_2.md) existe para
detectar antes de que lo haga un jurado.

**No viaja bien entre jurisdicciones.** Los datos biométricos están regulados
de forma más estricta, y más inconsistente, que casi cualquier otra categoría
de dato personal (categorías especiales del GDPR, leyes estatales de
biometría en EE.UU., requisitos de consentimiento y retención que varían por
país). Una herramienta forense pensada para múltiples jurisdicciones hereda un
problema de cumplimiento mucho más difícil apenas empieza a guardar
plantillas biométricas, para una afirmación (capa 2) que la biometría ni
siquiera establece.

### Dónde sí encaja la verificación biométrica

En el onboarding — fuera del protocolo de VELO, no adentro:

```
Día 0 (una sola vez, fuera del protocolo):
  El perito solicita acreditación
        |
        v
  La autoridad de acreditación verifica identidad
  (el proceso que exija la jurisdicción —
   verificación presencial, documentos, biometría
   si la política de la propia autoridad lo pide)
        |
        v
  La autoridad emite una credencial probable en ZK

Cada caso después de eso (dentro del protocolo):
  VELO prueba: "quien tiene una credencial válida
  y no revocada produjo esta atestación"
  — sin re-verificar una cara, y sin revelar cuál
    perito fue, salvo que un tribunal ordene la
    divulgación.
```

La cara, si se usa, verifica a la *persona que solicita una credencial*, una
sola vez. Nunca se vuelve a chequear por caso, y nunca forma parte de lo que
una prueba ZK calcula. Es la misma separación que VELO ya traza entre la
evidencia cruda (a cargo de la infraestructura de custodia de la institución)
y el commitment que se atesta — aplicar la misma lógica a la identidad del
perito en vez de a la evidencia de la víctima, y la biometría cae del lado de
"queda fuera del protocolo" por la misma razón que la evidencia cruda.

### Cómo conecta con lo que la propia auditoría de VELO ya encontró

Esto no es un hallazgo nuevo — es el paso correcto dados tres huecos que
[la Ronda 2](./RED_TEAM_ROUND_2.md) ya nombró con honestidad:

- **G1** (el circuito no puede ver si un witness vino de una corrida real del
  motor): la biometría no cerraría este hueco aunque se agregara. Responde
  "quién es el humano", no "¿corrió realmente un motor sobre evidencia real?"
  — un escaneo facial pegado a `attest_case` no achicaría en nada el problema
  de proveniencia de witnesses de G1. El fix basado en credencial que ya está
  en el roadmap para G1 (una prueba de membresía exigida junto al gate
  Daubert) encaja mucho mejor, porque prueba *autorización*, que es la
  garantía que realmente falta.
- **G5** (vinculación entre casos a través de una wallet de atestación
  persistente): agregar biometría lo empeoraría, no lo mejoraría — una cara
  atada a una wallet es un vínculo permanente y no rotable entre todos los
  casos que esa wallet atestó. El modelo de credencial es la mitigación que
  *ya* se nombró para G5, justamente porque las pruebas de membresía en ZK le
  permiten a un perito atestar sin un handle identificador persistente.
- **G8** (sin modelo de revocación): la biometría no tiene una primitiva
  natural de revocación — no se puede "desaprender" la cara de alguien. Una
  credencial sí: el patrón estándar es un árbol de Merkle de revocación
  chequeado por prueba de no-membresía al momento de atestar, así que un
  perito revocado simplemente no puede volver a producir una prueba válida de
  ahí en más. Esa es la respuesta honesta a "qué pasa si un perito pierde su
  matrícula" — y solo existe si la identidad se basa en credencial, no en
  biometría.

### Divulgación por niveles, una vez que exista la credencial

```
Público (cualquiera que lea el ledger):
  Perito acreditado: sí
  Especialidad:       sí (ej. "informática forense")
  Identidad:           oculta

Tribunal, bajo orden:
  Identidad completa divulgada, igual que el flujo
  de divulgación selectiva ya diseñado para la
  evidencia (Capa 6) — bajo consentimiento, nunca
  automático.
```

### La frase para el pitch

> "La biometría identifica a una persona. Las credenciales autorizan un rol.
> VELO no necesita saber que alguien tiene una cara — necesita saber que la
> persona que produce esta atestación está autorizada a hacerlo. Cumplir el
> requisito equivocado con más precisión no cumple el que realmente importa."

Una versión más corta para un jurado técnico que pregunta directamente:

> "No usamos reconocimiento facial porque responde una pregunta distinta de
> la que importa. Un sistema forense no necesita probar que alguien tiene una
> cara — necesita probar que es un perito acreditado autorizado a emitir este
> análisis. Eso es un chequeo de credencial, no uno biométrico. La
> verificación de identidad pertenece al proceso de onboarding de la
> autoridad de acreditación — que puede usar biometría si la jurisdicción lo
> exige — nunca al protocolo de VELO en sí. Meter una cara dentro de cada
> atestación agregaría un secreto permanente y no revocable, y una superficie
> de ataque nueva, a un sistema cuyo punto entero es minimizar exactamente
> eso."

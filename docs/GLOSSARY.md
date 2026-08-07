# Glossary

## English

**Attestation** — The act of publishing a `commitment` and a declared `verdict`
to the Midnight ledger, accompanied by a ZK proof that the corroboration rule
was followed. Publishing is permanent: an attestation cannot be withdrawn, only
contradicted by a later one.

**`bundle_fingerprint`** — The hash of a sealed analysis bundle with the
timestamp excluded. Two independent runs of the same deterministic analysis on
the same evidence produce the same fingerprint. This is the value committed
on-chain, never the raw bundle.

**`bundle_hash`** — The hash of the same bundle *including* the timestamp.
Identifies one specific sealing event rather than the analysis it contains. Kept
distinct from `bundle_fingerprint` so that a deterministic replay can be
verified independently of when it happened.

**Commitment** — `persistentHash(bundle_fingerprint, salt)`. Published on-chain.
Hiding: reveals nothing about the fingerprint because the salt is random.
Binding: once published, cannot be reinterpreted as the commitment of a
different fingerprint.

**Corroboration count / Daubert gate** — The number of independent sources
supporting a finding. A `MALICE` verdict cannot be attested unless
`corroboration_count >= 2`; the engine downgrades to `SUSPICION` before sealing
if the count is insufficient. Named after the Daubert standard for admissible
expert evidence.

**Custody chain** — The hash-linked sequence of events in a case's lifecycle,
from a genesis entry bound to the `case_id` onward. Each entry seals the
previous one; a `chain_tip` value detects truncation.

**`devil_advocate` field** — A mandatory field on any `MALICE` verdict that
records the strongest counter-explanation considered and why it was rejected.
Forces the engine (and whoever reviews it) to engage with the innocent
explanation before committing to the worst one.

**`disclose()`** — A Compact language construct. Compact's information-flow
type system rejects, at compile time, any write to the ledger derived from a
witness value unless it is explicitly wrapped in `disclose(...)`. It is how the
compiler forces the author to be explicit about what leaves the private side.

**Verdict scale** — `NOISE` (nothing anomalous) → `SUSPICION` (a strong signal
without corroboration) → `MALICE` (corroborated, deliberate) → `ABSTAIN`
(evidence exists but lacks provenance or chain of custody, so it cannot be
admitted either way).

**Witness** — A value known only to the party generating the proof (the
expert's machine), never revealed to the contract or the ledger in clear form.
The circuit proves statements *about* the witness without exposing it.

---

## Español

**Atestación** — El acto de publicar un `commitment` y un `verdict` declarado en
el ledger de Midnight, acompañado de una prueba ZK de que se cumplió la regla de
corroboración. Publicar es permanente: una atestación no se puede retirar, solo
contradecir con una posterior.

**`bundle_fingerprint`** — El hash de un bundle de análisis sellado, sin el
timestamp. Dos corridas independientes del mismo análisis determinista sobre la
misma evidencia producen el mismo fingerprint. Es el valor que se commitea
on-chain, nunca el bundle crudo.

**`bundle_hash`** — El hash del mismo bundle *incluyendo* el timestamp.
Identifica un evento de sellado particular, no el análisis que contiene. Se
mantiene separado del `bundle_fingerprint` para poder verificar un replay
determinista independientemente de cuándo ocurrió.

**Commitment** — `persistentHash(bundle_fingerprint, salt)`. Se publica
on-chain. Hiding: no revela nada del fingerprint porque el salt es aleatorio.
Binding: una vez publicado, no puede reinterpretarse como el commitment de otro
fingerprint.

**Conteo de corroboración / gate Daubert** — La cantidad de fuentes
independientes que respaldan un hallazgo. Un veredicto `MALICE` no puede
atestarse salvo que `corroboration_count >= 2`; el motor degrada a `SUSPICION`
antes de sellar si el conteo no alcanza. El nombre viene del estándar Daubert
para evidencia pericial admisible.

**Cadena de custodia** — La secuencia de eventos del ciclo de vida de un caso,
encadenada por hash, desde una entrada génesis atada al `case_id`. Cada entrada
sella a la anterior; un valor `chain_tip` detecta truncamiento.

**Campo `devil_advocate`** — Un campo obligatorio en todo veredicto `MALICE` que
registra la contraexplicación más fuerte considerada y por qué se descartó.
Obliga al motor (y a quien lo revisa) a confrontar la explicación inocente antes
de comprometerse con la peor.

**`disclose()`** — Una construcción del lenguaje Compact. El sistema de tipos de
flujo de información de Compact rechaza, en tiempo de compilación, cualquier
escritura al ledger derivada de un valor witness salvo que esté explícitamente
envuelta en `disclose(...)`. Es lo que obliga al autor del contrato a ser
explícito sobre qué sale del lado privado.

**Escala de veredictos** — `NOISE` (nada anómalo) → `SUSPICION` (señal fuerte
sin corroboración) → `MALICE` (corroborado, deliberado) → `ABSTAIN` (existe
evidencia pero sin proveniencia o cadena de custodia, así que no se puede
admitir en ningún sentido).

**Witness** — Un valor que solo conoce quien genera la prueba (la máquina del
perito), que nunca se revela en claro al contrato ni al ledger. El circuito
prueba afirmaciones *sobre* el witness sin exponerlo.

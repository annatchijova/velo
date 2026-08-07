# Glossary

Written for a reader with no background in digital forensics, law, or
cryptography. Terms are ordered so each one only uses words already
explained above it — reading top to bottom needs nothing you did not
already have.

*Escrito para alguien sin formación en informática forense, derecho ni
criptografía. Los términos están ordenados para que cada uno use solo
palabras ya explicadas antes — leyendo de arriba a abajo no hace falta
nada previo. Versión en español más abajo.*

---

## English

### 1. The situation this exists for

**Forensic expert (perito)** — The person a court hires to answer a
technical question it cannot answer itself: was this hard drive tampered
with, did this person send this message, was this system attacked
deliberately or by accident. They examine the evidence and write a
report the court relies on.

**Evidence, in this context** — The raw material the expert examines: a
copy of someone's hard drive, their messages, photos, network traffic.
In the cases this project is built for, that material is often the most
private thing a person has, and sometimes the record of the worst thing
that happened to them.

**The problem** — For a court to trust the expert's conclusion, someone
has to be able to check it. Checking has traditionally meant *looking at
the evidence*. So the victim's material gets shown to more people than
strictly needed — opposing counsel, a second expert, sometimes a
courtroom. The alternative is that nobody checks, and the court simply
takes the expert's word. Both options are bad. VELO exists to remove the
choice.

### 2. The legal terms

**Admissible** — Evidence a court is allowed to consider at all.
Separate from whether it is *convincing*: evidence can be completely
accurate and still be inadmissible, if it was obtained or handled in a
way that breaks the rules. An inadmissible finding is not a weak
finding — it is one the court will not look at.

**Chain of custody** — The documented history of a piece of evidence:
who collected it, when, who held it afterwards, what was done to it. Its
purpose is to make substitution or tampering visible. If there is a gap
— an hour where nobody can say where the evidence was — the whole thing
can become inadmissible, regardless of what it shows. This is why VELO
returns `ABSTAIN` rather than a verdict when the custody record is
missing.

**Daubert standard** — The test United States federal courts use to
decide whether to admit expert testimony at all. It asks, roughly:
is the method testable, has it been reviewed by other experts, does it
have a known error rate, and is it accepted in the field. It is named
after a 1993 Supreme Court case. Other countries have equivalents;
Argentina's is doctrinal rather than a single codified rule.

**Corroboration** — Independent support for a finding. If the only
reason to believe something is one source, a single failure or forgery
in that source takes the whole conclusion with it. Requiring two or more
*independent* sources is a standard way to make a conclusion robust,
and it is the specific admissibility rule VELO enforces.

### 3. The cryptographic terms

**Hash** — A short string computed from a file, which acts as its
fingerprint. Two properties matter: the same file always produces the
same hash, and changing anything at all — one letter, one pixel —
produces a completely different one. You cannot work backwards from a
hash to the file it came from. So publishing a hash proves you had a
specific file, without publishing the file.

**Ledger** — A shared record that many independent computers keep copies
of, so that no single party can quietly rewrite history. Once something
is written, it stays written. (This is the part of a blockchain that
matters here; nothing in VELO involves currency.)

**Zero-knowledge proof (ZK proof)** — A way to prove a statement is true
without revealing the information that makes it true. The everyday
analogy: proving you know a password without typing it, so an observer
learns that you know it and nothing else. VELO uses this to prove
"this verdict follows from the sealed evidence, and the corroboration
rule was satisfied" while the evidence itself stays on the expert's
machine.

**Witness** — Unfortunate name collision: here it means the *private
input* to a zero-knowledge proof, not a person testifying. It is the
secret the proof is about — in VELO, the fingerprint of the analysis and
the number of corroborating sources. The proof demonstrates facts about
the witness without exposing it.

**Commitment** — A published value that locks in a secret without
revealing it. The physical analogy is a sealed envelope with a serial
number written on the outside: you can show anyone the number, nobody
can see the contents, and you cannot swap the contents afterwards
because the number would no longer match.

Two properties, both required. *Hiding*: the published value reveals
nothing about what is inside, because a random number (a **salt**) is
mixed in. *Binding*: once published, it cannot later be claimed to
represent something else.

In VELO the commitment is computed inside the circuit as
`persistentHash(domain, bundle_fingerprint, custody_tip, verdict,
corroboration_count, salt)`. Everything the attestation asserts is
inside the envelope on purpose: an earlier design left the verdict and
the corroboration count outside it, which made the guarantee hollow — an
analysis sealed as `NOISE` could be published as `MALICE` with an
invented count. A useful consequence of binding the verdict in: the same
commitment can never carry two different verdicts, so a published
attestation cannot be quietly overwritten. A correction has to be a new
and visibly different one.

**Salt** — The random number mixed into a commitment so the same input
does not always produce the same published value. Without it, two
identical analyses would produce identical commitments on a public
ledger, silently revealing that they are the same. Reusing a salt is a
privacy failure, not an optimisation.

### 4. VELO's own vocabulary

**Attestation** — Publishing a commitment and a declared verdict to the
Midnight ledger, together with a ZK proof that the corroboration rule
was followed. Permanent: an attestation cannot be withdrawn, only
contradicted by a later one.

**Verdict scale** — What the engine can conclude, in increasing order of
seriousness, plus one refusal:

| Verdict | Meaning |
|---|---|
| `NOISE` | Nothing anomalous found. |
| `SUSPICION` | A real signal, but not enough independent support to call it deliberate. |
| `MALICE` | Corroborated and deliberate. Requires at least two independent sources. |
| `ABSTAIN` | Not a verdict. The evidence cannot be admitted at all — typically because the chain of custody is missing or broken — so the engine declines to rule either way. |

`ABSTAIN` is the one worth pausing on: it is the system refusing to
answer a question it is not entitled to answer. Most systems have no
such state.

**Corroboration count / the Daubert gate** — How many independent
sources support the finding. `MALICE` cannot be published unless this is
at least 2; below that the engine downgrades to `SUSPICION` before
sealing anything. This is enforced as a mathematical constraint inside
the ZK circuit, not as a policy note — an attestation that violates it
cannot be produced at all.

Stated precisely: sources are counted as distinct by the root of their
provenance chain, which reflects what the analyst declared about where
the evidence came from. The system verifies that two sources were
*declared* distinct; it does not cryptographically prove they are
genuinely independent (see `docs/RED_TEAM_ROUND_2.md`, finding G3).

**`devil_advocate`** — A mandatory field on any `MALICE` verdict
recording the strongest innocent explanation that was considered, and
why it was rejected. If it is empty, the engine refuses to publish
`MALICE` and downgrades to `SUSPICION`. It exists because the most
dangerous forensic error is finding what you expected to find.

**`bundle_fingerprint`** — The hash of the sealed analysis with the
timestamp removed. Running the same analysis on the same evidence twice
produces the same fingerprint, which is how anyone can confirm a result
is reproducible rather than improvised.

**`bundle_hash`** — The hash of that same analysis *including* the
timestamp. It identifies one particular act of sealing rather than the
analysis inside it. Kept separate from the fingerprint on purpose: one
answers "is this the same analysis?", the other answers "is this the
same moment?", and conflating them makes reproducibility impossible to
demonstrate.

**Custody chain (in VELO)** — The custody history recorded as a sequence
where each entry contains the hash of the previous one. Altering,
reordering or inserting an entry breaks the sequence and is immediately
detectable.

Truncation is the interesting exception: if entries are deleted from the
*end*, what remains is still internally consistent, so the chain alone
cannot reveal the deletion. What reveals it is that the chain's final
value is part of the published commitment — a shortened local copy no
longer matches what is already on the ledger, and the ledger cannot be
rewritten.

**`disclose()`** — A Compact language construct. Compact refuses, at
compile time, to write anything derived from private data to the public
ledger unless the author has explicitly marked it with `disclose(...)`.
It means a privacy leak in VELO would have to be deliberately typed out,
not accidentally introduced.

---

## Español

### 1. La situación que da origen a esto

**Perito forense** — La persona que un tribunal contrata para responder
una pregunta técnica que no puede responder por sí mismo: ¿este disco
fue manipulado?, ¿esta persona envió este mensaje?, ¿este sistema fue
atacado a propósito o falló solo? Examina la evidencia y escribe un
informe en el que el tribunal se apoya.

**Evidencia, en este contexto** — El material crudo que el perito
examina: la copia del disco de alguien, sus mensajes, sus fotos, su
tráfico de red. En los casos para los que está pensado este proyecto,
ese material suele ser lo más privado que una persona tiene, y a veces
el registro de lo peor que le pasó.

**El problema** — Para que un tribunal confíe en la conclusión del
perito, alguien tiene que poder verificarla. Verificar significó
siempre *mirar la evidencia*. Así que el material de la víctima termina
mostrándose a más gente de la estrictamente necesaria: la contraparte,
un segundo perito, a veces una sala entera. La alternativa es que nadie
verifique y el tribunal crea en la palabra del perito. Las dos opciones
son malas. VELO existe para eliminar esa elección.

### 2. Los términos legales

**Admisible** — Evidencia que un tribunal tiene permitido considerar.
Es distinto de que sea *convincente*: una evidencia puede ser
completamente exacta y aun así inadmisible, si se obtuvo o manipuló de
una forma que rompe las reglas. Un hallazgo inadmisible no es un
hallazgo débil: es uno que el tribunal no va a mirar.

**Cadena de custodia** — El historial documentado de una evidencia:
quién la recolectó, cuándo, quién la tuvo después, qué se le hizo. Su
función es hacer visible cualquier sustitución o manipulación. Si hay un
hueco —una hora en la que nadie puede decir dónde estuvo— todo puede
volverse inadmisible, sin importar lo que muestre. Por eso VELO devuelve
`ABSTAIN` en vez de un veredicto cuando falta el registro de custodia.

**Estándar Daubert** — El criterio que usan los tribunales federales de
Estados Unidos para decidir si admiten o no el testimonio de un perito.
Pregunta, a grandes rasgos: ¿el método es testeable?, ¿fue revisado por
otros expertos?, ¿tiene una tasa de error conocida?, ¿está aceptado en
su campo? Toma el nombre de un caso de la Corte Suprema de 1993. Otros
países tienen equivalentes; el de Argentina es doctrinario y
jurisprudencial, no una regla codificada única.

**Corroboración** — Respaldo independiente de un hallazgo. Si la única
razón para creer algo es una sola fuente, una falla o una falsificación
en esa fuente se lleva puesta toda la conclusión. Exigir dos o más
fuentes *independientes* es la forma estándar de volver robusta una
conclusión, y es la regla de admisibilidad concreta que VELO hace
cumplir.

### 3. Los términos criptográficos

**Hash** — Una cadena corta calculada a partir de un archivo, que
funciona como su huella digital. Importan dos propiedades: el mismo
archivo produce siempre el mismo hash, y cambiar cualquier cosa —una
letra, un píxel— produce uno completamente distinto. No se puede
retroceder del hash al archivo. Publicar un hash prueba que se tenía un
archivo específico, sin publicar el archivo.

**Ledger** — Un registro compartido del que muchas computadoras
independientes guardan copia, de modo que ninguna parte pueda reescribir
la historia en silencio. Una vez escrito, queda escrito. (Es la parte de
una blockchain que importa acá; en VELO no hay ninguna moneda
involucrada.)

**Prueba de conocimiento cero (ZK)** — Una forma de demostrar que una
afirmación es verdadera sin revelar la información que la hace
verdadera. La analogía cotidiana: probar que sabés una contraseña sin
escribirla, de modo que quien mira aprende que la sabés y nada más. VELO
lo usa para probar "este veredicto se desprende de la evidencia sellada
y se cumplió la regla de corroboración", mientras la evidencia no se
mueve de la máquina del perito.

**Witness** — Colisión de nombres desafortunada: acá significa la
*entrada privada* de una prueba de conocimiento cero, no un testigo. Es
el secreto sobre el que trata la prueba — en VELO, la huella del
análisis y la cantidad de fuentes que corroboran. La prueba demuestra
hechos sobre el witness sin exponerlo.

**Commitment (compromiso)** — Un valor publicado que fija un secreto sin
revelarlo. La analogía física es un sobre lacrado con un número escrito
afuera: podés mostrarle el número a cualquiera, nadie ve el contenido, y
no podés cambiar el contenido después porque el número dejaría de
coincidir.

Dos propiedades, ambas necesarias. *Hiding*: el valor publicado no
revela nada de lo que hay adentro, porque se mezcla un número aleatorio
(un **salt**). *Binding*: una vez publicado, no se puede alegar después
que representaba otra cosa.

En VELO el commitment se computa dentro del circuito como
`persistentHash(dominio, bundle_fingerprint, custody_tip, veredicto,
corroboration_count, salt)`. Todo lo que la atestación afirma está
adentro del sobre a propósito: un diseño anterior dejaba el veredicto y
el conteo afuera, lo que volvía hueca la garantía — un análisis sellado
como `NOISE` podía publicarse como `MALICE` con un conteo inventado. Una
consecuencia útil de atar el veredicto adentro: un mismo commitment
nunca puede llevar dos veredictos distintos, así que una atestación
publicada no puede sobrescribirse en silencio. Una corrección tiene que
ser nueva y visiblemente distinta.

**Salt** — El número aleatorio que se mezcla en un commitment para que
la misma entrada no produzca siempre el mismo valor publicado. Sin él,
dos análisis idénticos producirían commitments idénticos en un ledger
público, revelando en silencio que son el mismo. Reutilizar un salt es
una falla de privacidad, no una optimización.

### 4. El vocabulario propio de VELO

**Atestación** — Publicar un commitment y un veredicto declarado en el
ledger de Midnight, junto con una prueba ZK de que se cumplió la regla
de corroboración. Es permanente: una atestación no se puede retirar,
solo contradecir con una posterior.

**Escala de veredictos** — Lo que el motor puede concluir, en orden
creciente de gravedad, más una negativa:

| Veredicto | Significado |
|---|---|
| `NOISE` | No se encontró nada anómalo. |
| `SUSPICION` | Hay una señal real, pero no suficiente respaldo independiente para llamarla deliberada. |
| `MALICE` | Corroborado y deliberado. Requiere al menos dos fuentes independientes. |
| `ABSTAIN` | No es un veredicto. La evidencia no puede admitirse — típicamente porque falta o está rota la cadena de custodia — así que el motor se niega a pronunciarse. |

`ABSTAIN` merece una pausa: es el sistema negándose a responder una
pregunta que no está habilitado a responder. La mayoría de los sistemas
no tiene ese estado.

**Conteo de corroboración / el gate Daubert** — Cuántas fuentes
independientes respaldan el hallazgo. `MALICE` no puede publicarse si no
es al menos 2; por debajo de eso el motor degrada a `SUSPICION` antes de
sellar nada. Esto se impone como una restricción matemática dentro del
circuito ZK, no como una nota de política: una atestación que la viole
directamente no puede producirse.

Dicho con precisión: las fuentes se cuentan como distintas por la raíz
de su cadena de proveniencia, que refleja lo que el analista declaró
sobre el origen de la evidencia. El sistema verifica que dos fuentes
fueron *declaradas* distintas; no prueba criptográficamente que sean
genuinamente independientes (ver `docs/RED_TEAM_ROUND_2.md`, hallazgo
G3).

**`devil_advocate`** — Campo obligatorio en todo veredicto `MALICE` que
registra la explicación inocente más fuerte que se consideró, y por qué
se descartó. Si está vacío, el motor se niega a publicar `MALICE` y
degrada a `SUSPICION`. Existe porque el error forense más peligroso es
encontrar lo que uno esperaba encontrar.

**`bundle_fingerprint`** — El hash del análisis sellado, sin el
timestamp. Correr el mismo análisis sobre la misma evidencia dos veces
produce la misma huella, que es como cualquiera puede confirmar que un
resultado es reproducible y no improvisado.

**`bundle_hash`** — El hash de ese mismo análisis *incluyendo* el
timestamp. Identifica un acto de sellado en particular, no el análisis
que contiene. Se mantiene separado de la huella a propósito: uno
responde "¿es el mismo análisis?", el otro "¿es el mismo momento?", y
confundirlos hace imposible demostrar reproducibilidad.

**Cadena de custodia (en VELO)** — El historial de custodia registrado
como una secuencia donde cada entrada contiene el hash de la anterior.
Alterar, reordenar o insertar una entrada rompe la secuencia y se
detecta de inmediato.

El truncamiento es la excepción interesante: si se borran entradas del
*final*, lo que queda sigue siendo internamente consistente, así que la
cadena sola no revela el borrado. Lo que sí lo revela es que el valor
final de la cadena forma parte del commitment publicado — una copia
local acortada ya no coincide con lo que está en el ledger, y el ledger
no se puede reescribir.

**`disclose()`** — Una construcción del lenguaje Compact. Compact se
niega, en tiempo de compilación, a escribir en el ledger público
cualquier cosa derivada de datos privados salvo que el autor lo haya
marcado explícitamente con `disclose(...)`. Significa que una fuga de
privacidad en VELO tendría que escribirse a propósito, no colarse por
accidente.

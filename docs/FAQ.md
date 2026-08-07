# Design FAQ

Answers to the questions most likely to come up about why VELO is built the way
it is — chain choice, domain choice, and the limits of what a hash or a proof
actually establishes.

## English

**So VELO doesn't prove the evidence is true, or that the expert is honest, or
that the algorithm is correct. What does it actually prove?**
VELO proves that a specific verdict was produced by a specific process, under
specified constraints, and that the resulting attestation cannot be altered
afterward. It does not replace forensic judgment; it makes forensic judgment
auditable. Everything the proof does *not* cover — witness provenance, source
independence beyond analyst declaration, the honesty of the original analysis —
is named explicitly, not implied away, in "What the proof does and does not
establish" below and in `docs/RED_TEAM_ROUND_2.md`.

**Why Midnight, and not Aztec or Aleo?**
Aztec targets general smart-contract privacy in an Ethereum-like model — capable,
but without the explicit dual-ledger (public/private) split VELO needs to
separate "the verdict is visible" from "the evidence is not." Aleo is private by
default, and public only where declared — the opposite of what VELO needs: the
verdict public by design, only the witness private. Midnight's dual-ledger model,
with `disclose()` as a first-class language construct, is the exact primitive the
use case calls for.

**Why forensics, and not finance — most Midnight use cases are financial?**
Midnight solves a general problem: proving a rule was satisfied without revealing
the data that satisfies it. Finance is the most common instance of that problem,
not the only one where withholding data matters as much as proving integrity.
Forensics is a domain with real depth to bring, and one few other teams compete
in.

**Does this really need a blockchain, or would a database plus a ZK proof
without a public ledger be enough?**
A need for a record that no single party — not the expert, not an institution,
not a party to the case — can alter retroactively. A database has an admin with
write access; that is exactly the "planted evidence" vector VELO exists to
remove. Midnight's public ledger gives immutability without a central authority,
which a database cannot provide without trusting someone.

**What if the expert lies in the original analysis, before sealing it?**
The system proves that what was published was not altered after sealing, and
that the corroboration rule was satisfied mathematically — it does not prove the
expert was honest in the original analysis. That remains human and judicial
responsibility, as with any forensic report today. VELO removes the possibility
of post-hoc tampering, not the possibility of a corrupt expert.

**Is a hash chain enough — why force ZK at all?**
A hash chain proves something was not altered after publication. What it cannot
do is publish a verdict and the rule it satisfies without publishing the data
that satisfies the rule. ZK proves the corroborating sources exist and meet the
rule, without ever showing them — that's the specific gap ZK closes here, not a
replacement for the rest of the integrity story.

**Isn't this forcing Midnight — wouldn't any chain plus a separate ZK library
work?**
Technically yes, e.g. Ethereum plus circom. The difference is that there the
public/private boundary is built by hand as an external layer, with more surface
for error. In Midnight, the dual-ledger split and private state are part of the
language and protocol — the boundary is declared where the contract is defined,
reducing exactly the kind of error a forensic system cannot tolerate: a value
marked private leaking through an integration bug between pieces that weren't
designed to talk to each other.

**Does a hash actually prove anything legally, or is that just convenient
crypto?**
In the United States, Federal Rules of Evidence 902(13) and 902(14), in force
since 2017, already recognize a hash value as valid self-authentication of an
electronic record without expert testimony. Comparable doctrine and case law
exist elsewhere for hashes as a chain-of-custody fingerprint, even without an
identical codified rule. What has no established legal precedent yet, in any
jurisdiction, is zero-knowledge proofs as authentication — that part is the
frontier, and it is presented as such, not as settled law.

**Isn't this the same as existing blockchain custody chains or anonymous
credential systems?**
Each piece exists separately: chain-of-custody systems solve immutable custody
without ZK; anonymous credential systems solve unlinkable credentials without a
forensic domain; some recent work combines ZK and a private ledger to protect a
whistleblower's identity, without encoding any admissibility rule as a circuit
constraint. The specific combination — an admissibility rule for corroboration
encoded as a ZK circuit constraint, tied to an anonymous accredited-expert
credential, in the forensic-judicial domain — is the gap VELO fills. The claim is
that specific combination, not "ZK for privacy" in general.

---

## Español

**Entonces VELO no prueba que la evidencia sea verdadera, ni que el perito sea
honesto, ni que el algoritmo sea correcto. ¿Qué prueba realmente?**
VELO prueba que un veredicto específico fue producido por un proceso
específico, bajo restricciones especificadas, y que la atestación resultante
no puede alterarse después. No reemplaza el juicio forense; lo hace auditable.
Todo lo que la prueba *no* cubre — la procedencia del witness, la
independencia de las fuentes más allá de lo que declara el analista, la
honestidad del análisis original — está nombrado explícitamente, no dado por
sentado, en "Qué establece y qué no establece la prueba" más abajo y en
`docs/RED_TEAM_ROUND_2.md`.

**¿Por qué Midnight y no Aztec o Aleo?**
Aztec apunta a privacidad general de smart contracts en un modelo tipo Ethereum
— potente, pero sin el split explícito de dual-ledger (público/privado) que VELO
necesita para separar "el veredicto se ve" de "la evidencia no". Aleo es privado
por defecto, y público solo donde se declara — al revés de lo que VELO necesita:
el veredicto público por diseño, solo el witness privado. El modelo de
dual-ledger de Midnight, con `disclose()` como construcción de primer nivel del
lenguaje, es la primitiva exacta que pide el caso de uso.

**¿Por qué forense y no finanzas, si la mayoría de los casos de uso de Midnight
son financieros?**
Midnight resuelve un problema general: probar que se cumplió una regla sin
revelar los datos que la satisfacen. Finanzas es la instancia más común de ese
problema, no la única donde ocultar datos importa tanto como probar integridad.
Forense es un dominio con profundidad real para aportar, y pocos otros equipos
compiten ahí.

**¿Esto realmente necesita blockchain, o alcanzaría con una base de datos más
una prueba ZK sin ledger público?**
Hace falta un registro que ninguna parte — ni el perito, ni una institución, ni
una de las partes del caso — pueda alterar retroactivamente. Una base de datos
tiene un admin con permisos de escritura; eso es exactamente el vector de
"evidencia plantada" que VELO existe para eliminar. El ledger público de
Midnight da inmutabilidad sin autoridad central, algo que una base de datos no
puede dar sin confiar en alguien.

**¿Qué pasa si el perito miente en el análisis original, antes de sellarlo?**
El sistema prueba que lo publicado no fue alterado después del sellado, y que la
regla de corroboración se cumplió matemáticamente — no prueba que el perito fue
honesto en el análisis original. Eso sigue siendo responsabilidad humana y
judicial, como con cualquier peritaje hoy. VELO elimina la posibilidad de
manipulación posterior, no la posibilidad de un perito corrupto.

**¿Alcanza con un hash chain — para qué forzar ZK?**
Un hash chain prueba que algo no fue alterado después de publicarse. Lo que no
puede hacer es publicar un veredicto y la regla que cumple sin publicar el dato
que la satisface. ZK prueba que las fuentes de corroboración existen y cumplen
la regla, sin mostrarlas nunca — ese es el hueco específico que ZK cierra acá,
no un reemplazo del resto de la historia de integridad.

**¿No es forzar Midnight — no serviría cualquier chain más una librería ZK
aparte?**
Técnicamente sí, por ejemplo Ethereum más circom. La diferencia es que ahí el
límite público/privado se arma a mano como capa externa, con más superficie de
error. En Midnight, el split de dual-ledger y el private state son parte del
lenguaje y del protocolo — el límite queda declarado donde se define el
contrato, reduciendo justo el tipo de error que un sistema forense no puede
tolerar: que un valor marcado privado se filtre por un bug de integración entre
piezas que no fueron diseñadas para hablar entre sí.

**¿Un hash realmente prueba algo legalmente, o es solo criptografía conveniente?**
En Estados Unidos, las Federal Rules of Evidence 902(13) y 902(14), vigentes
desde 2017, ya reconocen un valor hash como autenticación válida de un registro
electrónico sin testimonio pericial de base. Existe doctrina y jurisprudencia
comparable en otras jurisdicciones para el hash como huella de cadena de
custodia, aunque sin una regla idéntica codificada. Lo que todavía no tiene
precedente legal establecido en ninguna jurisdicción son las pruebas
zero-knowledge como autenticación — esa parte es la frontera, y se presenta como
tal, no como derecho asentado.

**¿No es lo mismo que ya existe — cadenas de custodia en blockchain o sistemas
de credenciales anónimas?**
Cada pieza existe por separado: los sistemas de cadena de custodia resuelven
custodia inmutable sin ZK; los sistemas de credenciales anónimas resuelven
credenciales no vinculables sin dominio forense; algunos trabajos recientes
combinan ZK y un ledger privado para proteger la identidad de un whistleblower,
sin codificar ninguna regla de admisibilidad como restricción del circuito. La
combinación específica — una regla de admisibilidad de corroboración codificada
como restricción ZK, atada a una credencial anónima de perito acreditado, en el
dominio forense-judicial — es el hueco que llena VELO. La afirmación es esa
combinación puntual, no "ZK para privacidad" en general.

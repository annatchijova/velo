# Learnings

Things this team got wrong first and understood second, recorded while the
reasoning was still fresh. Kept because a project that claims it
understood everything on the first try is either not being audited or not
being honest, and this one is built around the opposite claim.

Each entry: what we hit, what we assumed, what it actually was, how we found
out, and what changed.

---

## L1 — "Insufficient Funds" on a funded wallet: NIGHT is not DUST

**Date:** 2026-08-07 · **Cost:** a deploy that could not go through, plus the
time spent looking in the wrong place first.

### What we hit

Deploying `contracts/velo.compact` to `preview` failed:

```
Deployment failed: Insufficient Funds: could not balance dust
Wallet.InsufficientFunds: Insufficient Funds: could not balance dust
    at catch (.../@midnightntwrk/wallet-sdk-dust-wallet/dist/v1/Transacting.js:279:36)
```

### What we assumed

That the wallet was underfunded, and the fix was more tokens from the faucet.
The word "Insufficient Funds" says so directly, and that reading is wrong.

### What it actually was

On Midnight, transaction fees are paid in **DUST**, and DUST is not a token a
faucet sends you. It is *generated* by **NIGHT** that has been explicitly
**registered for dust generation**. Those are two different things, and the
error message collapses them into one familiar-sounding phrase.

So a wallet can hold plenty of NIGHT and still have exactly zero spendable
DUST. Funding it further changes nothing, because the missing step is not
funding — it is a **separate on-chain registration transaction** that marks
NIGHT UTXOs as dust-generating.

The deploy dependency (`@effectstream/midnight-contracts`) has the function
for it, and its own doc comment states the requirement plainly:

> `registerNightForDust` — "Register unshielded Night UTXOs for dust
> generation. **This is required before the wallet can pay transaction fees.**"

It looks for NIGHT UTXOs whose `meta.registeredForDustGeneration` is `false`,
submits the registration, and waits for DUST to appear.

**The trap:** `deployMidnightContract` never calls it. Its wallet setup
(`buildWalletAndWaitForFunds`) waits only on the **shielded** balance and
ignores the dust balance entirely — it even computes a `dustBalance` and
discards it. On a funded-but-unregistered wallet it reports success and hands
a wallet that cannot pay fees straight to the deploy, which then fails at fee
balancing with a message pointing at funding.

### A second cause, same error text

Worth knowing before it costs someone else an hour: if a wallet sits idle for
roughly an hour, the merkle roots its DUST UTXOs need get pruned from the
node's `root_history`. `dust.balance(now)` still reports a healthy number, but
the balancer cannot construct spend proofs against roots that no longer exist,
so nothing is actually spendable. From the Midnight team's own answer:

> "dust.balance(now) reports total dust value but the balancer needs to
> construct spend proofs against specific UTXOs whose merkle roots must still
> be in root_history. If the wallet sat idle, those roots get pruned (~1h), so
> the balance reads fine but nothing is actually spendable."
>
> — [forum.midnight.network, thread 1164](https://forum.midnight.network/t/preprod-custom-error-173-wallet-insufficientfunds-could-not-balance-dust-despite-large-dust-balance-now-on-shared-bridge-claimer/1164)

That one is not fixed by registering again. It is fixed by freshness: resync
and submit promptly rather than leaving a wallet warm between steps.

### How we found out

Not by guessing harder at the error message. By **reading the exact pinned
version of the dependency's source** — downloading the real published tarball
of `@effectstream/midnight-contracts@0.103.2` from the npm registry and
tracing the call path from `deployMidnightContract` down to where fees are
balanced. The answer was a doc comment in a file nobody had opened.

The second cause came from the Midnight forum, where the team had already
answered it for someone else.

Both are the same lesson in different clothes: **the answer already existed in
writing.** Neither required inventing anything, only reading the thing that
was actually running instead of the thing we assumed was running.

### What changed

- **`deploy/register-dust.ts`** — a standalone script that performs the
  registration, run once per wallet before the first deploy. Standalone
  deliberately: registration state lives on-chain, on the UTXO, so once it
  succeeds the normal deploy path works unmodified. That is a much smaller
  change than restructuring the deploy flow the night before a demo.
- **`README.md`** — a `Insufficient Funds: could not balance dust` section
  that says plainly that this is not a funding problem, so the next person
  reads the answer instead of rediscovering it.
- **`deploy/redact-seed.ts`** — while adding a second script that builds a
  wallet, the seed-redaction logic from red team F16 was extracted into a
  shared module rather than copied. Two copies of a security check that can
  silently stop matching in one of them is red team F8 with a worse outcome.

### The generalizable lesson

An error message names a *symptom in the vocabulary of the layer that threw
it*, not the cause. "Insufficient Funds" was thrown by a fee balancer that
genuinely could not balance fees — accurate, and actively misleading about
what to do next. When a message points somewhere and the obvious fix does not
work, stop escalating the obvious fix and go read the code that produced the
message.

This is the same discipline the red team rounds run on VELO's own claims
(`docs/RED_TEAM_ROUND_1.md`–`_4.md`): do not trust the description of a thing,
read the thing.

### Status — CONFIRMED (2026-08-07)

Confirmed by a real run against `preview`, on a funded wallet:

```
Unshielded balance available: 5000000000     <- 5 NIGHT present
Wallet balance: 0                            <- shielded balance 0
Found 1 unregistered Night UTXOs. Registering for dust...
Dust registration submitted with tx id: 00d24ca6491c716a8ba6be74e378cccd...
Dust wallet sync progress: balance=0  ->  balance=1127246784999999999
Dust registration complete!
```

The diagnosis held exactly: NIGHT present, unregistered, zero DUST. One
registration transaction, and dust went from 0 to non-zero.

It also settled an open question from the write-up above. The wallet was
restored from a **1AM** recovery phrase via `MIDNIGHT_WALLET_MNEMONIC`, and the
dependency's own comment only claims Lace compatibility — so it was flagged as
unverified whether 1AM derives the same address. It does: the derived wallet
was the funded one. **1AM is BIP39-compatible with this derivation path**, at
least for this wallet on this network.

---

## L2 — A green test in the wrong runtime is not evidence

**Date:** 2026-08-07 · **Cost:** a security mitigation documented as working
while it did nothing at all.

### What we hit

Red team F16 found that the deploy dependency prints the wallet seed to stdout
in plaintext, unconditionally. Since the bug is in a third-party package, the
mitigation was a wrapper: patch `process.stdout.write` for the duration of the
deploy call and redact anything matching `Wallet seed: ...`.

It was verified with a standalone script exercising the real wrapper against
genuine stream writes. Everything passed. F16 was recorded as **MITIGATED** in
`docs/RED_TEAM_ROUND_4.md`, and the README told operators the line was redacted
before reaching their terminal.

On the first real deploy, the seed printed in full.

### What it actually was

The verification ran under **Node**. The deploy scripts run under **Bun** — by
design, documented at the top of `deploy-contract.ts`, because the dependency
ships raw `.ts` exports that `tsc`/`node` cannot resolve.

Node routes `console.log`/`console.info` through `process.stdout.write`, so
patching the stream catches console output. Bun implements `console` natively
and writes to the file descriptor directly, bypassing the JS-level stream
method. Same code, same test, opposite result — decided entirely by which
runtime executed it.

Notably, the *other half* of the same mitigation did work: VELO's own log line
uses `safeNetworkConfigForLogging(...)`, which removes the field before it is
ever passed to `console`, so no interception is required. The half that
depended on runtime plumbing failed; the half that changed the data did not.

### What changed

`withSeedRedaction` now patches **both** the `console.*` methods and the raw
stream writers, restoring all of them in `finally`. Patching the console object
works because the dependency does `const log = console` — the same object whose
methods get replaced. The verification script now exercises `console.info`
(the exact call the dependency makes) and a direct `process.stdout.write`, and
its header says to run it under Bun and treat that as the run that counts.

`RED_TEAM_ROUND_4.md`'s F16 entry was rewritten: the status is no longer
"MITIGATED" but "failed on first real run, rewritten, **not yet verified under
Bun**". The finding's epistemic level went *up* — from CODE FACT to CONFIRMED
BY INDUCTION — because the live run proved the seed really does print.

### The generalizable lesson

This project's red team rounds are built on one rule: **do not trust the
description of a thing, read the thing.** L2 is that rule turned on our own
testing. A passing check answers "does this work *where I ran it*", and that is
only evidence if where you ran it is where the code runs.

The failure mode is specifically dangerous because it is *quiet and
confidence-building*: 10/10 green, a doc updated to say MITIGATED, an operator
told the seed is protected. Nothing failed. The claim was simply false, and it
took someone running the real thing and reading the output to find out — which
is exactly how F5 (a demo corpus that had never been run through its own
engine) was found, one round earlier.

Related: the same discipline in `.claude/skills/red-teaming-zk-attestation-systems/SKILL.md`
already said *"a mitigation is not a fix"* about third-party root causes. It
should also have said: **verify a mitigation in the runtime it ships in.**

### The second twist: the test had the same bug, and hid it with a green check

Running the rewritten wrapper under Bun produced this:

```
Wallet seed: 0000000000000000000000000000000000000000000000000000000000000042
Wallet seed: 0000000000000000000000000000000000000000000000000000000000000042
Wallet seed: 0000000000000000000000000000000000000000000000000000000000000042
PASS — inside wrapper: raw seed never reaches the stream
FAIL — inside wrapper: the redaction marker is what got written
```

Read those five lines together. The seed printed **three times, in full**, and
directly underneath, the assertion that the seed never reaches the stream
**passed**.

It passed because the script captured output by replacing
`process.stdout.write` and inspecting what that received — the exact mechanism
Bun bypasses. The capture array stayed empty, and `!"".includes(seed)` is
`true`. The test had the same blind spot as the code it was testing, and the
blind spot converted into a green check.

**A check that observes nothing passes everything.** The *failing* assertions
in that run were the honest ones; the passing one was the dangerous one, and it
is the one that would have been quoted as evidence.

### What actually fixed it

Two separate things, and only one of them was the wrapper:

1. **The wrapper** now patches `console.*` as well as the stream writers. That
   was necessary but, on its own, unprovable.
2. **The verification stopped intercepting anything.** It now spawns a child
   process, lets it write to a real pipe, and greps the bytes that actually
   came out. That is runtime-agnostic *by construction* — it tests observable
   output instead of a mechanism assumed to carry that output. It also asserts
   the child produced output at all, so an empty capture can never again read
   as success.

### Status — VERIFIED in both runtimes (2026-08-07)

```
bun  run scripts/verify-f16-seed-redaction.mjs    -> 10/10  [runtime: bun]
node --experimental-strip-types  (same script)    -> 10/10  [runtime: node]
```

Covering `console.info` (the dependency's exact call), `console.log`, a direct
`process.stdout.write`, that unrelated output survives, and that redaction
stops once the wrapper is removed.

Unchanged by any of this: it is a mitigation around a third-party default, not
a fix of the upstream defect, and the deploy wallet should still be disposable.

---

---

## L3 — `Custom error: 170` is not about your contract

**Date:** 2026-08-07 · **Cost:** one failed deploy, and nearly a wrong fix.

### What we hit

With DUST finally registered (L1), the deploy got all the way to submission and
the node rejected it:

```
1010: Invalid Transaction: Custom error: 170
Deployment failed: Transaction submission error
```

### What we assumed, and why it was reasonable but wrong

The obvious read: something about the contract or the ledger version. A forum
thread on this exact error opens with a report that ledger-v8 `8.0.3` fails
where `8.1.0` works — which points hard at a version bump as the fix.

Chasing that would have meant tearing down and re-pulling a working proof-server
container. It would not have helped.

### What it actually was

Two facts, in order.

**First, what 170 means.** The Midnight team's answer on that thread: error 170
is **`InvalidDustSpendProof`** — "the node rejected the DUST fee proof on the
deploy tx, not the contract deploy proof." The contract was never the problem.
The *payment* for it was.

**Second, which of the causes applied.** The same answer lists cross-line
version mismatch, indexer lag, and stale DUST state. Checked against the
[compatibility matrix](https://docs.midnight.network/relnotes/support-matrix),
every component already matched what Preview requires — compiler `0.31.1`,
runtime `0.16.0`, midnight-js `4.1.1`, compact-js `2.5.1`, proof server
`8.1.0`. The proof server was running `:latest`, which looked suspicious, but
the Docker Hub digests for `:latest` and `:8.1.0` are byte-identical
(`sha256:801bbc03…`). Nothing was misaligned.

That left staleness — and the logs had already recorded it. In the failing run
the dust sync went `true → false → false → true` in its last 30 seconds; the
transaction was built while dust state was still settling, so the spend proof
referenced a merkle root being superseded. The successful run, three minutes
later, had `dust=true` stable from 41 s onward.

**Nothing was changed between the two runs.** Same code, same versions, same
container, same wallet. Only the freshness of the dust state differed.

### A near-miss worth recording

The instinct was to `docker rm -f` the proof-server and re-pull. Two things
stopped it: the digest comparison showing `:latest` *was* `8.1.0`, and noticing
that the container's alarming `created=1970-01-01T00:00:01Z` is a
reproducible-build epoch stamp — standard for Nix-built images — not evidence
of an ancient pull. Both checks took under a minute. Deleting a healthy
container would have cost far more and fixed nothing.

### The generalizable lesson

L1's lesson was that an error message names a symptom in the vocabulary of the
layer that threw it. L3 is the sharper version: **the first published
explanation of an error is not necessarily the one that applies to you.** The
forum thread's headline — a version bump fixed it — was true for its author and
false for us. What made the difference was reading far enough to find what the
error *is* (`InvalidDustSpendProof`), then testing our own stack against the
matrix instead of adopting someone else's remedy.

Also: the evidence was already in the logs. `dust=true → false → true` was
printed in the failing run before anyone knew it mattered. Diagnosis was
re-reading output we already had, with a question sharp enough to make it
meaningful.

### Status — RESOLVED (2026-08-07)

Contract deployed to Midnight `preview`:

```
Contract address: 46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d
VELO contract deployment successful.
```

Standing advice, since the cause was timing: **register dust, then deploy
promptly.** Do not leave a wallet warm between the two steps.


## Español

### L1 — "Insufficient Funds" con la wallet fondeada: NIGHT no es DUST

**Qué pasó.** El deploy de `contracts/velo.compact` a `preview` falló con
`Insufficient Funds: could not balance dust`.

**Qué asumimos.** Que faltaban fondos y que la solución era pedir más tokens
al faucet. El mensaje dice "Insufficient Funds" y esa lectura es incorrecta.

**Qué era en realidad.** En Midnight las fees se pagan en **DUST**, y el DUST
no es un token que el faucet mande: lo **genera** el **NIGHT** que fue
explícitamente **registrado para generación de dust**. Son dos cosas
distintas y el error las junta en una frase que suena conocida.

Una wallet puede tener NIGHT de sobra y cero DUST gastable. Fondearla más no
cambia nada, porque lo que falta no es plata: es una **transacción de registro
aparte**, on-chain, que marca los UTXOs de NIGHT como generadores de dust.

La dependencia (`@effectstream/midnight-contracts`) tiene la función, y su
propio comentario lo dice: `registerNightForDust` — *"Register unshielded
Night UTXOs for dust generation. **This is required before the wallet can pay
transaction fees.**"*

**La trampa:** `deployMidnightContract` nunca la llama. Su armado de wallet
espera solo el balance *shielded* e ignora el de dust por completo, así que
en una wallet fondeada pero sin registrar reporta éxito y le entrega al deploy
una wallet que no puede pagar fees.

**Segunda causa, mismo error.** Si la wallet queda inactiva ~1h, los merkle
roots que necesitan sus UTXOs de DUST se podan del `root_history` del nodo: el
balance se lee bien pero nada es gastable. Eso no se arregla registrando de
nuevo, se arregla con frescura — resincronizar y mandar rápido. Respuesta del
propio equipo de Midnight, [foro hilo 1164](https://forum.midnight.network/t/preprod-custom-error-173-wallet-insufficientfunds-could-not-balance-dust-despite-large-dust-balance-now-on-shared-bridge-claimer/1164).

**Cómo lo encontramos.** No adivinando mejor. Leyendo el código de la versión
exacta de la dependencia — bajando el tarball publicado real de npm y
siguiendo el camino desde `deployMidnightContract` hasta donde se balancean
las fees. La respuesta era un comentario en un archivo que nadie había
abierto. La segunda causa ya estaba contestada en el foro.

**Qué cambiamos.** `deploy/register-dust.ts` (script aparte, se corre una vez
por wallet; el registro queda on-chain así que después el deploy normal
funciona sin tocarlo), la sección del README que explica que esto no es falta
de fondos, y `deploy/redact-seed.ts` para no duplicar la protección de seed de
F16 en dos scripts.

**La lección generalizable.** Un mensaje de error nombra un *síntoma en el
vocabulario de la capa que lo tiró*, no la causa. "Insufficient Funds" lo tiró
un balanceador de fees que efectivamente no pudo balancear fees: exacto, y a
la vez engañoso sobre qué hacer después. Cuando el mensaje apunta a un lado y
el arreglo obvio no funciona, hay que dejar de insistir con el arreglo obvio y
leer el código que produjo el mensaje.

**Estado.** El diagnóstico está verificado contra el código de la dependencia
y la respuesta del equipo de Midnight. El fix todavía **no está confirmado por
un deploy real exitoso** — eso requiere wallet fondeada y Bun, y se confirma
acá cuando pase, no se da por hecho.

### L2 — Un test en verde en el runtime equivocado no es evidencia

**Qué pasó.** F16 (el red team) encontró que la dependencia de deploy imprime
el seed de la wallet en texto plano. Como el bug es de un paquete de terceros,
la mitigación fue un wrapper que parchea `process.stdout.write` y redacta las
líneas `Wallet seed: ...`. Se verificó con un script que ejercitaba el wrapper
real contra escrituras reales al stream. Pasó todo. Se registró como
**MITIGATED** y el README le decía al operador que la línea se redactaba.

En el primer deploy real, el seed se imprimió entero.

**Qué era en realidad.** La verificación corrió bajo **Node**. Los scripts de
deploy corren bajo **Bun** — a propósito, documentado arriba de
`deploy-contract.ts`. Node enruta `console.log`/`console.info` por
`process.stdout.write`; Bun implementa `console` nativamente y escribe directo
al file descriptor, salteándose esa capa. Mismo código, mismo test, resultado
opuesto: lo decide el runtime.

Dato: la *otra mitad* de la misma mitigación sí funcionó. La línea propia de
VELO usa `safeNetworkConfigForLogging(...)`, que saca el campo **antes** de
pasarlo a `console`, así que no necesita interceptar nada. La mitad que
dependía de plomería del runtime falló; la que cambiaba el dato, no.

**Qué cambiamos.** `withSeedRedaction` ahora parchea **los dos**: los métodos
`console.*` y los writers del stream. El script de verificación ejercita
`console.info` (la llamada exacta de la dependencia) y dice en su encabezado
que hay que correrlo bajo Bun. La entrada F16 dejó de decir "MITIGATED" y pasó
a "falló en el primer run real, reescrita, **sin verificar bajo Bun todavía**".

**La lección generalizable.** Las rondas de red team de este proyecto se basan
en una regla: **no confíes en la descripción de algo, leé la cosa.** L2 es esa
regla aplicada a nuestro propio testing. Un check que pasa responde "¿esto
funciona *donde lo corrí*?", y eso es evidencia solo si donde lo corriste es
donde el código corre.

El modo de falla es peligroso justamente porque es **silencioso y da
confianza**: 10/10 en verde, un doc actualizado que dice MITIGATED, un
operador al que le dijeron que su seed está protegido. Nada falló. La
afirmación simplemente era falsa, y se descubrió porque alguien corrió lo real
y leyó la salida — igual que F5 (un corpus de demo que nunca había pasado por
su propio motor), una ronda antes.

**El segundo giro: el test tenía el mismo bug, y lo tapó con un check en
verde.** Corriendo el wrapper reescrito bajo Bun salió esto:

```
Wallet seed: 0000...042
Wallet seed: 0000...042
Wallet seed: 0000...042
PASS — inside wrapper: raw seed never reaches the stream
```

El seed se imprimió **tres veces, entero**, y justo debajo la aserción de que
el seed nunca llega al stream **pasó**. Pasó porque el script capturaba
reemplazando `process.stdout.write` — el mecanismo exacto que Bun se saltea.
El array de captura quedó vacío, y `!"".includes(seed)` es `true`. El test
tenía el mismo punto ciego que el código que testeaba, y ese punto ciego se
convirtió en un check verde.

**Un check que no observa nada aprueba todo.** Las aserciones que *fallaron*
en ese run eran las honestas; la que pasó era la peligrosa, y es la que se
habría citado como evidencia.

**Qué lo arregló de verdad.** Dos cosas, y solo una era el wrapper: (1) el
wrapper ahora parchea `console.*` además de los streams — necesario pero, solo,
imposible de probar; (2) la verificación **dejó de interceptar**: lanza un
subproceso, lo deja escribir a un pipe real, y busca en los bytes que
realmente salieron. Eso es agnóstico del runtime por construcción — testea la
salida observable en vez de un mecanismo que se asume que la transporta. Y
además verifica que el hijo produjo salida, así una captura vacía nunca más
puede leerse como éxito.

**Estado — VERIFICADO en ambos runtimes (2026-08-07):** 10/10 bajo Bun y 10/10
bajo Node. Lo que no cambia: sigue siendo una mitigación alrededor de un
default de terceros, no un arreglo del defecto upstream, y la wallet de deploy
debería seguir siendo descartable.

---

## L4 — The first real attestation, and a guard that proved itself

**Date:** 2026-08-07 · **Outcome:** the loop closed.

### What happened

`bun run deploy/attest-case.ts VELO-DEMO-001` generated a ZK proof and
submitted a real `attest()` call to the contract on Midnight `preview`. Read
back independently from the ledger:

```
attestationCount : 1
   632dbf0159cb6df7360507b1c01cc2a62d26035cb20e56b57e7bae0ce8fb3b2b  ->  MALICE
```

Sealed locally, attested on-chain, read back by anyone. No simulation in any
of the three steps.

### The part worth recording: a re-run looked like a failure and was not

Running it a second time produced a stack trace ending in:

```
CompactError: failed assert: this attestation already exists
      at _attest_0 (contracts/managed/velo/contract/index.js:320)
```

That is **VELO's own circuit**, refusing to record the same commitment twice —
the fix for red team finding G2, written days earlier on the reasoning that a
public `attestationCount` inflated by replays is a number a judge can trivially
discredit. Until this moment it had never executed outside a compiler.

It fired because the salt behaved exactly as designed: stored per case in
private state, reused on the second run, so the same sealed analysis produced
the same commitment — and the contract rejected the duplicate.

Three things were confirmed at once by an error message:

1. The G2 replay guard works against the real network, not just in review.
2. Salt persistence works: same case, same salt, same commitment. Had the salt
   been regenerated, the second run would have produced a *different*
   commitment and silently recorded a second attestation of one analysis —
   which is precisely the defect G2 exists to prevent.
3. The first attestation genuinely landed. The guard could not have fired
   otherwise.

### The lesson

**A failed command is not always a failed system.** The instinct on seeing a
stack trace is to fix something; here the correct response was to read what the
assert actually said, recognise it as this project's own invariant, and check
the ledger — which showed the write had succeeded. Debugging the "failure"
would have meant weakening a guard that was doing its job.

This is L3's lesson pointed inward. L3 was about an error message from someone
else's layer naming a symptom in its own vocabulary. Here the message was ours,
said exactly what it meant, and still read as a failure because it arrived
through a stack trace. The script now reports it as the non-event it is.

### Status

`deploy/attest-case.ts` distinguishes "already attested" from a real failure
and exits cleanly. Confirmed on-chain and readable via
`node scripts/verify-chain-read.mjs`, `GET /api/chain`, and the MCP tools
`chain_status` / `lookup_commitment`.

Still not built: the browser-signed path. Attesting goes through the CLI with a
seed-derived wallet on the analyst's own machine, not the analyst's 1AM wallet
signing from the UI.

---

## L5 — Testing the sentence the whole project rests on

**Date:** 2026-08-08 · **Outcome:** the central claim moved from *read* to
*verified*.

### What we hit

Nothing failed. That is the point of this entry.

Auditing our own status document, one line stood out — `TECHNICAL_STATUS` §2.2,
the sentence the project's whole argument stands on:

> An attempt to attest `MALICE` from a single source does not produce a
> rejected transaction. **It fails to produce a proof at all.**

That is the difference between "we have a rule" and "we have a guarantee". And
it was a **CODE FACT**: read in `contracts/velo.compact`, never executed. Every
lesser claim in the project had been run. The most important one had not.

### Why that asymmetry is the dangerous shape

It is the inverse of how attention usually gets allocated. The claims that feel
risky get tested; the claim that feels obviously true — *we wrote the assert, we
can see it right there* — gets assumed. But an assert that never executes is
indistinguishable, from the outside, from an assert that does not work. And this
was the one a jury would push on hardest.

Reading the source proves the assert is *present*. It does not prove it is
*reachable*, that the witness path feeds it the values we think, or that the
runtime enforces it rather than optimizing it away.

### What we did

`deploy/attest-forced-malice.ts` attacks the gate directly against the deployed
contract, with every application-level check deliberately bypassed:

- the **engine** cannot produce this state — `scorer.ts` degrades `MALICE` to
  `SUSPICION` below two sources, so no sealed bundle can carry it;
- **`attest-case.ts`** refuses locally before submitting;
- so the probe overrides `corroborationCountWitness` to return `1` while
  passing `MALICE` as the public argument.

Nothing was left between the call and the circuit.

Two design choices worth naming. **Only the count is forged** — a bundle that
also lied about its fingerprint would fail for a different reason and prove
nothing about corroboration. And **the probe can fail**: it exits non-zero if
the chain *accepts* the forced attestation and says §2.2 is false as written. An
experiment that can only confirm is not an experiment.

### Result

Prediction stated before running. Refused by the circuit's own assert:

```
failed assert: MALICE requires at least 2 independent corroborating sources — the Daubert gate
```

§2.2 is now **CONFIRMED BY INDUCTION**, against the live network, with the
engine and every application guard out of the loop.

### The generalizable lesson

**Test the claim you would least like to be wrong about, precisely because you
would least like to be wrong about it.** Confidence is a reason to run the
experiment, not a substitute for it.

L2 was the same shape from the other direction: there, a green check in the
wrong runtime created false confidence. Here, correct code created false
confidence by never being exercised. Both come back to the rule these red team
rounds are built on — *do not trust the description of a thing, read the thing*
— with one addition earned tonight: **reading it is not running it.**

### Still not exercised

`lookupVerdict`, the contract's second circuit. Prover and verifier keys were
generated for it at compile time and it has never been called. Its `assert`
("no attestation exists for this commitment") is in exactly the state §2.2 was
in this morning.

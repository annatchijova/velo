# Learnings

Things this team got wrong first and understood second, recorded while the
reasoning was still fresh. Kept because a hackathon project that claims it
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

### Status

The diagnosis is verified against dependency source and the Midnight team's
own answer. The fix — `deploy/register-dust.ts` — has passing checks for its
seed-redaction path (`node --experimental-strip-types
scripts/verify-f16-seed-redaction.mjs`, 10/10) but, at the time of writing,
**has not yet been confirmed by a successful real deploy**. That requires a
funded wallet and a machine with Bun, and it will be confirmed or corrected
here rather than quietly assumed.

---

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

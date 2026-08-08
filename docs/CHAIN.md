# The on-chain layer

How VELO talks to Midnight: what runs, how to run it, and what each step
does and does not establish. Written after doing it for real against
`preview` — every command here was executed, and the failures documented
are failures that actually happened.

**Deployed contract (preview):**
`46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d`

---

## Reading and writing are deliberately separate

This is the single most important design decision in this layer, so it is
first.

| | Read | Write (attest) |
|---|---|---|
| Needs a wallet | no | yes |
| Needs DUST / fees | no | yes |
| Needs proving keys | no | yes |
| Needs a proof server | no | yes |
| Needs Bun | no | yes |
| Where | `src/chain/read.ts` | `deploy/attest-case.ts` |

Reading is a GraphQL query plus a deserialization. Writing is a ZK proof.
Keeping them apart buys two things: the UI keeps showing real on-chain
state on a machine that cannot produce a proof at all, and **a failure to
attest never renders as a failure to read**. An unreachable indexer and
"zero attestations" are different answers, and the code refuses to let one
look like the other — `ChainReadError` surfaces as `503`, never as an
empty list.

---

## The full loop

Three steps. All three run against Midnight `preview`, none is simulated.

### 1. Seal a case locally

```bash
npm run build
node scripts/seal-demo-case.mjs          # or MCP seal_case, or POST /api/seal
```

The evidence never leaves the machine. What comes out is a sealed bundle
in `local-cases/`: an analysis fingerprint, a hash-chained custody log, a
verdict and a corroboration count.

### 2. Attest it on-chain

Requires the three environment variables (see **Deploying** in the
[README](../README.md) for what each one is — they are three different
kinds of thing and conflating them costs time):

```bash
export MIDNIGHT_NETWORK_ID=preview
export MIDNIGHT_STORAGE_PASSWORD=<a-real-secret-you-pick>
export MIDNIGHT_WALLET_MNEMONIC="word1 word2 ... word24"

bun run deploy/attest-case.ts VELO-DEMO-001
```

This proves and submits a real `attest()` call. It takes a few minutes:
most of it is wallet sync, then ZK proof generation on the local proof
server.

**First time on a given wallet**, register NIGHT for DUST generation
first, and attest promptly afterwards:

```bash
bun run deploy/register-dust.ts
```

### 3. Read it back, independently

```bash
node scripts/verify-chain-read.mjs
```

```
attestationCount : 1
   632dbf0159cb6df7360507b1c01cc2a62d26035cb20e56b57e7bae0ce8fb3b2b  ->  MALICE
```

Also available as `GET /api/chain` in the frontend, and as the MCP tools
`chain_status` and `lookup_commitment`.

---

## What each step establishes, and what it does not

The ledger records that **someone attested this commitment with this
verdict**. It does not record that the analysis behind it is correct.

More precisely, and this boundary is load-bearing:

- **Proven by the circuit:** the published verdict is bound to a specific
  analysis fingerprint, custody tip, corroboration count and salt — all
  hashed into one commitment. The verdict cannot be swapped afterwards,
  because changing it changes the commitment. `MALICE` cannot be attested
  with `corroborationCount < 2`; that attempt does not fail validation, it
  fails to produce a proof.
- **Not proven by the circuit:** that those witness values describe a real
  engine run on real evidence. That binding exists only in the caller
  (`src/witness/witnesses.ts`), which is exactly the part a ZK proof does
  not cover. See red team [G1 and G3](./RED_TEAM_ROUND_2.md).

A commitment on this ledger is evidence about *process*, not about *truth*.

---

## Three errors you will hit, with their real causes

Each of these cost real time. All three are written up in full in
[LEARNINGS.md](./LEARNINGS.md).

### `Insufficient Funds: could not balance dust`

**Not a funding problem.** Fees are paid in DUST, which is *generated* by
NIGHT that has been explicitly registered for dust generation — a separate
on-chain transaction that `deployMidnightContract` never performs. A wallet
can hold plenty of NIGHT and zero spendable DUST. Fix: `register-dust.ts`,
once per wallet. See L1.

### `1010: Invalid Transaction: Custom error: 170`

This is `InvalidDustSpendProof` — the node rejecting the **DUST fee proof**,
not your contract. Two causes worth separating:

- *Misaligned fee stack.* Check every component against the
  [compatibility matrix](https://docs.midnight.network/relnotes/support-matrix).
  `bunfig.toml` in this repo disables Bun's auto-install for exactly this
  reason: without it Bun resolved `compact-js` 2.5.3 from its own global
  cache while npm had installed 2.5.1, which is what the matrix pins.
- *Stale DUST state*, which is what actually bit us. If the dust sync is
  still settling when the transaction is built, the spend proof references
  a merkle root being superseded. The tell is `dust=` flipping
  `true → false → true` near the end of the sync log. Fix: re-run and
  submit while state is fresh. See L3.

### `failed assert: this attestation already exists`

**This one is not a failure.** It is VELO's own circuit — the red team
[G2](./RED_TEAM_ROUND_2.md) replay guard — refusing to record the same
commitment twice. The salt is stored per case and reused, so the same
sealed analysis always produces the same commitment, and
`attestationCount` cannot be inflated by re-running. `attest-case.ts`
detects it and exits cleanly. See L4.

---

## Where the state lives

| Thing | Where | Notes |
|---|---|---|
| Sealed bundles | `local-cases/*.json` | gitignored; never leaves the machine |
| Per-case salt | Midnight private-state store (LevelDB) | The one value not recoverable from the bundle. Lose it and the commitment can never be reproduced by its own author |
| Deployed address | `deploy/managed-shim/velo-contract.<network>.json` | Written by the deploy; read by everything else, so a redeploy needs no code change |
| Proving keys + bindings | `contracts/managed/velo/` | Committed (5.2 MB) so the contract is callable without an AVX2 machine to rebuild them |

The salt deserves emphasis: it is seeded into private state *before*
proving, not minted lazily during it. If different witness calls in one
execution saw different salts, the commitment would be computed over values
that never coexisted — a proof that verifies against nothing reproducible.

---

## What is not built

The **browser-signed path**. Attesting today goes through the CLI, signing
with a seed-derived wallet on the analyst's own machine. Architecturally
that is the CLI equivalent of the analyst's own wallet, but it is not the
1AM-connected UI: `POST /api/attest` still computes a commitment locally
and returns `local_pending_contract`.

Closing that gap needs the full midnight-js stack in the browser, the ZK
assets served from `public/`, and the WASM/top-level-await webpack
configuration — the known-painful part of Midnight frontend work, which is
why the CLI path was built first as the thing that provably works.

---

## Español

### Leer y escribir están separados a propósito

Leer no necesita wallet, ni DUST, ni claves de prueba, ni proof server, ni
Bun: es una consulta GraphQL más una deserialización (`src/chain/read.ts`).
Escribir necesita todo eso (`deploy/attest-case.ts`).

Esa separación compra dos cosas: la UI sigue mostrando estado real de la
cadena en una máquina que no puede generar una prueba, y **una falla al
atestar nunca se ve como una falla al leer**. Un indexer inalcanzable y
"cero atestaciones" son respuestas distintas, y el código se niega a que
una parezca la otra — `ChainReadError` sale como `503`, nunca como lista
vacía.

### El ciclo completo

```bash
npm run build && node scripts/seal-demo-case.mjs   # 1. sellar local
bun run deploy/attest-case.ts VELO-DEMO-001        # 2. atestar on-chain
node scripts/verify-chain-read.mjs                 # 3. leer desde el ledger
```

La primera vez con una wallet dada, registrar DUST antes (`register-dust.ts`)
y atestar enseguida después.

### Qué prueba y qué no

El ledger registra que **alguien atestó este commitment con este veredicto**.
No registra que el análisis detrás sea correcto.

- **Lo prueba el circuito:** el veredicto publicado está atado a un
  fingerprint, un custody tip, un conteo de corroboración y un salt
  específicos — todos hasheados en un commitment. El veredicto no se puede
  cambiar después, porque cambiarlo cambia el commitment. `MALICE` no se
  puede atestar con `corroborationCount < 2`: ese intento no falla la
  validación, falla en producir una prueba.
- **No lo prueba el circuito:** que esos witnesses describan una corrida
  real del motor sobre evidencia real. Ese binding vive solo en el llamador,
  que es justo lo que una prueba ZK no cubre (ver G1 y G3 en la Ronda 2).

Un commitment en este ledger es evidencia sobre el *proceso*, no sobre la
*verdad*.

### Los tres errores, con sus causas reales

- **`could not balance dust`** — no es falta de fondos. Las fees se pagan en
  DUST, que lo *genera* el NIGHT registrado para eso, en una transacción
  aparte que el deploy nunca hace. Fix: `register-dust.ts`, una vez por
  wallet. (L1)
- **`Custom error: 170`** — es `InvalidDustSpendProof`: el nodo rechazó la
  prueba de fee de DUST, no tu contrato. O el stack de versiones está
  desalineado (por eso `bunfig.toml` desactiva el auto-install de Bun), o
  el estado de DUST está viejo — que fue nuestro caso. La señal es `dust=`
  oscilando `true → false → true` al final del sync. Fix: re-correr y mandar
  con el estado fresco. (L3)
- **`this attestation already exists`** — **no es una falla.** Es el guard
  de replay del propio circuito (G2) negándose a registrar dos veces el
  mismo commitment. El script lo detecta y sale limpio. (L4)

### Lo que no está construido

El camino **firmado desde el navegador**. Hoy se atesta por CLI, firmando
con una wallet derivada de seed en la máquina del perito. Es el equivalente
CLI de la wallet del perito, pero no es la UI conectada a 1AM:
`POST /api/attest` sigue calculando un commitment local.

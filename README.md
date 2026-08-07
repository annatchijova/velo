# VELO

> **The verdict is visible. The victim is not.**
> *El veredicto se ve, la víctima no.*

Zero-knowledge attestation of forensic verdicts on [Midnight](https://midnight.network).
A forensic expert can prove their verdict is legitimate **without ever
publishing the evidence it came from**.

`Apache-2.0` · `TypeScript + Compact` · Built at Midnight Hack Buenos Aires, 7–8 August 2026

---

## The problem

A forensic expert analysing a case — abuse material, a fraud, a leak — has two
options today, and both are bad:

1. **Publish the raw evidence** so others can check the verdict. The victim is
   exposed to everyone in the process who did not need to see it.
2. **Publish nothing**, and ask the court to take the expert's word for it.

Every digital forensics workflow in production picks one. VELO picks neither.

## How

The expert runs a deterministic engine on their own machine, seals the result,
and publishes **only a commitment and a zero-knowledge proof**. The proof
establishes two things at once: that the published verdict really corresponds
to the sealed analysis, and that the legal admissibility rule was satisfied —
*at least two independent corroborating sources for a `MALICE` verdict*.

That rule is not a policy note or a code review convention. It is a constraint
inside the circuit: **an attestation that violates it cannot be produced at
all.**

```mermaid
flowchart TB
    subgraph local["THE EXPERT'S MACHINE — nothing here ever leaves"]
        direction TB
        EV["Raw evidence<br/><i>disk images, captures, logs</i>"]
        ENG["Deterministic engine<br/><i>5 detectors, exact rational arithmetic</i>"]
        GATE{"Daubert gate<br/><i>2+ independent sources?</i>"}
        SEAL["Sealed bundle<br/><i>analysis fingerprint + custody tip</i>"]
        NOPROOF["No proof exists"]

        EV --> ENG --> GATE
        GATE -->|"yes"| SEAL
        GATE -->|"no"| NOPROOF
    end

    subgraph chain["MIDNIGHT LEDGER — public and immutable, forever"]
        direction TB
        COMMIT["commitment<br/><i>persistentHash(fingerprint, custodyTip, salt)</i>"]
        VERDICT["declared verdict"]
    end

    SEAL -->|"ZK proof<br/>evidence stays behind"| COMMIT
    SEAL --> VERDICT

    ANYONE["Anyone: judge, opposing expert, the public"]
    COMMIT --> ANYONE
    VERDICT --> ANYONE

    style local fill:#f5f0e8,stroke:#8B3A2F,stroke-width:2px
    style chain fill:#e8eef5,stroke:#3A3F4B,stroke-width:2px
    style NOPROOF stroke:#8B3A2F,stroke-width:2px
    style EV stroke-dasharray: 5 5
```

The evidence never crosses the boundary. What crosses is a hash and a proof
about it.

## The part that makes it real: the system refuses

Anyone can build something that says yes. The interesting behaviour is what
happens when the rules are not met — and both refusals are demonstrated live in
[`src/simulate.ts`](./src/simulate.ts) (`npm run simulate`):

**Refusal 1 — not enough independent sources.** Evidence that would score high
enough for `MALICE`, but all traced back to a single acquisition:

```
[ATTEMPTED VERDICT] SUSPICION
[WHY] Score 0.3000 above the noise ceiling but below the MALICE threshold.

Correctly refused. The Daubert corroboration gate held — this is not a
promise, it's a constraint.
```

**Refusal 2 — no chain of custody.** Byte-for-byte the *same* artifacts that
produced `MALICE`, with only the acquisition record removed:

```
[VERDICT WITH CUSTODY]     MALICE
[VERDICT WITHOUT CUSTODY]  ABSTAIN

Identical evidence, opposite outcome. Admissibility is a property of the
process, not of how incriminating the evidence looks.
```

A finding nobody can trace back to a lawful acquisition is not a weaker
finding. It is an inadmissible one.

## Try it

```bash
npm install
npm test          # 34 tests, including adversarial ones
npm run simulate  # full end-to-end story, both refusals
```

Verify a sealed bundle with the standalone verifier — one file, no
dependencies, nothing from this repo required:

```bash
node dist/src/seal/verify.js path/to/bundle.json
```

It prints `internally consistent: YES/NO` — deliberately *not* the word
"valid", because a reader takes "valid" to mean "authentic", and internal
consistency is a strictly weaker claim. See [F4 in the red team
report](./docs/RED_TEAM_ROUND_1.md).

### As an MCP server

The same engine is exposed over MCP, so an agent can drive the flow
conversationally — a wallet, but the asset is a sealed case instead of money.

```bash
npm run build
claude mcp add velo -- node "$(pwd)/dist/src/mcp/server.js"
```

| Wallet concept | VELO tool |
|---|---|
| Balance view | `list_my_cases` |
| Asset detail | `get_case` |
| Mint | `seal_case` |
| Block explorer | `verify_commitment` |
| Send transaction | `attest_case` *(pending the contract)* |

## Status — what is real and what is not

This project is 48 hours old. The table is honest on purpose; overclaiming is
the failure mode this whole system exists to prevent.

| Layer | State |
|---|---|
| Deterministic engine + Daubert gate | **Working**, 34 tests |
| Local sealing, custody chain, canonical hashing | **Working** |
| Standalone offline verifier | **Working** |
| MCP server (local tools) | **Working**, tested over real JSON-RPC |
| Red team round 1 | **12 of 13 findings fixed**, [full report](./docs/RED_TEAM_ROUND_1.md) |
| Compact contract | **Written, NOT compiled** — no toolchain on the build machine. Three open questions flagged in the source |
| On-chain attestation, selective disclosure, ZK expert credential | **Not built** |

The contract not being compiled is the honest bottom line: everything on the
expert's side of the boundary runs and is tested; the ledger side is designed
and written but unproven against a compiler.

## Repository

```
src/engine/      detectors, scoring, exact rational arithmetic (no floats on the decision path)
src/seal/        canonicalization, hash-chained custody, bundle sealing, standalone verifier
src/witness/     the circuit's private inputs, TypeScript side
src/mcp/         MCP server — the wallet interface
contracts/       velo.compact — the ZK gate
cases/           13 synthetic cases, zero PII
peritos-syntetic/ 6 synthetic expert-witness profiles
docs/            architecture, glossary, cases, FAQ, roadmap, red team report
```

Documentation is bilingual (EN/ES): [`ARCHITECTURE`](./docs/ARCHITECTURE.md) ·
[`GLOSSARY`](./docs/GLOSSARY.md) · [`CASES`](./docs/CASES.md) ·
[`FAQ`](./docs/FAQ.md) · [`ROADMAP`](./docs/ROADMAP.md) ·
[`RED TEAM`](./docs/RED_TEAM_ROUND_1.md)

[`INSPIRATIONS.md`](./INSPIRATIONS.md) records the prior work these concepts
were adapted from, and why none of it is copy-pasted: those projects are
Python, this one is TypeScript and Compact.

---

## Español

Hoy un perito forense tiene dos opciones, y las dos son malas: **publicar la
evidencia cruda** para que otros puedan verificar el veredicto —exponiendo a la
víctima ante todos los que no necesitaban verla— o **no publicar nada** y pedirle
al tribunal que confíe en su palabra.

VELO no elige ninguna. El perito corre un motor determinista en su propia
máquina, sella el resultado, y publica **solo un commitment y una prueba de
conocimiento cero**. La prueba establece dos cosas a la vez: que el veredicto
publicado corresponde al análisis sellado, y que se cumplió la regla legal de
admisibilidad — *al menos dos fuentes de corroboración independientes para un
veredicto `MALICE`*.

Esa regla no es una nota de política ni una convención de code review. Es una
restricción dentro del circuito: **una atestación que la viole no puede
producirse.**

Lo interesante no es que el sistema diga que sí, sino cómo se niega. `npm run
simulate` demuestra las dos negativas en vivo: evidencia que alcanzaría para
`MALICE` pero proviene de una sola adquisición degrada a `SUSPICION`; y la
*misma* evidencia byte a byte, sin cadena de custodia, da `ABSTAIN`. Evidencia
idéntica, resultado opuesto: la admisibilidad es una propiedad del proceso, no
de qué tan incriminatoria se ve la evidencia.

**Estado honesto:** todo lo del lado del perito funciona y está testeado (34
tests). El contrato Compact está escrito pero **no compilado** — no hay
toolchain en la máquina donde se construyó, y hay tres preguntas abiertas
marcadas en el código. La atestación on-chain, la divulgación selectiva y la
credencial ZK del perito todavía no están construidas.

---

## Authors

- [annatchijova](https://github.com/annatchijova)
- [olgavasilievaveg-hash](https://github.com/olgavasilievaveg-hash/)
- [Dahgoth](https://github.com/Dahgoth)

Project page: [annatchijova.github.io/vigia/velo.html](https://annatchijova.github.io/vigia/velo.html)

## License

Apache License 2.0 — see [`LICENSE`](./LICENSE).

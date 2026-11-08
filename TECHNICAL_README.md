# VELO Technical README

This is the technical entry point for VELO. The primary READMEs are
[`README.md`](./README.md) and [`README.es.md`](./README.es.md).

## Architecture

Raw evidence stays on the expert's machine. The deterministic engine analyzes
it, the sealing layer produces a canonical bundle and custody chain, and the
public write path publishes a commitment, verdict, and zero-knowledge proof to
Midnight. The narrator receives only a read-only summary after the result is
sealed and cannot change the decision.

The implementation is TypeScript plus Compact and targets Node.js 20 or newer.
The main boundaries are:

- `src/engine/`: deterministic scoring, detectors, evidence, and verdicts.
- `src/seal/`: canonical serialization, SHA-256 sealing, custody, Merkle data,
  and the standalone verifier.
- `src/witness/`: witnesses passed to the Compact circuits.
- `src/mcp/`: MCP server and persistence adapter.
- `src/narrative/`: read-only narrative backends.
- `src/chain/` and `deploy/`: public-ledger reads and CLI write path.
- `frontend/`: Next.js UI and server-side API routes.

## Deterministic and admissibility rules

Counts use integers and ratios use exact rational arithmetic. The sealed path
does not use floating-point values. Canonical values are type-tagged,
recursively ordered, and versioned before hashing.

The verdict scale is `NOISE`, `SUSPICION`, `MALICE`, or `ABSTAIN`. `MALICE`
requires at least two corroborating sources under distinct provenance roots and
an explicit counter-argument. Broken custody produces `ABSTAIN`. The
application calculates provenance; the Compact circuit enforces the minimum
count it receives.

## Verification and APIs

The standalone verifier establishes internal consistency, not the truth of the
underlying forensic conclusion. The current browser API is:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/seal` | Analyze and seal a case. |
| `GET` | `/api/cases` | List public case summaries. |
| `GET` | `/api/cases/:id` | Read one case summary. |
| `POST` | `/api/verify` | Check a bundle and optional tampered copy. |
| `GET` | `/api/chain` | Read the Midnight ledger without a wallet. |
| `GET` | `/api/peritos` | Read the synthetic expert corpus. |
| `GET` | `/api/attest` | `501`; browser signing is not implemented. |

## Threat model and limitations

VELO does not protect evidence from a compromised expert workstation or prove
that an operator's input statement is true. The circuit cannot independently
observe whether witnesses came from a real run over real evidence; provenance
independence is computed off-chain and declared by the analyst.

Ledger metadata and wallet identity can create linkability. Rule versioning,
credential revocation, selective disclosure, and browser-based signing remain
bounded or incomplete. A valid hash proves integrity of bytes and relations,
not the truth of a forensic proposition.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md),
[`docs/TECHNICAL_STATUS.md`](./docs/TECHNICAL_STATUS.md),
[`docs/CHAIN.md`](./docs/CHAIN.md), and the red-team reports for the detailed
protocol, evidence, and operational record.

## Reproduce

```bash
npm install
npm test
npm run simulate
cd frontend && npx vitest run
```

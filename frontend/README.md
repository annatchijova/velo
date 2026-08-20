# VELO frontend

> The verdict is visible. The victim is not.
> El veredicto se ve, la víctima no.

Local-first frontend for **VELO** — zero-knowledge forensic attestation on
[Midnight](https://midnight.network). The deterministic engine and sealing run
server-side via the `velo` package (the main repo, imported as a `file:`
dependency); the Compact contract is integrated behind a single seam in
`src/lib/contract.ts`.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 3.4, Framer Motion, lucide-react
- `velo` (`file:..`, the repo root) — deterministic forensic engine + sealing
- `@midnight-ntwrk/dapp-connector-api` — Lace + 1AM wallet connection (v4)
- **Vitest + React Testing Library** — unit and integration tests
- **Playwright** — end-to-end tests

## Development workflow

All frontend work follows **Test-Driven Development (TDD)**. See the official workflow in [`docs/FRONTEND_TDD.md`](../docs/FRONTEND_TDD.md). In short:

1. Write failing tests aligned with acceptance criteria.
2. Write the minimal implementation to make tests pass.
3. Refactor while keeping tests green.
4. Run the full frontend suite with `npm run test:all`.

No frontend feature, component, or module may be added without its corresponding tests written first.

## Run

```bash
# from the repo root — npm workspaces installs both packages, and the root
# build produces the dist/ this app imports
npm install
npm run build

# then, from this directory
npm run dev        # http://localhost:3000
```

## What works

- **Landing** — pitch + generated hero visual (no external assets)
- **Connect** — Lace (`window.midnight.mnLace`) and 1AM (`window.midnight['1am']`)
  via the DApp Connector v4 API, plus an anonymous-examiner demo mode
- **Case ledger** — 14 synthetic cases, search, verdict filters, grid/table
- **Case detail** — live engine run (detectors, score, corroboration, custody),
  then the examiner workflow: **seal → attest → verify**, including an
  adversarial tamper demo (swap verdict / corrupt fingerprint / truncate chain)
- **Examiners** — synthetic accreditation profiles exercising Layer 6
  (anonymous credential, validity-gap failure) and Layer 7 (blind second opinion)

## The attestation seam

The Compact contract (`contracts/velo.compact` in the main repo) is **deployed
on `preview`** — the on-chain runbook is [`docs/CHAIN.md`](../docs/CHAIN.md).
Attestations are written by the local CLI (`deploy/attest-case.ts`), and the
ledger is read by `GET /api/chain` (no wallet, no keys, no fees). Until the
browser-side wiring lands (MVP Phase 4, see
[`docs/PRD_MVP.md`](../docs/PRD_MVP.md)), `/api/attest` computes the
commitment locally and returns `status: "local_pending_contract"` — honest, no
simulated chain interaction. `src/lib/contract.ts` is the placeholder seam that
phase retires.

## Test

```bash
npm run test          # unit + integration tests (CI mode)
npm run test:watch    # watch mode
npm run test:e2e      # Playwright end-to-end tests
npm run test:all      # unit + integration + e2e
```

See [`docs/FRONTEND_TDD.md`](../docs/FRONTEND_TDD.md) for the mandatory TDD workflow, test-type selection guidance, and accessibility/responsive checklists.

## Env

No secrets required. Optional:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_WALLET_NETWORK` | Default network id for wallet connect (`preprod`, `undeployed`, `preview`, `mainnet`) |

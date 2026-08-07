# VELO frontend — Midnight Hack Buenos Aires 2026

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
- `velo` (`file:../velo`) — deterministic forensic engine + sealing
- `@midnight-ntwrk/dapp-connector-api` — Lace + 1AM wallet connection (v4)

## Run

```bash
# the main repo must be built first (it ships compiled dist to import)
(cd ../velo && npm install && npm run build)

npm install
npm run dev        # http://localhost:3000
```

## What works

- **Landing** — pitch + generated hero visual (no external assets)
- **Connect** — Lace (`window.midnight.mnLace`) and 1AM (`window.midnight['1am']`)
  via the DApp Connector v4 API, plus an anonymous-examiner demo mode
- **Case ledger** — 13 synthetic cases, search, verdict filters, grid/table
- **Case detail** — live engine run (detectors, score, corroboration, custody),
  then the examiner workflow: **seal → attest → verify**, including an
  adversarial tamper demo (swap verdict / corrupt fingerprint / truncate chain)
- **Examiners** — synthetic accreditation profiles exercising Layer 6
  (anonymous credential, validity-gap failure) and Layer 7 (blind second opinion)

## The attestation seam

The Compact contract (`contracts/velo.compact` in the main repo) is compiled
separately. Until it deploys, `/api/attest` computes the commitment locally
(hiding + binding over the sealed fingerprint) and returns
`status: "local_pending_contract"` — honest, no simulated chain interaction.
`src/lib/contract.ts` is the single function to swap when the contract
artifacts exist.

## Env

No secrets required. Optional:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_WALLET_NETWORK` | Default network id for wallet connect (`preprod`, `undeployed`, `preview`, `mainnet`) |

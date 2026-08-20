// Deploys contracts/velo.compact to the network selected in
// network-config.ts (default: preview).
//
// Run with Bun, not `npm run build && node ...`: @effectstream/midnight-contracts
// ships its exports as raw .ts source (bun-native), which plain tsc/node
// cannot resolve. This script is intentionally outside the tsc/node
// build+test pipeline that the rest of VELO uses — see README "Deploying".
//
//   MIDNIGHT_NETWORK_ID=preview bun run deploy/deploy-contract.ts
//
// baseDir points at deploy/managed-shim: @effectstream/midnight-contracts'
// contract-discovery convention expects <contractName>/src/managed/, but
// scripts/compile-contract.sh (this repo's own, existing convention)
// outputs to contracts/managed/velo/ directly. deploy/managed-shim/velo/src/managed
// is a symlink to contracts/managed/velo — a compatibility shim for the
// deploy tool only, so the team's actual compiled-output layout never
// has to change.
//
// Deploy itself never calls the `attest` circuit (no constructor exists
// in velo.compact — the ledger's Map and Counter default to empty per
// the Compact skill's "Default Values" section), so the witnesses given
// here are placeholders satisfying the compiled Contract's constructor
// signature, never actually invoked. The real witnesses — bound to a
// specific sealed bundle via makeWitnessImplementations() in
// src/witness/witnesses.ts — are used later, when attest_case calls the
// deployed contract's `attest` circuit for a real case.
import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
import { Contract } from "../contracts/managed/velo/contract/index.js";
import { midnightNetworkConfig, storagePassword } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

process.env.MIDNIGHT_STORAGE_PASSWORD ??= storagePassword;

const placeholderWitnesses = {
  bundleFingerprint: (ctx: { privateState: unknown }) => [ctx.privateState, new Uint8Array(32)] as const,
  bundleSalt: (ctx: { privateState: unknown }) => [ctx.privateState, new Uint8Array(32)] as const,
  custodyTip: (ctx: { privateState: unknown }) => [ctx.privateState, new Uint8Array(32)] as const,
  corroborationCountWitness: (ctx: { privateState: unknown }) => [ctx.privateState, 0n] as const,
};

const config: DeployConfig = {
  contractName: "velo",
  baseDir: new URL("./managed-shim", import.meta.url).pathname,
  contractFileName: "velo-contract.json",
  contractClass: Contract,
  witnesses: placeholderWitnesses,
  privateStateId: "veloPrivateState",
  initialPrivateState: { salts: {} },
  privateStateStoreName: "velo-private-state",
};

// Red team F16 (docs/RED_TEAM_ROUND_4.md): `midnightNetworkConfig` carries
// `walletSeed` as a plain field, so logging the object printed the seed.
console.log("Deploying VELO contract with network config:", safeNetworkConfigForLogging(midnightNetworkConfig));

withSeedRedaction(() => deployMidnightContract(config, midnightNetworkConfig))
  .then(() => {
    console.log("VELO contract deployment successful.");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("VELO contract deployment failed:", e);
    process.exit(1);
  });

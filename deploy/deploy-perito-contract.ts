#!/usr/bin/env bun
// Deploys contracts/velo_perito.compact (Layer 6/7) to the network selected in
// network-config.ts (default: preview). Mirrors deploy/deploy-contract.ts.
//
//   MIDNIGHT_NETWORK_ID=preview MIDNIGHT_STORAGE_PASSWORD=<secret> \
//   MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
//   bun run deploy/deploy-perito-contract.ts
//
// Run with Bun: @effectstream/midnight-contracts ships raw .ts. baseDir points
// at deploy/managed-shim, whose velo_perito/src/managed is a symlink to
// contracts/managed/velo_perito (the deploy tool's discovery convention).
//
// Deploy never calls a circuit (velo_perito has no constructor — the ledger's
// Map/Set/Counter default to empty), so these witnesses are placeholders that
// only satisfy the compiled Contract's constructor signature and are never
// invoked. The real witnesses (bound to a perito + span) are supplied later by
// register-credential.ts / prove-credential.ts.
import { deployMidnightContract } from "@effectstream/midnight-contracts/deploy";
import type { DeployConfig } from "@effectstream/midnight-contracts/types";
import { Contract } from "../contracts/managed/velo_perito/contract/index.js";
import { midnightNetworkConfig, storagePassword } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

process.env.MIDNIGHT_STORAGE_PASSWORD ??= storagePassword;

// Placeholder witnesses — shape only, never invoked during deploy. The path
// witness returns the empty MerkleTreePath shape the bindings expect.
const placeholderWitnesses = {
  peritoLeafKey: (ctx: { privateState: unknown }) => [ctx.privateState, new Uint8Array(32)] as const,
  findCredentialPath: (ctx: { privateState: unknown }, _leaf: Uint8Array) =>
    [ctx.privateState, { leaf: new Uint8Array(32), path: [] }] as const,
  credentialValidFrom: (ctx: { privateState: unknown }) => [ctx.privateState, 0n] as const,
  credentialValidUntil: (ctx: { privateState: unknown }) => [ctx.privateState, 0n] as const,
  opinionVerdict: (ctx: { privateState: unknown }) => [ctx.privateState, 0] as const,
  opinionNonce: (ctx: { privateState: unknown }) => [ctx.privateState, new Uint8Array(32)] as const,
};

const config: DeployConfig = {
  contractName: "velo_perito",
  baseDir: new URL("./managed-shim", import.meta.url).pathname,
  contractFileName: "velo_perito-contract.json",
  contractClass: Contract,
  witnesses: placeholderWitnesses,
  privateStateId: "veloPeritoPrivateState",
  initialPrivateState: { leafSecretKeys: {}, opinionNonces: {} },
  privateStateStoreName: "velo-perito-private-state",
};

console.log("Deploying VELO perito contract with network config:", safeNetworkConfigForLogging(midnightNetworkConfig));

withSeedRedaction(() => deployMidnightContract(config, midnightNetworkConfig))
  .then(() => {
    console.log("VELO perito contract deployment successful.");
    console.log("Next: bun run deploy/register-credential.ts VELO-PERITO-001");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("VELO perito contract deployment failed:", e);
    process.exit(1);
  });

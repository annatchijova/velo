#!/usr/bin/env bun
// Register one accredited perito credential leaf on the deployed velo_perito
// contract (Layer 6). Mirrors deploy/attest-case.ts.
//
//   MIDNIGHT_NETWORK_ID=preview MIDNIGHT_STORAGE_PASSWORD=<secret> \
//   MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
//   bun run deploy/register-credential.ts VELO-PERITO-001 [spanIndex]
//
// One leaf per validity span: a single-span examiner is registered once; a
// multi-span one (VELO-PERITO-005) is registered once per span (spanIndex 0, 1).
// The leaf is computed IN-CIRCUIT from the perito's leafSecretKey + window, so
// the registered leaf is exactly the one proveCredential later recomputes.
//
// The leafSecretKey is generated once here and persisted in the contract-scoped
// private state, so prove-credential.ts reads back the SAME key — the same reuse
// discipline as the per-case salt in attest-case.ts. Prerequisite: the wallet
// must have DUST (deploy/register-dust.ts).
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import * as VeloPerito from "../contracts/managed/velo_perito/contract/index.js";
import {
  emptyPeritoPrivateState,
  getOrCreateLeafKey,
  makePeritoWitnesses,
  type PeritoPrivateState,
} from "../src/witness/perito_witnesses.js";
import { buildPeritoProviders, loadPeritoProfile, peritoContractAddress, ZK_ASSETS, PRIVATE_STATE_ID } from "./perito-common.js";
import { midnightNetworkConfig, storagePassword } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

process.env.MIDNIGHT_STORAGE_PASSWORD ??= storagePassword;

async function main(): Promise<void> {
  const peritoId = process.argv[2];
  const spanIndex = Number.parseInt(process.argv[3] ?? "0", 10);
  if (!peritoId) {
    throw new Error("Usage: bun run deploy/register-credential.ts <peritoId> [spanIndex]");
  }

  const profile = loadPeritoProfile(peritoId);
  if (!Number.isInteger(spanIndex) || spanIndex < 0 || spanIndex >= profile.spans.length) {
    throw new Error(`spanIndex ${spanIndex} out of range: ${peritoId} has ${profile.spans.length} span(s) [0..${profile.spans.length - 1}]`);
  }
  const span = profile.spans[spanIndex]!;

  console.log("Registering credential on Midnight:", safeNetworkConfigForLogging(midnightNetworkConfig));
  console.log(`perito          : ${peritoId}`);
  console.log(`span            : ${spanIndex} [${span.validFromEpoch}, ${span.validUntilEpoch}]`);

  const { networkId, walletResult, providers } = await buildPeritoProviders();
  const address = peritoContractAddress(networkId);
  console.log(`unshielded addr : ${walletResult.unshieldedAddress}`);
  console.log(`contract        : ${address}`);

  await providers.privateStateProvider.setContractAddress(address);

  // Seed the leaf secret key BEFORE proving (same reasoning as the salt seeding
  // in attest-case.ts): generate once, persist, and reuse. Regenerating it would
  // orphan the leaf from every later proof.
  const storedState = (await providers.privateStateProvider.get(PRIVATE_STATE_ID)) as PeritoPrivateState | null;
  const { state, leafKey } = getOrCreateLeafKey(storedState ?? emptyPeritoPrivateState(), peritoId);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, state as never);
  console.log(`leafKey         : ${storedState?.leafSecretKeys?.[peritoId] ? "reused from private state" : "generated now"} (${leafKey.length} bytes, never printed)`);

  const witnesses = makePeritoWitnesses(peritoId, span);
  const compiledContract = CompiledContract.make("velo_perito", VeloPerito.Contract as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  console.log("\nSubmitting registerCredential() — generates a ZK proof, takes a while...\n");
  const result = await submitCallTx(providers as never, {
    compiledContract,
    circuitId: "registerCredential",
    contractAddress: address,
    args: [],
    privateStateId: PRIVATE_STATE_ID,
  } as never);

  console.log("Registered on-chain. The accredited-examiners root advanced.");
  const r = result as { public?: Record<string, unknown>; txId?: unknown };
  const txId = r?.public?.["txId"] ?? r?.txId;
  if (txId !== undefined) console.log(`txId            : ${String(txId)}`);
  console.log(`\nNext: bun run deploy/prove-credential.ts ${peritoId} <caseId>`);
}

withSeedRedaction(main)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\nRegistration failed:", err);
    console.error(
      "\nIf this is `Custom error: 170` (InvalidDustSpendProof), it is the DUST fee proof, not the contract.\n" +
        "See docs/LEARNINGS.md L3: usually stale dust state — re-run promptly.",
    );
    process.exit(1);
  });

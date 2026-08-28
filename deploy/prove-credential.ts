#!/usr/bin/env bun
// Prove a perito credential on the deployed velo_perito contract (Layer 6):
// "some accredited, currently-valid examiner attests this case" — without
// revealing which. Mirrors deploy/attest-case.ts.
//
//   MIDNIGHT_NETWORK_ID=preview MIDNIGHT_STORAGE_PASSWORD=<secret> \
//   MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
//   bun run deploy/prove-credential.ts VELO-PERITO-001 VELO-001
//
// Prerequisite: the perito's covering-span leaf must already be registered
// (bun run deploy/register-credential.ts <peritoId> [spanIndex]) — the proof
// asserts on-chain membership, and reads the SAME leafSecretKey from the
// contract-scoped private state that register generated.
//
// The attestation date is the case's ANALYZED custody event. If no credential
// span covers that date — the VELO-PERITO-005 licensing gap on VELO-006 — this
// REFUSES up front with a sentence, rather than letting proof generation fail:
// membership would hold, but no covering span exists, so validity cannot pass.
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import * as VeloPerito from "../contracts/managed/velo_perito/contract/index.js";
import { checkValidity } from "../src/perito/validity.js";
import { attestationEpochForCase } from "../src/perito/case_adapter.js";
import { makePeritoWitnesses, type PeritoPrivateState } from "../src/witness/perito_witnesses.js";
import { buildPeritoProviders, loadCaseById, loadPeritoProfile, peritoContractAddress, ZK_ASSETS, PRIVATE_STATE_ID } from "./perito-common.js";
import { midnightNetworkConfig, storagePassword } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

process.env.MIDNIGHT_STORAGE_PASSWORD ??= storagePassword;

async function main(): Promise<void> {
  const peritoId = process.argv[2];
  const caseId = process.argv[3];
  if (!peritoId || !caseId) {
    throw new Error("Usage: bun run deploy/prove-credential.ts <peritoId> <caseId>");
  }

  const profile = loadPeritoProfile(peritoId);
  const caseObj = loadCaseById(caseId);
  const attestationEpoch = attestationEpochForCase(caseObj);

  const validity = checkValidity(profile.spans, attestationEpoch);
  if (validity.status !== "VALID" || validity.coveringSpanIndex === null) {
    throw new Error(
      `Refusing to attempt: ${peritoId} credential is ${validity.status} at ${caseId}'s attestation date ` +
        `(epoch ${attestationEpoch}).\n  ${validity.reasons.join("\n  ")}\n` +
        "Membership might hold, but proveCredential also range-checks the window, so no proof could be produced.",
    );
  }
  const span = profile.spans[validity.coveringSpanIndex]!;

  console.log("Proving credential on Midnight:", safeNetworkConfigForLogging(midnightNetworkConfig));
  console.log(`perito          : ${peritoId}`);
  console.log(`case            : ${caseId}`);
  console.log(`attestation date: epoch ${attestationEpoch} (${attestationEpoch === null ? "unknown" : new Date(attestationEpoch * 1000).toISOString()})`);
  console.log(`covering span   : ${validity.coveringSpanIndex} [${span.validFromEpoch}, ${span.validUntilEpoch}]`);

  const { networkId, walletResult, providers } = await buildPeritoProviders();
  const address = peritoContractAddress(networkId);
  console.log(`unshielded addr : ${walletResult.unshieldedAddress}`);
  console.log(`contract        : ${address}`);

  await providers.privateStateProvider.setContractAddress(address);
  const storedState = (await providers.privateStateProvider.get(PRIVATE_STATE_ID)) as PeritoPrivateState | null;
  if (!storedState?.leafSecretKeys?.[peritoId]) {
    throw new Error(
      `No leaf secret key for ${peritoId} in the contract's private state. Register first:\n` +
        `  bun run deploy/register-credential.ts ${peritoId} ${validity.coveringSpanIndex}`,
    );
  }

  const witnesses = makePeritoWitnesses(peritoId, span);
  const compiledContract = CompiledContract.make("velo_perito", VeloPerito.Contract as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  console.log("\nSubmitting proveCredential() — generates a ZK proof, takes a while...\n");
  const result = await submitCallTx(providers as never, {
    compiledContract,
    circuitId: "proveCredential",
    contractAddress: address,
    args: [BigInt(attestationEpoch!)],
    privateStateId: PRIVATE_STATE_ID,
  } as never);

  console.log("Proved on-chain: an accredited, currently-valid examiner attested — without revealing which.");
  const r = result as { public?: Record<string, unknown>; txId?: unknown };
  const txId = r?.public?.["txId"] ?? r?.txId;
  if (txId !== undefined) console.log(`txId            : ${String(txId)}`);
}

withSeedRedaction(main)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\nProof failed:", err);
    console.error(
      "\nIf this is `not an accredited examiner`, register the covering span first.\n" +
        "If this is `Custom error: 170` (InvalidDustSpendProof), it is the DUST fee proof — re-run promptly (docs/LEARNINGS.md L3).",
    );
    process.exit(1);
  });

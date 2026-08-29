#!/usr/bin/env bun
// Layer 7 reveal phase: open a previously committed verdict. The contract
// only allows this once BOTH examiners have committed (commitCount == 2) — that
// is what keeps the second opinion blind. Mirrors deploy/prove-credential.ts.
//
//   MIDNIGHT_NETWORK_ID=preview MIDNIGHT_STORAGE_PASSWORD=<secret> \
//   MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
//   bun run deploy/reveal-opinion.ts VELO-PERITO-003 VELO-005 MALICE
//
// verdict and nonce are PUBLIC in the reveal (this IS the opening). The nonce
// was generated at commit time and persisted in the contract-scoped private
// state; this reads it back — reveal fails if commit-opinion.ts never ran for
// this (perito, case).
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import * as VeloPerito from "../contracts/managed/velo_perito/contract/index.js";
import { checkValidity } from "../src/perito/validity.js";
import { attestationEpochForCase } from "../src/perito/case_adapter.js";
import { makePeritoWitnesses, type PeritoPrivateState } from "../src/witness/perito_witnesses.js";
import { hexToBytes32 } from "../src/witness/witnesses.js";
import type { Verdict } from "../src/engine/scorer.js";
import { buildPeritoProviders, loadCaseById, loadPeritoProfile, peritoContractAddress, caseCommitmentFor, ZK_ASSETS, PRIVATE_STATE_ID } from "./perito-common.js";
import { midnightNetworkConfig, storagePassword } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

process.env.MIDNIGHT_STORAGE_PASSWORD ??= storagePassword;

const VERDICTS: Verdict[] = ["NOISE", "SUSPICION", "MALICE", "ABSTAIN"];
const VERDICT_ENUM: Record<Verdict, VeloPerito.Verdict> = {
  NOISE: VeloPerito.Verdict.NOISE,
  SUSPICION: VeloPerito.Verdict.SUSPICION,
  MALICE: VeloPerito.Verdict.MALICE,
  ABSTAIN: VeloPerito.Verdict.ABSTAIN,
};

async function main(): Promise<void> {
  const peritoId = process.argv[2];
  const caseId = process.argv[3];
  const verdict = process.argv[4] as Verdict | undefined;
  if (!peritoId || !caseId || !verdict || !VERDICTS.includes(verdict)) {
    throw new Error(`Usage: bun run deploy/reveal-opinion.ts <peritoId> <caseId> <${VERDICTS.join("|")}>`);
  }

  const profile = loadPeritoProfile(peritoId);
  const caseObj = loadCaseById(caseId);
  const attestationEpoch = attestationEpochForCase(caseObj);
  const validity = checkValidity(profile.spans, attestationEpoch);
  // The covering span is only needed to build a complete witness object; reveal
  // itself invokes no witness. Fall back to the first span if (unexpectedly)
  // no span covers the date.
  const span = profile.spans[validity.coveringSpanIndex ?? 0]!;
  const caseCommitment = caseCommitmentFor(caseId);

  console.log("Revealing opinion on Midnight:", safeNetworkConfigForLogging(midnightNetworkConfig));
  console.log(`perito          : ${peritoId}`);
  console.log(`case            : ${caseId}`);
  console.log(`case_commitment : ${caseCommitment.hex}`);
  console.log(`verdict         : ${verdict} (public in the reveal)`);

  const { networkId, walletResult, providers } = await buildPeritoProviders();
  const address = peritoContractAddress(networkId);
  console.log(`unshielded addr : ${walletResult.unshieldedAddress}`);
  console.log(`contract        : ${address}`);

  await providers.privateStateProvider.setContractAddress(address);
  const stored = (await providers.privateStateProvider.get(PRIVATE_STATE_ID)) as PeritoPrivateState | null;
  const nonceHex = stored?.opinionNonces?.[`${peritoId}:${caseCommitment.hex}`];
  if (!nonceHex) {
    throw new Error(
      `No commit nonce for ${peritoId} on ${caseId} in the contract's private state. Commit first:\n` +
        `  bun run deploy/commit-opinion.ts ${peritoId} ${caseId} ${verdict}`,
    );
  }
  const nonce = hexToBytes32(nonceHex, "opinion nonce");

  // Reveal invokes no witness, but the Contract constructor still needs the
  // full (six-field) witness object present.
  const witnesses = makePeritoWitnesses(peritoId, span);
  const compiledContract = CompiledContract.make("velo_perito", VeloPerito.Contract as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  console.log("\nSubmitting revealOpinion() — generates a ZK proof, takes a while...\n");
  const result = await submitCallTx(providers as never, {
    compiledContract,
    circuitId: "revealOpinion",
    contractAddress: address,
    args: [caseCommitment.bytes, VERDICT_ENUM[verdict], nonce],
    privateStateId: PRIVATE_STATE_ID,
  } as never);

  console.log("Revealed on-chain. Once both opinions are open, agreement is decidable from the two verdicts.");
  const r = result as { public?: Record<string, unknown>; txId?: unknown };
  const txId = r?.public?.["txId"] ?? r?.txId;
  if (txId !== undefined) console.log(`txId            : ${String(txId)}`);
}

withSeedRedaction(main)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\nReveal failed:", err);
    console.error(
      "\nIf `cannot reveal until both opinions are committed`, the blindness gate is doing its job — commit the second opinion first.\n" +
        "If `Custom error: 170`, it is the DUST fee proof — re-run promptly (docs/LEARNINGS.md L3).",
    );
    process.exit(1);
  });

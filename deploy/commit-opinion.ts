#!/usr/bin/env bun
// Layer 7 commit phase: an accredited, currently-valid examiner publishes a
// HIDING commitment to their verdict on a case, plus a distinct-examiner
// nullifier — without revealing the verdict or which examiner. Mirrors
// deploy/prove-credential.ts.
//
//   MIDNIGHT_NETWORK_ID=preview MIDNIGHT_STORAGE_PASSWORD=<secret> \
//   MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
//   bun run deploy/commit-opinion.ts VELO-PERITO-003 VELO-005 MALICE
//
// Prerequisites: the perito's covering-span leaf must be registered
// (deploy/register-credential.ts), because commitOpinion reuses the Layer 6
// credential proof. The verdict is a SECRET witness here; only its commitment
// goes on-chain. The blinding nonce is generated once and persisted in the
// contract-scoped private state, so reveal-opinion.ts can reproduce the
// commitment later.
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import * as VeloPerito from "../contracts/managed/velo_perito/contract/index.js";
import { checkValidity } from "../src/perito/validity.js";
import { attestationEpochForCase } from "../src/perito/case_adapter.js";
import {
  emptyPeritoPrivateState,
  getOrCreateLeafKey,
  getOrCreateOpinionNonce,
  makeOpinionWitnesses,
  type PeritoPrivateState,
} from "../src/witness/perito_witnesses.js";
import type { Verdict } from "../src/engine/scorer.js";
import { buildPeritoProviders, loadPeritoProfile, loadCaseById, peritoContractAddress, caseCommitmentFor, ZK_ASSETS, PRIVATE_STATE_ID } from "./perito-common.js";
import { midnightNetworkConfig, storagePassword } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

process.env.MIDNIGHT_STORAGE_PASSWORD ??= storagePassword;

const VERDICTS: Verdict[] = ["NOISE", "SUSPICION", "MALICE", "ABSTAIN"];

async function main(): Promise<void> {
  const peritoId = process.argv[2];
  const caseId = process.argv[3];
  const verdict = process.argv[4] as Verdict | undefined;
  if (!peritoId || !caseId || !verdict || !VERDICTS.includes(verdict)) {
    throw new Error(`Usage: bun run deploy/commit-opinion.ts <peritoId> <caseId> <${VERDICTS.join("|")}>`);
  }

  const profile = loadPeritoProfile(peritoId);
  const caseObj = loadCaseById(caseId);
  const attestationEpoch = attestationEpochForCase(caseObj);
  const validity = checkValidity(profile.spans, attestationEpoch);
  if (validity.status !== "VALID" || validity.coveringSpanIndex === null) {
    throw new Error(
      `Refusing to commit: ${peritoId} credential is ${validity.status} at ${caseId}'s attestation date (epoch ${attestationEpoch}).\n  ${validity.reasons.join("\n  ")}`,
    );
  }
  const span = profile.spans[validity.coveringSpanIndex]!;
  const caseCommitment = caseCommitmentFor(caseId);

  console.log("Committing blind opinion on Midnight:", safeNetworkConfigForLogging(midnightNetworkConfig));
  console.log(`perito          : ${peritoId}`);
  console.log(`case            : ${caseId}`);
  console.log(`case_commitment : ${caseCommitment.hex}`);
  console.log(`verdict         : (secret — committed hidden)`);

  const { networkId, walletResult, providers } = await buildPeritoProviders();
  const address = peritoContractAddress(networkId);
  console.log(`unshielded addr : ${walletResult.unshieldedAddress}`);
  console.log(`contract        : ${address}`);

  await providers.privateStateProvider.setContractAddress(address);

  // Seed BOTH secrets before proving (same reasoning as attest-case.ts's salt):
  // the leaf key (for the credential proof/nullifier) and the opinion nonce
  // (blinding), so a multi-witness proof cannot see divergent lazily-minted
  // values, and reveal can reproduce the commitment.
  const stored = (await providers.privateStateProvider.get(PRIVATE_STATE_ID)) as PeritoPrivateState | null;
  const afterKey = getOrCreateLeafKey(stored ?? emptyPeritoPrivateState(), peritoId);
  const afterNonce = getOrCreateOpinionNonce(afterKey.state, `${peritoId}:${caseCommitment.hex}`);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, afterNonce.state as never);

  const witnesses = makeOpinionWitnesses(peritoId, span, caseCommitment.hex, verdict);
  const compiledContract = CompiledContract.make("velo_perito", VeloPerito.Contract as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  console.log("\nSubmitting commitOpinion() — generates a ZK proof, takes a while...\n");
  const result = await submitCallTx(providers as never, {
    compiledContract,
    circuitId: "commitOpinion",
    contractAddress: address,
    args: [caseCommitment.bytes, BigInt(attestationEpoch!)],
    privateStateId: PRIVATE_STATE_ID,
  } as never);

  console.log("Committed on-chain: a hidden verdict + a nullifier. Nothing about the verdict is public yet.");
  const r = result as { public?: Record<string, unknown>; txId?: unknown };
  const txId = r?.public?.["txId"] ?? r?.txId;
  if (txId !== undefined) console.log(`txId            : ${String(txId)}`);
  console.log(`\nReveal (only after BOTH examiners commit): bun run deploy/reveal-opinion.ts ${peritoId} ${caseId} ${verdict}`);
}

withSeedRedaction(main)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\nCommit failed:", err);
    console.error(
      "\nIf `this examiner has already opined on this case`, the nullifier did its job (one opinion per examiner).\n" +
        "If `not an accredited examiner`, register the covering span first.\n" +
        "If `Custom error: 170`, it is the DUST fee proof — re-run promptly (docs/LEARNINGS.md L3).",
    );
    process.exit(1);
  });

#!/usr/bin/env bun
// ADVERSARIAL TEST — try to force a MALICE attestation from ONE source.
//
//   MIDNIGHT_NETWORK_ID=preview \
//   MIDNIGHT_STORAGE_PASSWORD=<secret> \
//   MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
//   bun run deploy/attest-forced-malice.ts <caseId>
//
// WHAT THIS EXISTS TO PROVE
//
// The project's central claim (docs/TECHNICAL_STATUS.md §2.2) is that the
// Daubert corroboration gate is a *constraint*, not a policy:
//
//   "An attempt to attest MALICE from a single source does not produce a
//    rejected transaction. It fails to produce a proof at all."
//
// Until this script ran, that was a CODE FACT — read in contracts/velo.compact,
// never executed. This is the induction step. It is the single most
// load-bearing sentence in the project, so it should be the one claim that is
// tested hardest, not assumed.
//
// HOW IT ATTACKS
//
// Every application-level check is deliberately bypassed:
//
//   - the ENGINE never emits this state at all: scorer.ts degrades MALICE to
//     SUSPICION when corroborationCount < 2, so no sealed bundle can carry it;
//   - deploy/attest-case.ts refuses locally before submitting;
//   - so this script overrides `corroborationCountWitness` to return 1 while
//     passing MALICE as the public verdict argument.
//
// Nothing is left between this call and the circuit. If the transaction still
// fails, the gate is enforced by the proof system itself — which is exactly
// the claim. If it SUCCEEDS, the claim is false and the project's headline
// property does not hold: that outcome must be reported, not buried.
//
// Costs nothing to run: the assert fires during circuit execution, before
// proving and before any fee is balanced — the same place the replay guard
// fired in docs/LEARNINGS.md L4.
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import {
  buildWalletAndWaitForFunds,
  configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";
import * as Velo from "../contracts/managed/velo/contract/index.js";
import { loadBundle } from "../src/mcp/store.js";
import {
  emptyPrivateState,
  getOrCreateSalt,
  makeWitnesses,
  type VeloPrivateState,
} from "../src/witness/witnesses.js";
import { midnightNetworkConfig } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const ZK_ASSETS = resolve(REPO_ROOT, "contracts/managed/velo");
const PRIVATE_STATE_ID = "veloPrivateState";
const PRIVATE_STATE_STORE = "velo-private-state-forced";

/** The gate's own message, from contracts/velo.compact. */
const GATE_ASSERT = /MALICE requires at least 2 independent corroborating sources/i;

function contractAddress(networkId: string): string {
  const override = process.env["VELO_CONTRACT_ADDRESS"];
  if (override) return override;
  const path = resolve(REPO_ROOT, "deploy/managed-shim", `velo-contract.${networkId}.json`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { contractAddress?: string };
  if (!parsed.contractAddress) throw new Error(`${path} has no contractAddress.`);
  return parsed.contractAddress;
}

/** Walk the cause chain — the message surfaces through several wrappers. */
function mentionsGate(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (GATE_ASSERT.test(current instanceof Error ? current.message : String(current))) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function main(): Promise<"REFUSED" | "ACCEPTED"> {
  const caseId = process.argv[2];
  if (!caseId) throw new Error("Usage: bun run deploy/attest-forced-malice.ts <caseId>");

  const bundle = loadBundle(caseId);
  if (!bundle) throw new Error(`No sealed bundle for ${JSON.stringify(caseId)} in local-cases/.`);

  const networkId = midnightNetworkConfig.id as NetworkId.NetworkId;
  const address = contractAddress(networkId);

  console.log("ADVERSARIAL: forcing MALICE with corroborationCount = 1");
  console.log(safeNetworkConfigForLogging(midnightNetworkConfig));
  console.log(`case                : ${bundle.caseId}`);
  console.log(`real verdict        : ${bundle.verdict}`);
  console.log(`real corroboration  : ${bundle.corroborationCount}`);
  console.log(`FORCED verdict      : MALICE`);
  console.log(`FORCED corroboration: 1   <- the circuit must refuse this`);
  console.log(`contract            : ${address}`);
  console.log();
  console.log("PREDICTION (stated before running): the circuit's assert fires and no");
  console.log("proof is produced. If this instead succeeds, TECHNICAL_STATUS §2.2 is false.");
  console.log();

  setNetworkId(networkId);
  const networkUrls = {
    id: midnightNetworkConfig.id,
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  };

  const walletResult = await buildWalletAndWaitForFunds(
    networkUrls,
    midnightNetworkConfig.walletSeed,
    networkId,
  );

  const providers = configureMidnightNodeProviders(
    walletResult.wallet,
    walletResult.zswapSecretKeys,
    walletResult.walletZswapSecretKeys,
    walletResult.dustSecretKey,
    walletResult.walletDustSecretKey,
    networkUrls,
    PRIVATE_STATE_STORE,
    ZK_ASSETS,
    walletResult.unshieldedKeystore,
  );

  // The attack: honest witnesses for everything the circuit can cross-check,
  // and a forged corroboration count. Forging only the count is deliberate —
  // it isolates the gate. A bundle that also lied about the fingerprint would
  // fail for a different reason and prove nothing about corroboration.
  const honest = makeWitnesses(bundle);
  const forced = {
    ...honest,
    corroborationCountWitness: (ctx: never) => {
      const [state] = honest.corroborationCountWitness(ctx);
      return [state, 1n] as const;
    },
  };

  const compiledContract = CompiledContract.make("velo", Velo.Contract as never).pipe(
    CompiledContract.withWitnesses(forced as never),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  await providers.privateStateProvider.setContractAddress(address);
  const stored = (await providers.privateStateProvider.get(PRIVATE_STATE_ID)) as VeloPrivateState | null;
  const { state } = getOrCreateSalt(stored ?? emptyPrivateState(), `${bundle.caseId}::forced`);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, state as never);

  console.log("Submitting forced MALICE...\n");
  try {
    await submitCallTx(providers as never, {
      compiledContract,
      circuitId: "attest",
      contractAddress: address,
      args: [Velo.Verdict.MALICE],
      privateStateId: PRIVATE_STATE_ID,
    } as never);
    return "ACCEPTED";
  } catch (err) {
    if (mentionsGate(err)) {
      console.log("Refused by the circuit's own assert:");
      console.log(`  "${(err instanceof Error ? err.message : String(err)).slice(0, 200)}"`);
      return "REFUSED";
    }
    // Refused, but not by the gate. That is NOT the claim, and saying so
    // matters more than a green result: it could be dust, network, or shape.
    console.log("Refused, but NOT by the Daubert gate. This does not verify the claim.");
    console.log(err);
    return "REFUSED";
  }
}

withSeedRedaction(main)
  .then((outcome) => {
    console.log();
    if (outcome === "REFUSED") {
      console.log("PREDICTION HELD — MALICE from one source cannot be attested.");
      console.log("The gate is enforced by the proof system, not by application code:");
      console.log("the engine, the CLI guard and every other check were bypassed.");
      process.exit(0);
    }
    console.log("PREDICTION FALSIFIED — the chain ACCEPTED MALICE with one source.");
    console.log("docs/TECHNICAL_STATUS.md §2.2 is false as written and must be corrected.");
    process.exit(1);
  })
  .catch((err: unknown) => {
    console.error("\nThe experiment could not run (this is not a result either way):", err);
    process.exit(2);
  });

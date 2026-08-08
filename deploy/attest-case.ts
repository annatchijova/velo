#!/usr/bin/env bun
// Attest a locally sealed case on the deployed VELO contract.
//
//   MIDNIGHT_NETWORK_ID=preview \
//   MIDNIGHT_STORAGE_PASSWORD=<secret> \
//   MIDNIGHT_WALLET_MNEMONIC="word1 ... word24" \
//   bun run deploy/attest-case.ts <caseId>
//
// Runs under Bun for the same reason the deploy script does: the wallet
// and provider plumbing comes from @effectstream/midnight-contracts, which
// ships raw .ts exports that plain tsc/node cannot resolve.
//
// WHAT THIS DOES, AND WHAT IT DOES NOT
//
// It calls the `attest` circuit on the contract already deployed to
// `preview`. The circuit recomputes the commitment from four private
// witnesses — the analysis fingerprint, the custody tip, the corroboration
// count and a per-case salt — hashes the verdict in with them, and enforces
// the Daubert gate: MALICE requires corroborationCount >= 2. A transaction
// that violates that does not fail validation, it fails to produce a proof.
//
// The evidence never leaves this machine. What goes on-chain is the
// commitment and the declared verdict. What the circuit CANNOT see is
// whether those witnesses describe a real engine run on real evidence —
// that binding exists only in this caller (see RED_TEAM_ROUND_2.md, G1).
//
// Prerequisite: the wallet must have DUST. Run deploy/register-dust.ts
// first if it never has, and attest promptly afterwards — stale dust state
// is what produced `Custom error: 170` on the first real deploy
// (docs/LEARNINGS.md, L3).
import { resolve } from "node:path";
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
import { emptyPrivateState, makeWitnesses } from "../src/witness/witnesses.js";
import { midnightNetworkConfig } from "./network-config.js";
import { safeNetworkConfigForLogging, withSeedRedaction } from "./redact-seed.js";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const ZK_ASSETS = resolve(REPO_ROOT, "contracts/managed/velo");
const PRIVATE_STATE_ID = "veloPrivateState";
const PRIVATE_STATE_STORE = "velo-private-state-attest";

const VERDICT_BY_NAME: Record<string, Velo.Verdict> = {
  NOISE: Velo.Verdict.NOISE,
  SUSPICION: Velo.Verdict.SUSPICION,
  MALICE: Velo.Verdict.MALICE,
  ABSTAIN: Velo.Verdict.ABSTAIN,
};

function contractAddress(networkId: string): string {
  const override = process.env["VELO_CONTRACT_ADDRESS"];
  if (override) return override;
  const path = resolve(REPO_ROOT, "deploy/managed-shim", `velo-contract.${networkId}.json`);
  const file = Bun.file(path);
  // Bun.file(...).json() is async; read synchronously via the Node API to
  // keep this a plain top-level constant.
  const raw = require("node:fs").readFileSync(path, "utf8") as string;
  void file;
  const parsed = JSON.parse(raw) as { contractAddress?: string };
  if (!parsed.contractAddress) {
    throw new Error(`${path} has no contractAddress. Deploy first: bun run deploy/deploy-contract.ts`);
  }
  return parsed.contractAddress;
}

async function main(): Promise<void> {
  const caseId = process.argv[2];
  if (!caseId) {
    throw new Error("Usage: bun run deploy/attest-case.ts <caseId>   (the case must already be sealed locally)");
  }

  const bundle = loadBundle(caseId);
  if (!bundle) {
    throw new Error(
      `No sealed bundle for case ${JSON.stringify(caseId)} in local-cases/. Seal it first (MCP seal_case or POST /api/seal).`,
    );
  }

  const verdict = VERDICT_BY_NAME[bundle.verdict];
  if (verdict === undefined) {
    throw new Error(`Bundle carries an unknown verdict ${JSON.stringify(bundle.verdict)}.`);
  }

  // The circuit will refuse this itself — asserting it here too means the
  // operator gets a sentence instead of a proof-generation failure.
  if (bundle.verdict === "MALICE" && bundle.corroborationCount < 2) {
    throw new Error(
      `Refusing to attempt: MALICE with corroborationCount=${bundle.corroborationCount}. ` +
        "The circuit enforces >= 2 independent sources, so no proof could be produced for this.",
    );
  }

  const networkId = midnightNetworkConfig.id as NetworkId.NetworkId;
  const address = contractAddress(networkId);

  console.log("Attesting on Midnight:", safeNetworkConfigForLogging(midnightNetworkConfig));
  console.log(`case            : ${bundle.caseId}`);
  console.log(`verdict         : ${bundle.verdict}`);
  console.log(`corroboration   : ${bundle.corroborationCount}`);
  console.log(`fingerprint     : ${bundle.analysisFingerprint}`);
  console.log(`contract        : ${address}`);
  console.log(`zk assets       : ${ZK_ASSETS}`);
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
  console.log(`unshielded addr : ${walletResult.unshieldedAddress}`);

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

  // Witnesses are bound to THIS bundle: the fingerprint and custody tip come
  // from the sealed analysis, and the salt is generated once per case and
  // persisted, because without the exact salt the commitment can never be
  // reproduced by its own author.
  const witnesses = makeWitnesses(bundle);
  const compiledContract = CompiledContract.make("velo", Velo.Contract as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  await providers.privateStateProvider.set(PRIVATE_STATE_ID, emptyPrivateState() as never);

  console.log("Submitting attest() — this generates a ZK proof, which takes a while...\n");
  const result = await submitCallTx(providers as never, {
    compiledContract,
    circuitId: "attest",
    contractAddress: address,
    args: [verdict],
    privateStateId: PRIVATE_STATE_ID,
  } as never);

  console.log("\nAttested on-chain.");
  console.log(JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2).slice(0, 2000));
  console.log(`\nVerify it independently:  npm run build && node scripts/verify-chain-read.mjs`);
}

withSeedRedaction(main)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\nAttestation failed:", err);
    console.error(
      "\nIf this is `Custom error: 170` (InvalidDustSpendProof), it is the DUST fee proof, not your contract.\n" +
        "See docs/LEARNINGS.md L3: usually stale dust state — re-run promptly rather than changing versions.",
    );
    process.exit(1);
  });

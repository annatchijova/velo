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
import { emptyPrivateState, getOrCreateSalt, makeWitnesses, type VeloPrivateState } from "../src/witness/witnesses.js";
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

  // The private state store is scoped by contract address, so the scope has
  // to be set before anything is read or written through it.
  await providers.privateStateProvider.setContractAddress(address);

  // Seed the salt BEFORE proving, rather than letting the witnesses mint one
  // lazily during proof generation.
  //
  // `getOrCreateSalt` generates a salt only when the private state does not
  // already carry one for this case. If the state went in empty, the first
  // witness call would create it and every later call in the same execution
  // would depend on the runtime threading that updated state back through —
  // and if it did not, different witnesses would see different salts and the
  // commitment would be computed over values that never coexisted. Seeding it
  // here removes that dependency entirely.
  //
  // Reading the existing state first is what makes re-attesting the same case
  // reproducible: the salt is the one value that cannot be recovered from the
  // bundle, so overwriting it would permanently orphan the commitment from its
  // own author (see the note on getOrCreateSalt in src/witness/witnesses.ts).
  const storedState = (await providers.privateStateProvider.get(PRIVATE_STATE_ID)) as VeloPrivateState | null;
  const { state: privateState, salt } = getOrCreateSalt(storedState ?? emptyPrivateState(), bundle.caseId);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, privateState as never);
  console.log(`salt            : ${storedState?.salts?.[bundle.caseId] ? "reused from private state" : "generated now"} (${salt.length} bytes, never printed)`);

  console.log("Submitting attest() — this generates a ZK proof, which takes a while...\n");
  try {
    const result = await submitCallTx(providers as never, {
      compiledContract,
      circuitId: "attest",
      contractAddress: address,
      args: [verdict],
      privateStateId: PRIVATE_STATE_ID,
    } as never);

    console.log("\nAttested on-chain.");
    console.log(summarizeCallResult(result));
  } catch (err) {
    // "this attestation already exists" is the contract's own replay guard
    // (red team G2) doing its job, not a failure of this run. The salt is
    // reused per case, so the same sealed analysis always produces the same
    // commitment — and the circuit refuses to record it twice or inflate
    // attestationCount. Reporting that as an error would train an operator
    // to ignore a message that is actually the system working.
    if (isAlreadyAttested(err)) {
      console.log("\nAlready attested — nothing to do.");
      console.log(
        "The contract refused to record this commitment twice. That is the replay guard\n" +
          "(assert(!caseVerdicts.member(commitment)) in contracts/velo.compact, red team G2):\n" +
          "the same sealed analysis reuses its salt, so it always produces the same commitment,\n" +
          "and attestationCount cannot be inflated by re-running this.",
      );
    } else {
      throw err;
    }
  }

  console.log(`\nVerify it independently:  npm run build && node scripts/verify-chain-read.mjs`);
}

/**
 * Print what a reader needs from the call result, and nothing that must stay
 * private.
 *
 * This used to dump the whole result object as JSON. That object carries
 * `private.nextPrivateState`, which is the salt store — so a run printed
 * every per-case salt to stdout, on the line right after this script had
 * claimed "(32 bytes, never printed)". Caught by reading a real run's output
 * rather than trusting the claim, which is the same lesson as F16 and L2.
 *
 * Why the salt matters enough to be worth this: the commitment is public on
 * the ledger, and the salt is what stops anyone from brute-forcing its
 * preimage. `verdict` has four possible values and `corroborationCount` is
 * bounded at 17 — a trivially small space. Hand someone the salt and they can
 * confirm the corroboration count for a published commitment, which the
 * circuit deliberately keeps private because how many sources corroborate is
 * itself information about the case.
 */
function summarizeCallResult(result: unknown): string {
  const r = result as {
    public?: { txId?: unknown; txHash?: unknown; blockHeight?: unknown; status?: unknown };
    txId?: unknown;
  };
  const pub = r?.public ?? {};
  const shown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(pub)) {
    // Only scalars: nested objects here are where private state hides.
    if (value === null || ["string", "number", "boolean", "bigint"].includes(typeof value)) {
      shown[key] = typeof value === "bigint" ? value.toString() : value;
    }
  }
  if (r?.txId !== undefined && shown["txId"] === undefined) shown["txId"] = String(r.txId);

  const lines = Object.entries(shown).map(([k, v]) => `  ${k.padEnd(14)}: ${String(v)}`);
  return lines.length > 0
    ? lines.join("\n")
    : "  (submitted; the SDK returned no public scalar fields to show)";
}

/** The circuit's own assert message, surfaced through several wrapper layers. */
function isAlreadyAttested(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    const message = current instanceof Error ? current.message : String(current);
    if (/this attestation already exists/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
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

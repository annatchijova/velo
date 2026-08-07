// Deploys contracts/velo.compact to the network selected in
// network-config.ts (default: preview, the Hack Buenos Aires network).
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

/**
 * Red team F16: `midnightNetworkConfig` carries `walletSeed` as a plain
 * field (see @effectstream/midnight-contracts/midnight-env.ts) -- logging
 * the object itself, as this line originally did, printed the seed in
 * plaintext. Log everything except that one field instead of guessing
 * which fields are safe.
 */
const { walletSeed: _redactedSeed, ...safeNetworkConfig } = midnightNetworkConfig;
console.log("Deploying VELO contract with network config:", { ...safeNetworkConfig, walletSeed: "[REDACTED]" });

/**
 * Red team F16 continued: the dependency itself also logs the raw seed,
 * unconditionally, from inside buildWalletAndWaitForFunds
 * (`log.info(\`Wallet seed: ${seed}\`)`) -- there is no flag to suppress
 * it, and it is not VELO's code to edit. This is a mitigation, not a fix:
 * redact any stdout/stderr line that looks like it's disclosing the seed,
 * for the duration of the deploy call only. The real fix is upstream, in
 * a dependency this repo doesn't control -- see docs/RED_TEAM_ROUND_4.md.
 */
const SEED_LEAK_PATTERN = /(wallet\s*seed:?\s*)(\S+)/gi;
function redactSeed(chunk: unknown): unknown {
  if (typeof chunk !== "string") return chunk;
  return chunk.replace(SEED_LEAK_PATTERN, "$1[REDACTED by VELO F16 mitigation — see docs/RED_TEAM_ROUND_4.md]");
}

async function deployWithSeedRedaction(): Promise<void> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: unknown, ...args: unknown[]) =>
    (originalStdoutWrite as (...a: unknown[]) => boolean)(redactSeed(chunk), ...args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: unknown, ...args: unknown[]) =>
    (originalStderrWrite as (...a: unknown[]) => boolean)(redactSeed(chunk), ...args);
  try {
    await deployMidnightContract(config, midnightNetworkConfig);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

deployWithSeedRedaction()
  .then(() => {
    console.log("VELO contract deployment successful.");
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error("VELO contract deployment failed:", e);
    process.exit(1);
  });

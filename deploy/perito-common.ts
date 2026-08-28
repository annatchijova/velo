// Shared plumbing for the Layer 6/7 perito deploy scripts, so
// deploy-perito-contract, register-credential and prove-credential stay thin
// and cannot drift. Mirrors deploy/attest-case.ts (the proven Layer 2 path) —
// wallet build, provider config, contract-address resolution, private-state
// scope — but targets the `velo_perito` contract.
//
// Bun-only, like the rest of deploy/: @effectstream/midnight-contracts ships
// raw .ts that plain tsc/node cannot resolve.
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import {
  buildWalletAndWaitForFunds,
  configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";
import { readdirSync } from "node:fs";
import { normalizePerito, type NormalizedPerito } from "../src/perito/credential.js";
import type { CaseWithTimestamps } from "../src/perito/case_adapter.js";
import { midnightNetworkConfig } from "./network-config.js";

export const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
export const ZK_ASSETS = resolve(REPO_ROOT, "contracts/managed/velo_perito");

// Private state carries the per-perito leaf secret key (Layer 6) and opinion
// nonces (Layer 7). It is scoped by contract address, so a key generated at
// register time is read back at prove time — the same reuse discipline as the
// per-case salt in attest-case.ts.
export const PRIVATE_STATE_ID = "veloPeritoPrivateState";
export const PRIVATE_STATE_STORE = "velo-perito-private-state";

/** Resolve the deployed velo_perito address for a network, or explain how to deploy. */
export function peritoContractAddress(networkId: string): string {
  const override = process.env["VELO_PERITO_CONTRACT_ADDRESS"];
  if (override) return override;
  const path = resolve(REPO_ROOT, "deploy/managed-shim", `velo_perito-contract.${networkId}.json`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { contractAddress?: string };
  if (!parsed.contractAddress) {
    throw new Error(`${path} has no contractAddress. Deploy first: bun run deploy/deploy-perito-contract.ts`);
  }
  return parsed.contractAddress;
}

/**
 * DEMO-ONLY deterministic case_commitment for a corpus case. On-chain, Layer 7
 * takes any Bytes<32>; a real deployment would bind the Layer 2 commitment.
 * Here commit-opinion and reveal-opinion derive the SAME value from the caseId
 * so the two phases agree. Returns both the hex (for the opinion-nonce key) and
 * the 32 bytes (for the circuit argument).
 */
export function syntheticCaseCommitment(caseId: string): { hex: string; bytes: Uint8Array } {
  const digest = createHash("sha256").update(`velo:SYNTHETIC-case-commitment:v1:${caseId}`).digest();
  return { hex: digest.toString("hex"), bytes: new Uint8Array(digest) };
}

/** Load and normalize a synthetic perito profile. */
export function loadPeritoProfile(peritoId: string): NormalizedPerito {
  if (!/^VELO-PERITO-\d{3}$/.test(peritoId)) {
    throw new Error(`peritoId must look like VELO-PERITO-001, got ${JSON.stringify(peritoId)}`);
  }
  const path = resolve(REPO_ROOT, "peritos-syntetic", `${peritoId}.json`);
  return normalizePerito(JSON.parse(readFileSync(path, "utf8")));
}

/** Find a case JSON by its case_id field (filenames carry descriptive suffixes). */
export function loadCaseById(caseId: string): CaseWithTimestamps & { case_id: string } {
  const dir = resolve(REPO_ROOT, "cases");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const obj = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as { case_id?: string };
      if (obj.case_id === caseId) return obj as CaseWithTimestamps & { case_id: string };
    } catch {
      /* skip non-case JSON */
    }
  }
  throw new Error(`No case with case_id ${JSON.stringify(caseId)} under cases/`);
}

export interface PeritoProviders {
  networkId: NetworkId.NetworkId;
  networkUrls: {
    id: string;
    indexer: string;
    indexerWS: string;
    node: string;
    proofServer: string;
  };
  walletResult: Awaited<ReturnType<typeof buildWalletAndWaitForFunds>>;
  providers: ReturnType<typeof configureMidnightNodeProviders>;
}

/**
 * Build the wallet and Midnight providers for the perito contract. Identical
 * shape to attest-case.ts, factored here so all three scripts share it. The
 * caller wraps its main in withSeedRedaction() before invoking this — the
 * @effectstream wallet build logs the seed unconditionally (F16).
 */
export async function buildPeritoProviders(): Promise<PeritoProviders> {
  const networkId = midnightNetworkConfig.id as NetworkId.NetworkId;
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

  return { networkId, networkUrls, walletResult, providers };
}

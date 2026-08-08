import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { getEnv } from "../core/env.js";

/**
 * Reading what is actually on the Midnight ledger.
 *
 * This is the READ half of the chain integration and it is deliberately
 * separate from anything that writes. Reading needs no wallet, no proving
 * keys, no proof server, no fees and no DUST — it is an indexer query plus
 * a deserialization. Writing needs all of those. Keeping them apart means
 * the UI can always show real on-chain state even when the machine cannot
 * produce a proof, and means a failure to attest never looks like a
 * failure to read.
 *
 * Honest scope: this reports what the ledger says. It does not verify a ZK
 * proof, and a commitment appearing here means "someone attested this",
 * not "this analysis is true" — the same boundary documented in
 * docs/RED_TEAM_ROUND_2.md (G1/G3).
 */

export type Verdict = "NOISE" | "SUSPICION" | "MALICE" | "ABSTAIN";

// Hand-mirrors `enum Verdict { NOISE, SUSPICION, MALICE, ABSTAIN }` in
// contracts/velo.compact — the generated bindings decode the ledger's
// verdict as a bare numeric index, with no shared source of truth for the
// label order between the circuit and this file.
const VERDICT_BY_INDEX: Verdict[] = ["NOISE", "SUSPICION", "MALICE", "ABSTAIN"];

/**
 * Decode a ledger verdict index into its label.
 *
 * Throws rather than defaulting on an out-of-range index. A future contract
 * redeploy that reorders or extends the Compact enum without this array
 * being updated in lockstep is exactly the kind of drift this project
 * cannot silently absorb: a wrong index silently read as "NOISE" would
 * downgrade a real MALICE verdict to the most benign label with no
 * indication anything was wrong — the one failure mode a tool whose entire
 * purpose is trustworthy verdict display must never produce quietly.
 */
export function verdictFromIndex(index: number): Verdict {
  const verdict = VERDICT_BY_INDEX[index];
  if (verdict === undefined) {
    throw new ChainReadError(
      `Unknown verdict index ${index} from the ledger (expected 0-${VERDICT_BY_INDEX.length - 1}). ` +
        "The deployed contract's Verdict enum may no longer match this reader's VERDICT_BY_INDEX.",
    );
  }
  return verdict;
}

export interface OnChainAttestation {
  /** The commitment, hex — the ledger's Map key. */
  commitment: string;
  verdict: Verdict;
}

export interface OnChainLedger {
  contractAddress: string;
  networkId: string;
  /** The contract's own Counter. Increments once per successful attest(). */
  attestationCount: bigint;
  attestations: OnChainAttestation[];
}

export class ChainReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainReadError";
  }
}

/**
 * Walk up from this module to the repository root — the directory holding
 * `contracts/`. Computed rather than hardcoded because this file is
 * imported from three places with different working directories: the MCP
 * server (repo root), the Next.js frontend (frontend/), and the compiled
 * output under dist/.
 */
function repoRoot(): string {
  const override = getEnv("VELO_REPO_ROOT");
  if (override) return resolve(override);

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "contracts", "velo.compact"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ChainReadError(
    "Could not locate the repository root (looked for contracts/velo.compact walking up from this module). Set VELO_REPO_ROOT.",
  );
}

const MANAGED_CONTRACT = "contracts/managed/velo/contract/index.js";

/**
 * The generated bindings are loaded at runtime rather than statically
 * imported: they live outside this TypeScript project's rootDir, so a
 * static import would resolve differently at compile time and at run time
 * under dist/. Loading by absolute path avoids that entirely, and lets a
 * missing artifact produce a sentence someone can act on instead of a
 * module-resolution stack trace.
 */
interface VeloBindings {
  ledger(state: unknown): {
    attestationCount: bigint;
    caseVerdicts: { size(): bigint; [Symbol.iterator](): Iterator<[Uint8Array, number]> };
  };
}

let bindingsCache: VeloBindings | null = null;

async function loadBindings(): Promise<VeloBindings> {
  if (bindingsCache) return bindingsCache;
  const path = join(repoRoot(), MANAGED_CONTRACT);
  if (!existsSync(path)) {
    throw new ChainReadError(
      `Compiled contract bindings not found at ${path}. Build them with \`bash scripts/compile-contract.sh\` (needs an AVX2 CPU), or check out a revision where contracts/managed is committed.`,
    );
  }
  // webpackIgnore keeps this a NATIVE runtime import. Without it, bundlers
  // (Next.js/webpack on Vercel) rewrite the fully-dynamic import() into their
  // own chunk loader, which cannot resolve an absolute file:// path at request
  // time and fails with "Cannot find module 'file:///...'". The path is only
  // known at runtime (repoRoot() walk-up), so it must never be bundled.
  bindingsCache = (await import(/* webpackIgnore: true */ pathToFileURL(path).href)) as unknown as VeloBindings;
  return bindingsCache;
}

/** Network id for chain reads. Defaults to preview, the hackathon network. */
export function networkId(): string {
  return getEnv("MIDNIGHT_NETWORK_ID") ?? "preview";
}

export function indexerUrl(): string {
  return getEnv("MIDNIGHT_INDEXER_HTTP") ?? `https://indexer.${networkId()}.midnight.network/api/v3/graphql`;
}

/**
 * The deployed address, from the artifact `deploy/deploy-contract.ts`
 * writes on a successful deploy. Read from disk rather than hardcoded so
 * a redeploy to another network does not need a code change.
 */
export function contractAddress(): string {
  const override = getEnv("VELO_CONTRACT_ADDRESS");
  if (override) return override;

  const net = networkId();
  const path = join(repoRoot(), "deploy", "managed-shim", `velo-contract.${net}.json`);
  if (!existsSync(path)) {
    throw new ChainReadError(
      `No deployed contract address for network ${JSON.stringify(net)} (looked for ${path}). Deploy with \`bun run deploy/deploy-contract.ts\`, or set VELO_CONTRACT_ADDRESS.`,
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { contractAddress?: string };
  if (!parsed.contractAddress) {
    throw new ChainReadError(`${path} does not contain a contractAddress field.`);
  }
  return parsed.contractAddress;
}

const CONTRACT_STATE_QUERY = `query($a: HexEncoded!) {
  contractAction(address: $a) {
    ... on ContractDeploy { state }
    ... on ContractCall { state }
    ... on ContractUpdate { state }
  }
}`;

/**
 * Hex string to bytes, validated. Variable-length (a contract state blob,
 * not a fixed-width hash), but as strict as `hexToBytes32` in
 * `witness/witnesses.ts` is on the write path: reject, never repair.
 *
 * The previous implementation used `hex.match(/../g)` + `Number.parseInt`,
 * which turned a non-hex pair into `NaN` and let `Uint8Array.from` coerce it
 * to `0x00`, and silently dropped an odd trailing nibble. That is a decoder
 * that answers confidently about bytes the chain never returned — the same
 * class of silent-default defect as the verdict-index decode (red team F19),
 * on the half that fix did not touch. This is red team F25.
 *
 * Reachable only under a misbehaving or compromised indexer, which the
 * threat model excludes — but "the attacker cannot do this" is a reason to
 * fail closed cheaply, not a reason to trust the input.
 */
function hexToBytes(hex: string): Uint8Array {
  const trimmed = typeof hex === "string" ? hex.trim() : "";
  if (trimmed.length === 0) {
    throw new ChainReadError("Contract state hex is empty.");
  }
  if (!/^([0-9a-fA-F]{2})+$/.test(trimmed)) {
    throw new ChainReadError(
      `Contract state hex is malformed: expected an even-length run of hex characters, got ${trimmed.length} character(s) starting ${JSON.stringify(trimmed.slice(0, 16))}. Refusing to decode — a partially-decoded ledger would read as a real answer.`,
    );
  }
  const out = new Uint8Array(trimmed.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Fetch and decode the deployed contract's ledger state.
 *
 * `fetchImpl` is injectable so tests can exercise decoding without a
 * network, and so a caller with its own retry/timeout policy can supply it.
 */
export async function readOnChainLedger(options?: {
  address?: string;
  fetchImpl?: typeof fetch;
}): Promise<OnChainLedger> {
  const address = options?.address ?? contractAddress();
  const net = networkId();
  const doFetch = options?.fetchImpl ?? fetch;

  setNetworkId(net);

  let payload: { data?: { contractAction?: { state?: string } | null }; errors?: unknown };
  try {
    const res = await doFetch(indexerUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: CONTRACT_STATE_QUERY, variables: { a: address } }),
    });
    if (!res.ok) throw new ChainReadError(`Indexer returned HTTP ${res.status}`);
    payload = (await res.json()) as typeof payload;
  } catch (err) {
    if (err instanceof ChainReadError) throw err;
    throw new ChainReadError(`Could not reach the indexer at ${indexerUrl()}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (payload.errors) {
    throw new ChainReadError(`Indexer query failed: ${JSON.stringify(payload.errors).slice(0, 300)}`);
  }
  const stateHex = payload.data?.contractAction?.state;
  if (!stateHex) {
    throw new ChainReadError(
      `No contract found at ${address} on ${net}. It may not be deployed, or the indexer may not have caught up yet.`,
    );
  }

  const bindings = await loadBindings();
  const contractState = ContractState.deserialize(hexToBytes(stateHex));
  // `.data` (a ChargedState) is what ledger() expects — not the ContractState.
  const led = bindings.ledger((contractState as unknown as { data: unknown }).data);

  const attestations: OnChainAttestation[] = [];
  for (const [key, verdictIndex] of led.caseVerdicts) {
    attestations.push({
      commitment: Buffer.from(key).toString("hex"),
      verdict: verdictFromIndex(verdictIndex),
    });
  }

  return { contractAddress: address, networkId: net, attestationCount: led.attestationCount, attestations };
}

/**
 * Is this commitment attested on-chain, and with what verdict?
 *
 * Returns null when absent. Absence is a real answer, not an error: an
 * un-attested case is the normal state of every case before it is
 * attested.
 */
export async function lookupCommitment(
  commitment: string,
  options?: { address?: string; fetchImpl?: typeof fetch },
): Promise<OnChainAttestation | null> {
  const normalized = commitment.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new ChainReadError(`Commitment must be 64 hex characters, got ${JSON.stringify(commitment)}.`);
  }
  const ledgerState = await readOnChainLedger(options);
  return ledgerState.attestations.find((a) => a.commitment === normalized) ?? null;
}

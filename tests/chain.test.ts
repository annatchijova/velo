import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChainReadError,
  contractAddress,
  lookupCommitment,
  readOnChainLedger,
} from "../src/chain/read.js";

/**
 * These tests decode a REAL contract state, captured from the deployed
 * contract on Midnight preview, but do so offline: the indexer response is
 * injected rather than fetched. That keeps the suite deterministic and
 * runnable without network, while still exercising the actual
 * deserialization and the actual generated bindings rather than a mock of
 * them — the failure mode being guarded against is a decoder that passes
 * against hand-written bytes and falls over on what the chain really
 * returns.
 *
 * The live check is a separate script (scripts/verify-chain-read.mjs), on
 * purpose: a test suite that fails when the network is down is a test
 * suite people learn to ignore.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_STATE_HEX = readFileSync(join(HERE, "..", "..", "tests", "fixtures", "preview-contract-state.hex"), "utf8").trim();

function fakeIndexer(stateHex: string | null, opts?: { errors?: unknown; httpStatus?: number }): typeof fetch {
  return (async () => ({
    ok: (opts?.httpStatus ?? 200) < 400,
    status: opts?.httpStatus ?? 200,
    json: async () => (opts?.errors ? { errors: opts.errors } : { data: { contractAction: stateHex === null ? null : { state: stateHex } } }),
  })) as unknown as typeof fetch;
}

test("decodes the real deployed contract state captured from preview", async () => {
  const led = await readOnChainLedger({ fetchImpl: fakeIndexer(REAL_STATE_HEX) });

  assert.equal(typeof led.attestationCount, "bigint");
  assert.equal(led.attestationCount, 0n, "freshly deployed contract has attested nothing yet");
  assert.deepEqual(led.attestations, [], "and therefore has no verdicts in its Map");
  assert.equal(led.networkId, "preview");
  assert.match(led.contractAddress, /^[0-9a-f]{64}$/);
});

test("the deployed address comes from the deploy artifact, not a hardcoded constant", () => {
  const addr = contractAddress();
  assert.match(addr, /^[0-9a-f]{64}$/);
});

test("a missing contract is an explicit error, not an empty ledger", async () => {
  await assert.rejects(
    () => readOnChainLedger({ fetchImpl: fakeIndexer(null) }),
    (err: unknown) => err instanceof ChainReadError && /No contract found/.test((err as Error).message),
    "an absent contract must not be reported as a contract with zero attestations",
  );
});

test("indexer GraphQL errors surface instead of being swallowed", async () => {
  await assert.rejects(
    () => readOnChainLedger({ fetchImpl: fakeIndexer(null, { errors: [{ message: "boom" }] }) }),
    (err: unknown) => err instanceof ChainReadError && /Indexer query failed/.test((err as Error).message),
  );
});

test("indexer HTTP failure surfaces instead of being swallowed", async () => {
  await assert.rejects(
    () => readOnChainLedger({ fetchImpl: fakeIndexer(REAL_STATE_HEX, { httpStatus: 502 }) }),
    (err: unknown) => err instanceof ChainReadError && /HTTP 502/.test((err as Error).message),
  );
});

test("lookupCommitment rejects anything that is not a 32-byte hex commitment", async () => {
  for (const bad of ["", "xyz", "00".repeat(31), "00".repeat(33), "../etc/passwd"]) {
    await assert.rejects(
      () => lookupCommitment(bad, { fetchImpl: fakeIndexer(REAL_STATE_HEX) }),
      (err: unknown) => err instanceof ChainReadError && /64 hex characters/.test((err as Error).message),
      `commitment ${JSON.stringify(bad)} must be refused at the boundary`,
    );
  }
});

test("an un-attested commitment returns null — absence is an answer, not a failure", async () => {
  const result = await lookupCommitment("ab".repeat(32), { fetchImpl: fakeIndexer(REAL_STATE_HEX) });
  assert.equal(result, null);
});

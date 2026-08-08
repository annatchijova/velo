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
  verdictFromIndex,
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

test("malformed contract state hex is refused, not silently decoded as zero bytes", async () => {
  // Round 6 (F25): `hex.match(/../g)` + `Number.parseInt` turned a non-hex
  // pair into NaN, which `Uint8Array.from` coerced to 0x00, and dropped an
  // odd trailing nibble. A ledger decoded from bytes the chain never
  // returned is worse than a read failure, because it reads as an answer.
  // The write path (`hexToBytes32`) has always rejected these; this is the
  // read path catching up.
  const cases: Array<[string, string]> = [
    ["zz".repeat(16), "non-hex characters"],
    [`${REAL_STATE_HEX}zz`, "non-hex tail on otherwise valid state"],
    [REAL_STATE_HEX.slice(0, -1), "odd length (dangling nibble)"],
    ["0x" + REAL_STATE_HEX, "0x prefix is not hex"],
    ["   ", "whitespace only"],
  ];
  for (const [bad, why] of cases) {
    await assert.rejects(
      () => readOnChainLedger({ fetchImpl: fakeIndexer(bad) }),
      (err: unknown) => err instanceof ChainReadError && /Contract state hex is (malformed|empty)/.test((err as Error).message),
      `${why}: must be refused at the decode boundary`,
    );
  }
});

test("a valid state still decodes after the F25 strictness (no false positives)", async () => {
  // The guard is only worth having if it does not reject the real thing.
  // Note what this fixture is: a snapshot of the contract as *deployed*,
  // before the first attestation landed — so the assertion is that the
  // decode completes and yields a well-formed ledger, not that it carries
  // verdicts. Rejecting valid input is the failure mode being guarded
  // against here; the happy-path test above pins the values.
  const led = await readOnChainLedger({ fetchImpl: fakeIndexer(REAL_STATE_HEX) });
  assert.equal(typeof led.attestationCount, "bigint");
  assert.ok(Array.isArray(led.attestations));
  assert.match(led.contractAddress, /^[0-9a-f]{64}$/);
});

test("verdictFromIndex decodes every index the Compact enum defines", () => {
  assert.equal(verdictFromIndex(0), "NOISE");
  assert.equal(verdictFromIndex(1), "SUSPICION");
  assert.equal(verdictFromIndex(2), "MALICE");
  assert.equal(verdictFromIndex(3), "ABSTAIN");
});

test("verdictFromIndex throws instead of silently defaulting on drift", () => {
  // Round 5: this used to be `VERDICT_BY_INDEX[i] ?? "NOISE"` — an
  // out-of-range index (a future contract enum reorder/extension the
  // frontend's hand-mirrored array was not updated for) silently downgraded
  // to the most benign label instead of surfacing as an error.
  for (const bad of [4, 5, -1, 100]) {
    assert.throws(
      () => verdictFromIndex(bad),
      (err: unknown) => err instanceof ChainReadError && /Unknown verdict index/.test((err as Error).message),
      `index ${bad} must be refused, not silently read as NOISE`,
    );
  }
});

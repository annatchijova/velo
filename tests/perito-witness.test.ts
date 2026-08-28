/**
 * Layer 6 — witness discipline, mirroring witness.test.ts: leaf key is
 * generated once and stable, epoch bounds cross as bigint and are
 * range-checked at the boundary.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyPeritoPrivateState,
  getOrCreateLeafKey,
  checkEpochBound,
  makePeritoWitnesses,
} from "../src/witness/perito_witnesses.js";
import { WitnessError } from "../src/witness/witnesses.js";
import type { ValiditySpan } from "../src/perito/credential.js";

test("getOrCreateLeafKey generates once and is stable thereafter", () => {
  const s0 = emptyPeritoPrivateState();
  const { state: s1, leafKey: k1 } = getOrCreateLeafKey(s0, "VELO-PERITO-005");
  assert.equal(k1.length, 32);
  const { state: s2, leafKey: k2 } = getOrCreateLeafKey(s1, "VELO-PERITO-005");
  assert.deepEqual([...k1], [...k2], "the same perito must get the same key back");
  assert.equal(s1.leafSecretKeys["VELO-PERITO-005"], s2.leafSecretKeys["VELO-PERITO-005"]);
  // A different perito gets a different key.
  const { leafKey: kOther } = getOrCreateLeafKey(s2, "VELO-PERITO-001");
  assert.notDeepEqual([...k1], [...kOther]);
});

test("epoch bounds cross as bigint and are range-checked", () => {
  assert.equal(typeof checkEpochBound(1_700_000_000, "t"), "bigint");
  assert.equal(checkEpochBound(0, "t"), 0n);
  assert.throws(() => checkEpochBound(-1, "t"), WitnessError);
  assert.throws(() => checkEpochBound(4294967296, "t"), WitnessError, "the exclusive upper bound is rejected");
  assert.throws(() => checkEpochBound(1.5, "t"), WitnessError);
});

test("makePeritoWitnesses returns bigint window bounds and a stable leaf key", () => {
  const span: ValiditySpan = { validFromEpoch: 1748736000, validUntilEpoch: 1769904000 };
  const witnesses = makePeritoWitnesses("VELO-PERITO-005", span);
  const ctx = { privateState: emptyPeritoPrivateState() } as any;

  const [, from] = witnesses.credentialValidFrom(ctx);
  const [, until] = witnesses.credentialValidUntil(ctx);
  assert.equal(from, 1748736000n);
  assert.equal(until, 1769904000n);

  const [state1, key1] = witnesses.peritoLeafKey(ctx);
  assert.equal(key1.length, 32);
  const [, key2] = witnesses.peritoLeafKey({ privateState: state1 } as any);
  assert.deepEqual([...key1], [...key2], "leaf key persists across witness calls via returned state");
});

test("makePeritoWitnesses rejects an out-of-range span at construction", () => {
  assert.throws(() => makePeritoWitnesses("VELO-PERITO-005", { validFromEpoch: -1, validUntilEpoch: 10 }), WitnessError);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { runAllDetectors } from "../src/engine/detectors.js";
import type { Artifact } from "../src/engine/evidence.js";
import { score } from "../src/engine/scorer.js";
import { sealBundle } from "../src/seal/bundle.js";
import { createCustodyChain, appendCustodyEvent } from "../src/seal/custody.js";
import {
  WitnessError,
  bytes32ToHex,
  checkCorroborationCount,
  emptyPrivateState,
  getOrCreateSalt,
  hexToBytes32,
  witnessesForBundle,
} from "../src/witness/witnesses.js";

function twoSourceBundle(caseId = "VELO-W-001") {
  const artifacts: Artifact[] = [
    {
      id: "a-mail",
      type: "log",
      timestamp: "2026-08-07T14:20:00Z",
      source: "mail_gateway",
      process: "mail_gateway",
      path: "mail://x",
      entropyMilliBits: 4500,
      markers: ["effect_event", "narrative_poisoning"],
      description: "confession",
      provenanceChain: ["sha256:acq-mail"],
    },
    {
      id: "a-cron",
      type: "registry",
      timestamp: "2026-08-07T14:25:00Z",
      source: "windows_registry",
      process: "windows_registry",
      path: "HKLM\\x",
      entropyMilliBits: 3200,
      markers: ["cause_event", "log_cleared"],
      description: "cron",
      provenanceChain: ["sha256:acq-workstation"],
    },
  ];
  const detectorResults = runAllDetectors(artifacts);
  const result = score({ detectorResults, artifacts, devilAdvocate: "counter-argument", custodyValid: true });
  let chain = createCustodyChain(caseId);
  chain = appendCustodyEvent(chain, "ACQUIRED", "2026-08-07T13:00:00Z", "acquired");
  return sealBundle(caseId, "2026-08-07T15:00:00Z", result, { caseId, artifacts }, chain);
}

test("hexToBytes32 round-trips", () => {
  const hex = "a".repeat(64);
  assert.equal(bytes32ToHex(hexToBytes32(hex, "test")), hex);
});

test("hexToBytes32 rejects wrong length and non-hex", () => {
  assert.throws(() => hexToBytes32("abcd", "test"), WitnessError, "short hex must be rejected");
  assert.throws(() => hexToBytes32("z".repeat(64), "test"), WitnessError, "non-hex must be rejected");
  assert.throws(() => hexToBytes32("a".repeat(66), "test"), WitnessError, "over-long hex must be rejected");
});

test("salt is generated once per case and reused for that case", () => {
  const s0 = emptyPrivateState();
  const { state: s1, salt: first } = getOrCreateSalt(s0, "VELO-W-001");
  const { state: s2, salt: second } = getOrCreateSalt(s1, "VELO-W-001");

  assert.equal(bytes32ToHex(first), bytes32ToHex(second), "same case must reuse its salt, or it can never re-prove");
  assert.equal(s1.salts["VELO-W-001"], s2.salts["VELO-W-001"]);
  assert.equal(s0.salts["VELO-W-001"], undefined, "original state must not be mutated");
});

test("different cases get different salts", () => {
  let state = emptyPrivateState();
  const a = getOrCreateSalt(state, "VELO-W-001");
  state = a.state;
  const b = getOrCreateSalt(state, "VELO-W-002");

  assert.notEqual(
    bytes32ToHex(a.salt),
    bytes32ToHex(b.salt),
    "salt reuse across cases would make identical analyses produce identical public commitments",
  );
});

test("corroboration count is bounded by the circuit's Uint<0..17> and crosses as bigint", () => {
  // bigint, not number: the generated bindings type this witness as
  // returning [PS, bigint]. Asserting the type here because a number
  // would typecheck fine on this side and only fail at the contract.
  assert.equal(typeof checkCorroborationCount(0), "bigint");
  assert.equal(checkCorroborationCount(0), 0n);
  assert.equal(checkCorroborationCount(17), 17n);
  assert.throws(() => checkCorroborationCount(18), WitnessError, "above the circuit bound must be rejected");
  assert.throws(() => checkCorroborationCount(-1), WitnessError, "negative must be rejected");
  assert.throws(() => checkCorroborationCount(1.5), WitnessError, "non-integer must be rejected");
});

test("witnessesForBundle produces 32-byte values matching the bundle", () => {
  const bundle = twoSourceBundle();
  const { witnesses } = witnessesForBundle(emptyPrivateState(), bundle);

  assert.equal(witnesses.bundleFingerprint.length, 32);
  assert.equal(witnesses.custodyTip.length, 32);
  assert.equal(witnesses.bundleSalt.length, 32);

  assert.equal(
    bytes32ToHex(witnesses.bundleFingerprint),
    bundle.analysisFingerprint,
    "the fingerprint witness must be exactly the sealed bundle's fingerprint",
  );
  assert.equal(typeof witnesses.corroborationCount, "bigint");
  assert.equal(witnesses.corroborationCount, BigInt(bundle.corroborationCount));
});

test("custody tip witness changes when the custody chain changes (red team F3)", () => {
  const bundle = twoSourceBundle("VELO-W-003");
  const { witnesses: before } = witnessesForBundle(emptyPrivateState(), bundle);

  // Truncate the custody chain — the exact attack F3 described.
  const truncated = { ...bundle, custodyChain: { ...bundle.custodyChain, events: [] } };
  const { witnesses: after } = witnessesForBundle(emptyPrivateState(), truncated);

  assert.notEqual(
    bytes32ToHex(before.custodyTip),
    bytes32ToHex(after.custodyTip),
    "truncating custody must change the tip, or the on-chain commitment would not anchor it",
  );
  assert.equal(
    bytes32ToHex(before.bundleFingerprint),
    bytes32ToHex(after.bundleFingerprint),
    "the fingerprint alone does NOT change on truncation — which is exactly why the tip must be committed too",
  );
});

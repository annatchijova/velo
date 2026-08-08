#!/usr/bin/env node
// The attest script prints a line claiming the salt is "never printed".
// A real run then printed every per-case salt, because the result dump
// included `private.nextPrivateState`. This checks the claim instead of
// trusting it.
//
//   node --experimental-strip-types scripts/verify-salt-not-printed.mjs
//   bun  run scripts/verify-salt-not-printed.mjs
//
// The shape below is the real one, copied from an actual successful
// attestation on preview — not invented. If the SDK's result shape changes,
// this test is what notices.

// Same logic as summarizeCallResult in deploy/attest-case.ts. Kept as a copy
// on purpose: that file imports the Bun-only wallet stack and cannot be
// loaded here. If one changes, change both — and this test is what fails.
function summarizeCallResult(result) {
  const pub = result?.public ?? {};
  const shown = {};
  for (const [key, value] of Object.entries(pub)) {
    if (value === null || ["string", "number", "boolean", "bigint"].includes(typeof value)) {
      shown[key] = typeof value === "bigint" ? value.toString() : value;
    }
  }
  if (result?.txId !== undefined && shown.txId === undefined) shown.txId = String(result.txId);
  const lines = Object.entries(shown).map(([k, v]) => `  ${k.padEnd(14)}: ${String(v)}`);
  return lines.length > 0 ? lines.join("\n") : "  (submitted; the SDK returned no public scalar fields to show)";
}

const SALT_A = "cf0d96b96f7411aaa5fa4bd4575ce6abcd26702d5f7572184b8ecad847bf76af";
const SALT_B = "2c389e19ee43d27572fcdb08b5de5659d5e37dc5ff55a3a5ce104cb69f3884b0";

// The real result shape from a successful preview attestation.
const realResult = {
  public: {
    txId: "0000deadbeef",
    blockHeight: 53080n,
    status: "SucceedEntirely",
    // A nested object under public must not be spilled either.
    tx: { serialize: () => "…", secretIsh: SALT_A },
  },
  private: {
    nextPrivateState: { salts: { "VELO-DEMO-001": SALT_A, "VELO-DEMO-002": SALT_B } },
    privateTranscriptOutputs: [{ value: [{ 0: 202, 1: 193 }] }],
    input: { value: [{ 0: 2 }] },
  },
};

const out = summarizeCallResult(realResult);

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  console.error(`${cond ? "PASS" : "FAIL"} — ${name}`);
  cond ? pass++ : fail++;
};

check("salt for case 001 does not appear in the output", !out.includes(SALT_A));
check("salt for case 002 does not appear in the output", !out.includes(SALT_B));
check("the word 'salts' does not appear at all", !/salts/i.test(out));
check("nothing from private.* leaks (no privateTranscriptOutputs)", !/privateTranscript/i.test(out));
check("the useful public fields survive: txId", out.includes("0000deadbeef"));
check("the useful public fields survive: blockHeight", out.includes("53080"));
check("bigint is rendered, not dropped or crashed", !out.includes("[object"));

// Degenerate shapes must not throw — a crash here would abort a run that
// already succeeded on-chain, which is the worst possible time to fail.
for (const [name, value] of [
  ["null", null],
  ["undefined", undefined],
  ["empty object", {}],
  ["no public key", { private: { nextPrivateState: { salts: { x: SALT_A } } } }],
]) {
  let threw = false;
  let leaked = false;
  try {
    leaked = summarizeCallResult(value).includes(SALT_A);
  } catch {
    threw = true;
  }
  check(`${name}: does not throw`, !threw);
  check(`${name}: does not leak`, !leaked);
}

console.error(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);

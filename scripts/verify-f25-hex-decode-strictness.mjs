#!/usr/bin/env node
// Reproduction for red team F25's mitigation (docs/RED_TEAM_ROUND_6.md).
//
//   npm run build && node scripts/verify-f25-hex-decode-strictness.mjs
//
// Requires `dist/` (the script imports the built chain reader, not the .ts).
//
// WHAT F25 WAS:
//
// `hexToBytes` in src/chain/read.ts decoded the contract state blob with
// `hex.match(/../g)` + `Number.parseInt(h, 16)`. Two silent failures fell out
// of that:
//
//   1. a non-hex pair parses to NaN, and `Uint8Array.from` coerces NaN to
//      0x00 — so garbage decoded as zero bytes rather than as an error;
//   2. an odd trailing nibble was dropped by the regex without comment.
//
// Either way the reader returns a *ledger object* built from bytes the chain
// never sent. That is strictly worse than a read failure: a failure is
// visibly a failure, whereas a zero-filled ledger reads as "no attestations"
// — the same absence-of-evidence-as-evidence-of-absence confusion the engine
// is careful to avoid, reintroduced at the decode boundary.
//
// This is the read-path half of the defect Round 5's F19 fixed on the
// verdict-index half of the same path.
//
// HOW THIS OBSERVES:
//
// The old decoder is reimplemented verbatim below (OLD SHAPE) so the two
// behaviours can be compared side by side in one run. The point is not that
// the new one throws — a script asserting only that would pass against a
// decoder that throws on *everything*, including valid state. So the last
// prediction is the control: real captured state must still decode.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readOnChainLedger, ChainReadError } from "../dist/src/chain/read.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_STATE_HEX = readFileSync(join(HERE, "..", "tests", "fixtures", "preview-contract-state.hex"), "utf8").trim();

// OLD SHAPE — the pre-F25 decoder, for contrast only.
function hexToBytesOld(hex) {
  const pairs = hex.match(/../g);
  if (!pairs) throw new Error("empty or malformed");
  return Uint8Array.from(pairs.map((h) => Number.parseInt(h, 16)));
}

function fakeIndexer(stateHex) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { contractAction: { state: stateHex } } }),
  });
}

async function refuses(stateHex) {
  try {
    await readOnChainLedger({ fetchImpl: fakeIndexer(stateHex) });
    return false;
  } catch (err) {
    return err instanceof ChainReadError && /Contract state hex is (malformed|empty)/.test(err.message);
  }
}

console.log("A) old decoder on non-hex input — what F25 reported:");
const oldOut = hexToBytesOld("zzzzzzzz");
console.log(`  hexToBytesOld("zzzzzzzz") = [${oldOut.join(", ")}]  (${oldOut.length} bytes, all zero: ${oldOut.every((b) => b === 0)})`);
const oldOdd = hexToBytesOld("abc");
console.log(`  hexToBytesOld("abc")      = [${oldOdd.join(", ")}]  (trailing nibble dropped silently)`);

console.log("\nB) new decoder on the same malformed inputs:");
const malformed = [
  ["zz".repeat(16), "non-hex characters"],
  [`${REAL_STATE_HEX}zz`, "non-hex tail on otherwise valid state"],
  [REAL_STATE_HEX.slice(0, -1), "odd length (dangling nibble)"],
  [`0x${REAL_STATE_HEX}`, "0x prefix"],
  ["   ", "whitespace only"],
];
const results = [];
for (const [bad, why] of malformed) {
  const ok = await refuses(bad);
  results.push(ok);
  console.log(`  ${ok ? "REFUSED " : "ACCEPTED"}  ${why}`);
}

console.log("\nC) control — real captured preview state must still decode:");
let controlHeld = false;
try {
  const led = await readOnChainLedger({ fetchImpl: fakeIndexer(REAL_STATE_HEX) });
  controlHeld = typeof led.attestationCount === "bigint" && Array.isArray(led.attestations);
  console.log(`  decoded: attestationCount=${led.attestationCount} attestations=${led.attestations.length} address=${led.contractAddress.slice(0, 16)}…`);
} catch (err) {
  console.log(`  THREW: ${err.message}`);
}

const allRefused = results.every(Boolean);
console.log(`\nprediction A (old decoder zero-fills garbage):        ${oldOut.every((b) => b === 0) ? "HELD — this was the defect" : "FALSIFIED"}`);
console.log(`prediction B (new decoder refuses all malformed):     ${allRefused ? "HELD" : "FALSIFIED"}`);
console.log(`prediction C (new decoder still accepts real state):  ${controlHeld ? "HELD" : "FALSIFIED"}`);

process.exit(allRefused && controlHeld ? 0 : 1);

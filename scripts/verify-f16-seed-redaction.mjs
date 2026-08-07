#!/usr/bin/env node
// Reproduction for red team F16's mitigation (docs/RED_TEAM_ROUND_4.md).
//
// Imports deploy/redact-seed.ts directly — the real module every deploy/
// entry point uses, not a copy — and checks it against the exact log line
// the dependency emits (`Wallet seed: <hex>` from
// @effectstream/midnight-contracts' buildWalletAndWaitForFunds).
//
//   node --experimental-strip-types scripts/verify-f16-seed-redaction.mjs
//   bun run scripts/verify-f16-seed-redaction.mjs
//
// RUN IT UNDER BUN TOO, and treat that as the one that counts: the deploy
// scripts run under Bun, and the first version of this mitigation passed
// every check here under Node while redacting nothing at all on the first
// real Bun run. Node routes console.* through process.stdout.write; Bun
// does not. Verifying in the wrong runtime is how a mitigation gets
// documented as working while the seed prints in full.
// See docs/RED_TEAM_ROUND_4.md F16 and docs/LEARNINGS.md L2.
import {
  redactSeed,
  withSeedRedaction,
  safeNetworkConfigForLogging,
} from "../deploy/redact-seed.ts";

const FAKE_SEED = "0000000000000000000000000000000000000000000000000000000000000042";
let pass = 0;
let fail = 0;
const check = (name, cond) => {
  console.error(`${cond ? "PASS" : "FAIL"} — ${name}`);
  cond ? pass++ : fail++;
};

check(
  "dependency's `Wallet seed: <hex>` is redacted",
  !String(redactSeed(`Wallet seed: ${FAKE_SEED}`)).includes(FAKE_SEED),
);
check(
  "redaction marker present (line caught, not silently dropped)",
  String(redactSeed(`Wallet seed: ${FAKE_SEED}`)).includes("[REDACTED"),
);
check("unrelated text untouched", redactSeed("Wallet balance: 100") === "Wallet balance: 100");
check("non-string chunk passes through", redactSeed(Buffer.from("x")) instanceof Buffer);

const safe = safeNetworkConfigForLogging({ id: "preview", node: "https://n", walletSeed: FAKE_SEED });
check("walletSeed replaced in the logged config object", !JSON.stringify(safe).includes(FAKE_SEED));
check("other config fields survive redaction", safe.id === "preview" && safe.node === "https://n");

// Capture is installed BEFORE the wrapper so it sits downstream of the
// redaction and observes exactly what would reach a real terminal.
const captured = [];
const real = process.stdout.write.bind(process.stdout);
process.stdout.write = (c) => {
  captured.push(String(c));
  return true;
};

await withSeedRedaction(async () => {
  // console.info is the exact call the dependency makes: it does
  // `const log = console; log.info(\`Wallet seed: ${seed}\`)`.
  console.info(`Wallet seed: ${FAKE_SEED}`);
  console.log(`Wallet seed: ${FAKE_SEED}`);
  process.stdout.write(`Wallet seed: ${FAKE_SEED}\n`);
});
const duringWrapper = captured.join("");

// After restore the same line must reach the stream UNredacted — that is what
// proves the wrapper was removed. Identity comparison cannot work here:
// .bind() returns a new function object on every call.
captured.length = 0;
console.log(`Wallet seed: ${FAKE_SEED}`);
const afterRestore = captured.join("");

try {
  await withSeedRedaction(async () => {
    throw new Error("boom");
  });
} catch {
  /* expected — checking the finally block still restored the writer */
}
captured.length = 0;
console.log(`Wallet seed: ${FAKE_SEED}`);
const afterThrow = captured.join("");

process.stdout.write = real;

check("inside wrapper: raw seed never reaches the stream", !duringWrapper.includes(FAKE_SEED));
check("inside wrapper: the redaction marker is what got written", duringWrapper.includes("[REDACTED"));
check("after restore: writer is the untouched original again", afterRestore.includes(FAKE_SEED));
check("after a throw: writer still restored (finally ran)", afterThrow.includes(FAKE_SEED));

console.error(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);

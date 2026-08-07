#!/usr/bin/env node
// Reproduction for red team F16's mitigation (docs/RED_TEAM_ROUND_4.md).
//
//   bun  run scripts/verify-f16-seed-redaction.mjs      <-- the one that counts
//   node --experimental-strip-types scripts/verify-f16-seed-redaction.mjs
//
// The deploy scripts run under Bun. Run this under Bun.
//
// HOW THIS OBSERVES, AND WHY IT MATTERS (docs/LEARNINGS.md L2):
//
// The first version of this script captured output by replacing
// `process.stdout.write` and inspecting what it received. That works under
// Node, where console.* funnels through the stream method. Under Bun,
// console.* writes to the file descriptor directly, so the capture array
// stayed empty — and an assertion of the form "the raw seed never appears in
// captured output" PASSED, on empty input, while the seed was printing in
// full on the terminal three lines above it. A check that observes nothing
// passes everything.
//
// So this version does not intercept anything. It spawns a child process,
// lets it write to a real pipe, and greps the actual bytes that came out.
// That is runtime-agnostic by construction: it tests the observable output
// rather than a mechanism assumed to carry it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { redactSeed, withSeedRedaction, safeNetworkConfigForLogging } from "../deploy/redact-seed.ts";

const FAKE_SEED = "0000000000000000000000000000000000000000000000000000000000000042";
const SELF = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------- child mode
// Emits, in order: two lines that MUST be redacted (the dependency's own call
// shape is `const log = console; log.info(...)`), one direct stream write,
// then one line after restore that MUST NOT be redacted.
if (process.argv.includes("--child")) {
  await withSeedRedaction(async () => {
    console.info(`Wallet seed: ${FAKE_SEED}`);
    console.log(`Wallet seed: ${FAKE_SEED}`);
    process.stdout.write(`Wallet seed: ${FAKE_SEED}\n`);
    console.log("unrelated line that must survive untouched");
  });
  console.log(`AFTER-RESTORE Wallet seed: ${FAKE_SEED}`);
  process.exit(0);
}

// --------------------------------------------------------------- parent mode
let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  console.error(`${cond ? "PASS" : "FAIL"} — ${name}${cond ? "" : detail ? ` :: ${detail}` : ""}`);
  cond ? pass++ : fail++;
};

// Pure-function checks, no I/O involved.
check("redactSeed rewrites `Wallet seed: <hex>`", !String(redactSeed(`Wallet seed: ${FAKE_SEED}`)).includes(FAKE_SEED));
check("redactSeed leaves unrelated text alone", redactSeed("Wallet balance: 100") === "Wallet balance: 100");
check("redactSeed passes non-strings through", redactSeed(Buffer.from("x")) instanceof Buffer);
const safe = safeNetworkConfigForLogging({ id: "preview", node: "https://n", walletSeed: FAKE_SEED });
check("config object: walletSeed replaced", !JSON.stringify(safe).includes(FAKE_SEED));
check("config object: other fields survive", safe.id === "preview" && safe.node === "https://n");

// The real test: run a child and read the bytes it actually produced.
const isBun = typeof globalThis.Bun !== "undefined";
const args = isBun ? [SELF, "--child"] : ["--experimental-strip-types", SELF, "--child"];
const child = spawnSync(process.execPath, args, { encoding: "utf8" });

if (child.error || child.status !== 0) {
  check("child process ran", false, child.error?.message ?? `exit ${child.status}: ${child.stderr?.slice(0, 300)}`);
} else {
  const out = (child.stdout ?? "") + (child.stderr ?? "");
  const [insideWrapper, afterRestore] = splitAtRestore(out);

  check("child produced output at all (guards against a vacuous pass)", out.trim().length > 0);
  check("inside wrapper: raw seed never appears in the real output", !insideWrapper.includes(FAKE_SEED),
    firstSeedLine(insideWrapper));
  check("inside wrapper: redaction marker present (caught, not dropped)", insideWrapper.includes("[REDACTED"));
  check("inside wrapper: unrelated output survives", insideWrapper.includes("unrelated line that must survive untouched"));
  check("after restore: redaction is off again (wrapper really was removed)", afterRestore.includes(FAKE_SEED));
}

console.error(`\n${pass}/${pass + fail} passed  [runtime: ${isBun ? "bun" : "node"}]`);
process.exit(fail > 0 ? 1 : 0);

function splitAtRestore(out) {
  const idx = out.indexOf("AFTER-RESTORE");
  return idx === -1 ? [out, ""] : [out.slice(0, idx), out.slice(idx)];
}

function firstSeedLine(text) {
  const line = text.split("\n").find((l) => l.includes(FAKE_SEED));
  return line ? `leaked: ${line.trim()}` : "";
}

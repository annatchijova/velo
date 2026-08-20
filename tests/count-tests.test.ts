/**
 * Tests for scripts/count-tests.mjs — the gate that keeps documented test
 * counts honest.
 *
 * These exist because the gate's first CI run failed on its own blind spot.
 * Vitest colourises its summary when it detects CI, so the line the parser
 * looks for arrived as
 *
 *     \e[2m      Tests \e[22m \e[1m\e[32m116 passed\e[39m...
 *
 * and a pattern written against local, uncoloured output did not match. The
 * script refused to report a number it could not read — the right failure —
 * but it should not have needed to fail at all.
 *
 * A gate nobody tests is a gate that discovers its blind spots in production.
 * The colourised samples below are copied from the actual failing CI log
 * (run 32322557497), not invented.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

interface CountTestsModule {
  stripAnsi(s: string): string;
  parse(output: string, pattern: RegExp, runner: string): number;
  ROOT_PATTERN: RegExp;
  FRONTEND_PATTERN: RegExp;
  CLAIMS: Array<{ file: string; key: string; re: RegExp }>;
}

/**
 * Dynamic import so TypeScript does not try to typecheck the plain-JS script,
 * and so importing it here cannot spawn the suites (the script guards its
 * main block on being invoked directly — without that, this test would
 * recurse into itself).
 */
async function load(): Promise<CountTestsModule> {
  const url = new URL("../../scripts/count-tests.mjs", import.meta.url);
  return (await import(url.href)) as CountTestsModule;
}

// Written as an escape, never as a raw control byte: a literal ESC in source
// is invisible in review and easily lost in a copy-paste.
const ESC = "\u001b";

/** Verbatim from the CI log that broke the gate. */
const COLOURED_VITEST_SUMMARY =
  `${ESC}[2m Test Files ${ESC}[22m ${ESC}[1m${ESC}[32m16 passed${ESC}[39m${ESC}[22m${ESC}[90m (16)${ESC}[39m\n` +
  `${ESC}[2m      Tests ${ESC}[22m ${ESC}[1m${ESC}[32m116 passed${ESC}[39m${ESC}[22m${ESC}[90m (116)${ESC}[39m\n`;

const PLAIN_VITEST_SUMMARY = " Test Files  16 passed (16)\n      Tests  116 passed (116)\n";

const NODE_TEST_SUMMARY = "1..115\n# tests 115\n# suites 0\n# pass 115\n# fail 0\n";

test("stripAnsi removes SGR escapes and leaves the text intact", async () => {
  const { stripAnsi } = await load();
  assert.equal(stripAnsi(`${ESC}[1m${ESC}[32m116 passed${ESC}[39m`), "116 passed");
  assert.equal(stripAnsi("nothing to strip"), "nothing to strip");
});

test("stripAnsi does not eat ordinary square brackets", async () => {
  const { stripAnsi } = await load();
  // Docs are full of markdown links and array indices. Stripping those would
  // corrupt the very files this gate reads.
  assert.equal(stripAnsi("see [ROADMAP.md](./ROADMAP.md) and items[0]"), "see [ROADMAP.md](./ROADMAP.md) and items[0]");
});

test("THE REGRESSION: the frontend count parses out of COLOURISED CI output", async () => {
  const { parse, FRONTEND_PATTERN } = await load();
  assert.equal(parse(COLOURED_VITEST_SUMMARY, FRONTEND_PATTERN, "frontend"), 116);
});

test("the frontend count still parses out of plain local output", async () => {
  const { parse, FRONTEND_PATTERN } = await load();
  assert.equal(parse(PLAIN_VITEST_SUMMARY, FRONTEND_PATTERN, "frontend"), 116);
});

test("the root count parses out of node:test TAP output", async () => {
  const { parse, ROOT_PATTERN } = await load();
  assert.equal(parse(NODE_TEST_SUMMARY, ROOT_PATTERN, "root"), 115);
});

test("`# pass` inside a test name cannot be mistaken for the summary line", async () => {
  const { parse, ROOT_PATTERN } = await load();
  // ROOT_PATTERN is anchored to a whole line for exactly this reason.
  const output = "ok 1 - rejects a bad # pass 999 marker\n# pass 115\n# fail 0\n";
  assert.equal(parse(output, ROOT_PATTERN, "root"), 115);
});

test("unreadable output throws instead of guessing a number", async () => {
  const { parse, FRONTEND_PATTERN } = await load();
  // The whole point: "we could not measure" must never be reported as a
  // count. A gate that guesses is worse than no gate.
  assert.throws(
    () => parse("Error: Cannot find module 'vitest'\n", FRONTEND_PATTERN, "frontend (vitest)"),
    /could not read a test count from the frontend \(vitest\) runner/,
  );
});

test("every claim in the registry is well formed", async () => {
  const { CLAIMS } = await load();
  const keys = new Set(["root", "frontend", "total"]);
  assert.ok(CLAIMS.length > 0, "the registry must not be empty");

  for (const claim of CLAIMS) {
    assert.ok(keys.has(claim.key), `${claim.file}: unknown count key ${claim.key}`);
    // Exactly one capture group, or the fixer would rewrite the wrong digits.
    const groups = new RegExp(`${claim.re.source}|`).exec("")?.length ?? 0;
    assert.equal(groups - 1, 1, `${claim.file}: ${claim.re} must have exactly one capture group`);
    assert.ok(!claim.re.global, `${claim.file}: ${claim.re} must not be global (exec would advance lastIndex)`);
  }
});

test("every registered claim site still matches the live documents", async () => {
  const { check } = (await load()) as unknown as {
    check(counts: Record<string, number>, opts: { fix: boolean }): { problems: string[]; checked: number };
  };

  // Deliberately impossible counts: every claim must therefore report a
  // MISMATCH. What must NOT appear is "claim site no longer matches", which
  // means a pattern has gone stale against the prose and silently stopped
  // policing its number.
  //
  // No real count is hardcoded here on purpose. A test that pins the current
  // number would be the very defect this gate exists to prevent — it would go
  // stale the next time someone adds a test, including this one.
  const impossible = { root: -1, frontend: -1, total: -1 };
  const { problems, checked } = check(impossible, { fix: false });

  const missing = problems.filter((p) => p.includes("claim site no longer matches"));
  assert.deepEqual(missing, [], "a claim pattern no longer matches its document");
  assert.ok(checked > 40, `expected the registry to police many sites, got ${checked}`);
  assert.equal(problems.length, checked, "every site should mismatch an impossible count");
});

test("THE FIXER REGRESSION: capture offsets pick the right half of `115/115`", async () => {
  const { CLAIMS } = await load();

  // `| Root suite | 115/115 green |` carries two claims, numerator and
  // denominator. The first fixer located the digits by searching the match
  // text for the captured value, which finds the LAST occurrence — so the
  // numerator claim rewrote the denominator and the row came out `115/123`.
  // Exact capture offsets are what make it unambiguous.
  const text = "| Root suite | 115/115 green |";
  const numerator = /\| Root suite \| (\d+)\/\d+ green \|/d;
  const m = numerator.exec(text);
  assert.ok(m?.indices?.[1], "the d flag must expose capture offsets");
  const [from, to] = m.indices[1];
  assert.equal(text.slice(0, from) + "123" + text.slice(to), "| Root suite | 123/115 green |");

  // And the hazard is live: the registry really does hold such pairs.
  const overlapping = CLAIMS.filter(
    (c) => c.re.source.includes("(\\d+)\\/\\d+") || c.re.source.includes("\\d+\\/(\\d+)"),
  );
  assert.ok(overlapping.length >= 4, `expected numerator/denominator claim pairs, found ${overlapping.length}`);
});

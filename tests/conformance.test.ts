import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalize as canonicalEngine } from "../src/seal/canonical.js";
import { canonicalize as canonicalVerifier } from "../src/seal/verify.js";

/**
 * Red team F8: verify.ts deliberately re-implements canonicalization
 * instead of importing it, so a judge can run that one file with no
 * dependencies. That duplication is a design choice with a real cost —
 * the two copies had already drifted (bigint handling) before anyone
 * noticed, and a drift between them means the same bundle hashes two
 * different ways depending on which tool you run.
 *
 * These vectors pin both implementations to the same output. If someone
 * changes one canonicalizer and not the other, this fails instead of
 * silently splitting the two verifiers apart.
 */

const VECTORS: Array<{ name: string; value: unknown }> = [
  { name: "null", value: null },
  { name: "true", value: true },
  { name: "false", value: false },
  { name: "zero", value: 0 },
  { name: "negative zero collapses to zero", value: -0 },
  { name: "positive integer", value: 42 },
  { name: "negative integer", value: -17 },
  { name: "max safe integer", value: Number.MAX_SAFE_INTEGER },
  { name: "empty string", value: "" },
  { name: "ascii string", value: "hello" },
  { name: "string with quotes and backslash", value: 'a"b\\c' },
  { name: "NFC normalization", value: "café" },
  { name: "empty array", value: [] },
  { name: "nested array", value: [1, [2, [3]]] },
  { name: "empty object", value: {} },
  { name: "object key ordering", value: { b: 1, a: 2, c: 3 } },
  // The F9 case: astral-plane characters sort differently under UTF-16
  // code units vs code points. Both implementations must agree.
  { name: "astral plane key ordering", value: { "\u{1F600}": 1, "": 2, normal: 3 } },
  { name: "CJK ext-B key", value: { "\u{20000}": 1, "�": 2 } },
  { name: "mixed nesting", value: { z: [{ y: 1 }, null], a: { b: [true, false] } } },
  {
    name: "realistic bundle core",
    value: {
      caseId: "VELO-CONF-001",
      verdict: "MALICE",
      score: "19/20",
      corroborationCount: 2,
      detectorsFired: ["temporal", "anti_forensic"],
      devilAdvocate: "counter-argument",
      reasoning: "because",
      evidenceManifest: { caseId: "VELO-CONF-001", artifacts: [] },
    },
  },
];

test("both canonicalizers produce identical output for every vector", () => {
  for (const { name, value } of VECTORS) {
    const fromEngine = canonicalEngine(value);
    const fromVerifier = canonicalVerifier(value);
    assert.equal(
      fromVerifier,
      fromEngine,
      `canonicalizer drift on "${name}": engine produced ${fromEngine}, verifier produced ${fromVerifier}`,
    );
  }
});

test("both canonicalizers produce identical SHA-256 for every vector", () => {
  const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
  for (const { name, value } of VECTORS) {
    assert.equal(sha(canonicalVerifier(value)), sha(canonicalEngine(value)), `hash drift on "${name}"`);
  }
});

test("both canonicalizers reject the same inputs", () => {
  const rejected: Array<{ name: string; value: unknown }> = [
    { name: "float", value: 3.14 },
    { name: "NaN", value: NaN },
    { name: "Infinity", value: Infinity },
    { name: "unsafe integer", value: 9007199254740993 },
    { name: "undefined", value: undefined },
    { name: "function", value: () => 1 },
  ];

  for (const { name, value } of rejected) {
    assert.throws(() => canonicalEngine(value), `engine should reject ${name}`);
    assert.throws(() => canonicalVerifier(value), `verifier should reject ${name}`);
  }
});

test("key ordering is by code point, not UTF-16 code unit (red team F9)", () => {
  // Under UTF-16 code-unit ordering the emoji (surrogate pair, leading
  // unit 0xD83D) sorts BEFORE U+E000. Under code-point ordering it sorts
  // after. This asserts the code-point answer, which is what a Python or
  // Go reimplementation of the verifier would produce.
  const out = canonicalEngine({ "\u{1F600}": 1, "": 2 });
  const posPrivateUse = out.indexOf("");
  const posEmoji = out.indexOf("\u{1F600}");
  assert.ok(posPrivateUse >= 0 && posEmoji >= 0, "both keys should appear in the output");
  assert.ok(posPrivateUse < posEmoji, "U+E000 must sort before U+1F600 under code-point ordering");
});

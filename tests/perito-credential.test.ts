/**
 * Layer 6 — credential parsing/normalization against the REAL corpus.
 *
 * Loads peritos-syntetic/*.json (never memory) and asserts the single-vs-multi
 * span distinction dies at the boundary: 5 profiles normalize to one span,
 * VELO-PERITO-005 to two with the documented gap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizePerito, isoToEpochSeconds, CredentialParseError, type NormalizedPerito } from "../src/perito/credential.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Compiled to dist/tests/, so the project root is two levels up. The corpus
// is plain JSON, never compiled into dist/.
const CORPUS_DIR = path.join(__dirname, "..", "..", "peritos-syntetic");

function loadProfile(file: string): NormalizedPerito {
  return normalizePerito(JSON.parse(readFileSync(path.join(CORPUS_DIR, file), "utf8")));
}

const profileFiles = readdirSync(CORPUS_DIR).filter((f) => /^VELO-PERITO-\d+\.json$/.test(f));

test("all six synthetic profiles parse and normalize", () => {
  assert.equal(profileFiles.length, 6, "expected 6 perito profiles in the corpus");
  for (const f of profileFiles) {
    const p = loadProfile(f);
    assert.match(p.peritoId, /^VELO-PERITO-\d{3}$/);
    assert.ok(p.spans.length >= 1, `${p.peritoId} must have at least one span`);
    assert.ok(p.publicAlias.length > 0);
  }
});

test("five profiles are single-span; VELO-PERITO-005 is the only multi-span", () => {
  const byId = new Map(profileFiles.map((f) => [loadProfile(f).peritoId, loadProfile(f)] as const));
  const multi = [...byId.values()].filter((p) => p.spans.length > 1);
  assert.deepEqual(
    multi.map((p) => p.peritoId),
    ["VELO-PERITO-005"],
    "only VELO-PERITO-005 should normalize to more than one span",
  );
});

test("VELO-PERITO-005 normalizes to two spans with the documented gap", () => {
  const p = loadProfile("VELO-PERITO-005.json");
  assert.equal(p.spans.length, 2);
  const [first, second] = p.spans;
  assert.equal(first!.validFromEpoch, isoToEpochSeconds("2025-06-01T00:00:00Z", "t"));
  assert.equal(first!.validUntilEpoch, isoToEpochSeconds("2026-02-01T00:00:00Z", "t"));
  assert.equal(second!.validFromEpoch, isoToEpochSeconds("2026-06-01T00:00:00Z", "t"));
  assert.equal(second!.validUntilEpoch, isoToEpochSeconds("2029-06-01T00:00:00Z", "t"));
  // The gap: first span ends strictly before second begins.
  assert.ok(first!.validUntilEpoch < second!.validFromEpoch, "there must be a real gap between the two spans");
});

test("epoch parsing is integer seconds and fails closed on garbage", () => {
  assert.equal(isoToEpochSeconds("1970-01-01T00:00:00Z", "t"), 0);
  assert.ok(Number.isInteger(isoToEpochSeconds("2026-04-10T17:30:00Z", "t")));
  assert.throws(() => isoToEpochSeconds("not-a-date", "t"), CredentialParseError);
});

test("a profile with both a single window and credential_periods is rejected as ambiguous", () => {
  const bad = {
    perito_id: "VELO-PERITO-999",
    public_alias: "x",
    jurisdiction_model: "AR",
    specialty: "y",
    valid_from: "2025-01-01T00:00:00Z",
    valid_until: "2026-01-01T00:00:00Z",
    credential_periods: [{ valid_from: "2025-01-01T00:00:00Z", valid_until: "2026-01-01T00:00:00Z" }],
  };
  assert.throws(() => normalizePerito(bad), CredentialParseError);
});

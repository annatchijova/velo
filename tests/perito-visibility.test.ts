/**
 * Layer 6 — own-vs-others visibility against the matched corpus pair.
 *
 * VELO-PERITO-001 owns VELO-011; VELO-PERITO-006 owns VELO-012. Each must see
 * the other's case only as {case_id, name, expected_verdict,
 * expected_corroboration_count} — never artifacts/devil_advocate/peirce_chain/
 * alias. VELO-013 is attested by nobody and must appear in no one's my-cases.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizePerito, type NormalizedPerito } from "../src/perito/credential.js";
import { listPeritoCases, unclaimedQueue, shapeCaseForPerito, type CaseObject } from "../src/perito/visibility.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const CORPUS_DIR = path.join(ROOT, "peritos-syntetic");
const CASES_DIR = path.join(ROOT, "cases");

function loadPerito(id: string): NormalizedPerito {
  return normalizePerito(JSON.parse(readFileSync(path.join(CORPUS_DIR, `${id}.json`), "utf8")));
}
function loadCase(file: string): CaseObject {
  return JSON.parse(readFileSync(path.join(CASES_DIR, file), "utf8")) as CaseObject;
}

const allPeritos = ["VELO-PERITO-001", "VELO-PERITO-002", "VELO-PERITO-003", "VELO-PERITO-004", "VELO-PERITO-005", "VELO-PERITO-006"].map(loadPerito);
const p001 = loadPerito("VELO-PERITO-001");
const p006 = loadPerito("VELO-PERITO-006");
const case011 = loadCase("VELO-011-two-badges.json");
const case012 = loadCase("VELO-012-quiet-resignation.json");
const case013 = loadCase("VELO-013-anonymous-drop.json");

test("an owner sees the full case object", () => {
  const shaped = shapeCaseForPerito(p001, case011);
  assert.equal(shaped.view, "owner");
  if (shaped.view === "owner") assert.ok("artifacts" in shaped.case, "owner keeps artifacts");
});

test("a non-owner sees only the four public fields — no artifacts/devil_advocate/peirce_chain/alias", () => {
  const shaped = shapeCaseForPerito(p001, case012); // 001 does not own 012
  assert.equal(shaped.view, "restricted");
  if (shaped.view === "restricted") {
    assert.deepEqual(Object.keys(shaped.case).sort(), ["case_id", "expected_corroboration_count", "expected_verdict", "name"]);
    const s = JSON.stringify(shaped.case);
    for (const forbidden of ["artifacts", "devil_advocate", "peirce_chain", "public_alias", "Perito-"]) {
      assert.ok(!s.includes(forbidden), `restricted view must not leak ${forbidden}`);
    }
  }
});

test("the matched pair is symmetric", () => {
  assert.equal(shapeCaseForPerito(p006, case012).view, "owner", "006 owns 012");
  assert.equal(shapeCaseForPerito(p006, case011).view, "restricted", "006 does not own 011");
});

test("an unclaimed case appears in nobody's my-cases and carries no verdict in the queue", () => {
  const allCases = [case011, case012, case013];
  for (const perito of allPeritos) {
    const ids = listPeritoCases(perito, allCases, allPeritos).map((s) => s.case.case_id);
    assert.ok(!ids.includes("VELO-013"), `${perito.peritoId} must not see the unclaimed VELO-013`);
  }
  const queue = unclaimedQueue(allPeritos, allCases);
  const entry = queue.find((e) => e.case_id === "VELO-013");
  assert.ok(entry, "VELO-013 belongs in the unclaimed queue");
  assert.deepEqual(Object.keys(entry!).sort(), ["case_id", "name"], "no expected_verdict in the unclaimed queue");
});

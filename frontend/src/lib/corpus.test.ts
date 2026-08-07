import { describe, it, expect } from "vitest";
import { CASES_DIR, PERITOS_DIR, loadAllCases, loadAllPeritos, loadCase } from "@/lib/corpus";

/**
 * Two things are pinned here, both of which have already gone wrong once
 * in this repository.
 *
 * 1. The corpus is read from the repository root, not from a copy inside
 *    the frontend. It used to be a byte-identical copy, which is red team
 *    F5: two copies drifting until the demo's flagship case produced the
 *    wrong verdict. Identical copies are not safe, they are pre-drift.
 *
 * 2. A caseId is a filename component and never a path — red team F1,
 *    where a caller-supplied id reached the filesystem and read files
 *    outside its directory.
 */

describe("the corpus is read from the repository root", () => {
  it("does not read from a copy inside the frontend", () => {
    expect(CASES_DIR).not.toMatch(/frontend/);
    expect(PERITOS_DIR).not.toMatch(/frontend/);
  });

  it("loads the real case corpus", () => {
    const cases = loadAllCases();
    expect(cases.length).toBeGreaterThanOrEqual(13);
    expect(cases.every((c) => typeof c.case_id === "string" && c.case_id.length > 0)).toBe(true);
  });

  it("loads the real expert profiles", () => {
    const peritos = loadAllPeritos();
    expect(peritos.length).toBeGreaterThanOrEqual(6);
    expect(peritos.every((p) => typeof p.perito_id === "string" && p.perito_id.length > 0)).toBe(true);
  });

  it("returns cases in a stable order, so the UI does not reshuffle between loads", () => {
    const first = loadAllCases().map((c) => c.case_id);
    const second = loadAllCases().map((c) => c.case_id);
    expect(second).toEqual(first);
    expect([...first].sort()).toEqual(first);
  });
});

describe("loadCase — a caseId is a filename component, never a path", () => {
  it("loads a real case by id", () => {
    const found = loadCase("VELO-001");
    expect(found).not.toBeNull();
    expect(found!.case_id).toBe("VELO-001");
  });

  it.each([
    "../package",
    "../../etc/passwd",
    "..",
    ".",
    "a/b",
    "a\\b",
    "",
    "VELO 001",
    "%2e%2e%2fpackage",
  ])("refuses %j without touching the filesystem", (bad) => {
    expect(loadCase(bad), `${JSON.stringify(bad)} must not resolve`).toBeNull();
  });

  it("returns null for a well-formed id that simply does not exist", () => {
    expect(loadCase("VELO-DOES-NOT-EXIST")).toBeNull();
  });
});

describe("every case in the corpus is shaped the way the engine expects", () => {
  // Red team F5 was the corpus and the engine speaking different
  // vocabularies. This catches the shape half of that before the UI does.
  it("uses entropyMilliBits and provenanceChain, not the pre-F5 field names", () => {
    for (const c of loadAllCases()) {
      for (const a of c.artifacts ?? []) {
        expect(a, `${c.case_id}/${a.id}: entropy must be integer milli-bits`).toHaveProperty(
          "entropyMilliBits",
        );
        expect(Number.isInteger(a.entropyMilliBits)).toBe(true);
        expect(a, `${c.case_id}/${a.id}: provenanceChain missing`).toHaveProperty("provenanceChain");
        expect(Array.isArray(a.provenanceChain)).toBe(true);
      }
    }
  });

  it("declares an expected verdict on the engine's scale", () => {
    const scale = ["NOISE", "SUSPICION", "MALICE", "ABSTAIN"];
    for (const c of loadAllCases()) {
      expect(scale, `${c.case_id} declares an off-scale verdict`).toContain(c.expected_verdict);
    }
  });
});

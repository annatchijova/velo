/**
 * Red team F5: the demo corpus in cases/*.json used markers and field
 * names that don't exist in the engine's actual Marker union and Artifact
 * shape, so none of it had ever actually been run through
 * runAllDetectors/score. This test closes that gap: it loads every case
 * fixture, runs it through the real engine exactly as an MCP caller would
 * (custody chain derived from custodyEvents, same rule as seal_case in
 * src/mcp/server.ts — no custody events supplied means ABSTAIN), and
 * checks that the documented expected_verdict / expected_corroboration_count
 * / expected_fractures are what the engine actually produces.
 *
 * This is a test on cases/, not on the engine — if a case fails here, the
 * fix is almost always to the case fixture (its markers or its expected_*
 * fields), not to the detectors or the scorer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Artifact } from "../src/engine/evidence.js";
import { runAllDetectors } from "../src/engine/detectors.js";
import { score } from "../src/engine/scorer.js";
import { createCustodyChain, appendCustodyEvent, verifyCustodyChain, type CustodyEventType } from "../src/seal/custody.js";

interface CustodyEventFixture {
  eventType: CustodyEventType;
  timestamp: string;
  detail: string;
}

interface CaseFixture {
  case_id: string;
  name: string;
  expected_verdict: "NOISE" | "SUSPICION" | "MALICE" | "ABSTAIN";
  expected_corroboration_count: number;
  devil_advocate: string;
  custodyEvents: CustodyEventFixture[];
  artifacts: Artifact[];
  expected_fractures: string[];
}

// Compiled to dist/tests/corpus.test.js, so two levels up reaches the
// project root — cases/ is plain JSON, never compiled into dist/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, "..", "..", "cases");

function loadCase(file: string): CaseFixture {
  return JSON.parse(readFileSync(path.join(CASES_DIR, file), "utf8")) as CaseFixture;
}

const caseFiles = readdirSync(CASES_DIR)
  .filter((f) => /^VELO-\d{3}-.+\.json$/.test(f))
  .sort();

assert.ok(caseFiles.length > 0, "no case fixtures found under cases/ — CASES_DIR path is probably wrong");

for (const file of caseFiles) {
  test(`corpus case reproduces its documented verdict: ${file}`, () => {
    const c = loadCase(file);

    // Same derivation as seal_case in src/mcp/server.ts (red team F13):
    // custody validity is derived from a real chain, and no custody
    // events at all means no admissible chain of custody.
    let chain = createCustodyChain(c.case_id);
    for (const ev of c.custodyEvents) {
      chain = appendCustodyEvent(chain, ev.eventType, ev.timestamp, ev.detail);
    }
    const custodyCheck = verifyCustodyChain(chain);
    const custodyValid = custodyCheck.valid && c.custodyEvents.length > 0;

    const detectorResults = runAllDetectors(c.artifacts);
    const result = score({
      detectorResults,
      artifacts: c.artifacts,
      devilAdvocate: c.devil_advocate,
      custodyValid,
    });

    assert.equal(
      result.verdict,
      c.expected_verdict,
      `${c.case_id} (${c.name}): expected ${c.expected_verdict}, got ${result.verdict} — reasoning: ${result.reasoning}`,
    );
    assert.equal(
      result.corroborationCount,
      c.expected_corroboration_count,
      `${c.case_id}: expected_corroboration_count=${c.expected_corroboration_count}, engine computed ${result.corroborationCount} (sources: ${result.corroboratingSources.join(", ") || "none"})`,
    );

    // ABSTAIN short-circuits before any detector runs (score() returns
    // early on !custodyValid), so expected_fractures there is narrative
    // documentation about the custody break, not detector output —
    // nothing to compare it against.
    if (c.expected_verdict !== "ABSTAIN") {
      const actualFractures = [...new Set(detectorResults.flatMap((d) => d.fractures))].sort();
      const expectedFractures = [...c.expected_fractures].sort();
      assert.deepEqual(
        actualFractures,
        expectedFractures,
        `${c.case_id}: fracture mismatch — engine produced [${actualFractures.join(", ")}], case declares [${expectedFractures.join(", ")}]`,
      );
    }
  });
}

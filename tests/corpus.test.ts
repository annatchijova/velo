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
import type { Artifact, CoverageGap } from "../src/engine/evidence.js";
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
  /** Optional. A case that declares none is asserting full coverage. */
  coverageGaps?: CoverageGap[];
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
      // Dropping these here would silently promote a gap-driven ABSTAIN
      // back to NOISE, and the corpus test would then certify the wrong
      // verdict as correct. VELO-014 caught exactly that when it was
      // added: same shape as forgetting them in the seal route.
      coverageGaps: c.coverageGaps ?? [],
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

    // The short-circuit is broken custody, not ABSTAIN as such: score()
    // returns early on !custodyValid, so expected_fractures there is
    // narrative documentation about the break, not detector output.
    //
    // A coverage-gap ABSTAIN is NOT a short circuit — every detector runs
    // to completion and only the final negative is withheld. Skipping the
    // comparison for all ABSTAIN would leave those fractures unchecked,
    // so the condition tests what actually short-circuits.
    if (custodyValid) {
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

/**
 * VELO-010 and VELO-014 are a deliberate pair: same clean artifacts, same
 * valid custody, and the second one declares what it never got to look at.
 * The demo claim is that the difference in verdict comes from the declared
 * gaps and from nothing else. Pin it, so the pair cannot quietly drift into
 * differing for some other reason and still look like it proves the point.
 */
test("VELO-010 and VELO-014 differ only because of declared coverage gaps", () => {
  const run = (c: CaseFixture) => {
    let chain = createCustodyChain(c.case_id);
    for (const ev of c.custodyEvents) {
      chain = appendCustodyEvent(chain, ev.eventType, ev.timestamp, ev.detail);
    }
    return score({
      detectorResults: runAllDetectors(c.artifacts),
      artifacts: c.artifacts,
      devilAdvocate: c.devil_advocate,
      custodyValid: verifyCustodyChain(chain).valid && c.custodyEvents.length > 0,
      coverageGaps: c.coverageGaps ?? [],
    });
  };

  const clean = loadCase("VELO-010-dia-normal.json");
  const gapped = loadCase("VELO-014-lo-que-no-se-miro.json");

  const cleanResult = run(clean);
  const gappedResult = run(gapped);

  // Same evidentiary weight. If these ever diverge, the pair stops being a
  // controlled comparison and the demo is claiming something it isn't.
  assert.equal(
    cleanResult.score.toString(),
    gappedResult.score.toString(),
    "the pair must carry identical scores for the comparison to isolate coverage gaps",
  );
  assert.equal(cleanResult.corroborationCount, gappedResult.corroborationCount);
  assert.equal((clean.coverageGaps ?? []).length, 0, "VELO-010 must declare no gaps");
  assert.ok((gapped.coverageGaps ?? []).length > 0, "VELO-014 must declare gaps or it proves nothing");

  assert.equal(cleanResult.verdict, "NOISE");
  assert.equal(gappedResult.verdict, "ABSTAIN");

  // The reasoning must name the missing sources. A bare "ABSTAIN" tells a
  // reader nothing about what would have settled the question.
  for (const gap of gapped.coverageGaps ?? []) {
    assert.ok(
      gappedResult.reasoning.includes(gap.expected),
      `reasoning does not name the missing source "${gap.expected}"`,
    );
  }

  // Re-running the gapped case with the gaps withheld must return the
  // clean verdict — that is the whole mechanism, stated as an assertion
  // rather than as a comment.
  const withheld = run({ ...gapped, coverageGaps: [] });
  assert.equal(withheld.verdict, "NOISE");
});

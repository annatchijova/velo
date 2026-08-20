/**
 * Phase 2 of the VIGIA port (docs/PORT-FROM-VIGIA.md): caie fracture
 * predicates and the vigia_scorer B-151a cap. Conditions were verified
 * against the live Python before porting (caie.py Rules 9/13/14 and the
 * R3-1 range guard; vigia_scorer.py B-151a) — these tests pin the ported
 * behavior, quoted line for quoted line where the logic is arithmetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, Marker } from "../src/engine/evidence.js";
import {
  detectAntiForensicMarker,
  detectProcessMasquerade,
  detectTemporalViolation,
  runAllDetectors,
} from "../src/engine/detectors.js";
import { score } from "../src/engine/scorer.js";

function artifact(id: string, markers: Marker[], overrides: Partial<Artifact> = {}): Artifact {
  return {
    id,
    type: "file",
    timestamp: "2026-08-07T14:20:00Z",
    source: `src-${id}`,
    process: "n/a",
    path: `/evidence/${id}`,
    entropyMilliBits: 4000,
    markers,
    description: `artifact ${id}`,
    provenanceChain: [`sha256:${id}`],
    ...overrides,
  };
}

test("caie Rule 13: vsc_deleted / firewall_disabled raise DEFENSE_EVASION_ARTIFACT", () => {
  const one = detectAntiForensicMarker([artifact("a", ["vsc_deleted"])]);
  assert.equal(one.fired, true);
  assert.ok(one.fractures.includes("DEFENSE_EVASION_ARTIFACT"));

  const other = detectAntiForensicMarker([artifact("b", ["firewall_disabled"])]);
  assert.ok(other.fractures.includes("DEFENSE_EVASION_ARTIFACT"));

  // Both markers map to ONE fracture type, as in the Python source.
  const both = detectAntiForensicMarker([artifact("c", ["vsc_deleted", "firewall_disabled"])]);
  assert.deepEqual(both.fractures, ["DEFENSE_EVASION_ARTIFACT"]);

  const none = detectAntiForensicMarker([artifact("d", [])]);
  assert.equal(none.fractures.includes("DEFENSE_EVASION_ARTIFACT"), false);
});

test("caie Rule 14: process_injection / pid_hidden raise PROCESS_INJECTION_ANTIFORENSIC", () => {
  const injected = detectProcessMasquerade([artifact("a", ["process_injection"])]);
  assert.equal(injected.fired, true);
  assert.ok(injected.fractures.includes("PROCESS_INJECTION_ANTIFORENSIC"));

  const hidden = detectProcessMasquerade([artifact("b", ["pid_hidden"])]);
  assert.ok(hidden.fractures.includes("PROCESS_INJECTION_ANTIFORENSIC"));

  const clean = detectProcessMasquerade([artifact("c", [])]);
  assert.equal(clean.fired, false);
});

test("R3-1 range guard: epoch sentinels raise TIMESTAMP_OUT_OF_RANGE and never enter the causality compare", () => {
  // The effect nominally precedes the cause, but the cause timestamp is
  // the 1970 epoch sentinel — bad data, not a usable event time. Without
  // the guard this pair would claim a causality violation built on a
  // sentinel value.
  const sentinelCause = artifact("cause", ["cause_event"], { timestamp: "1970-01-01T00:00:00Z" });
  const normalEffect = artifact("effect", ["effect_event"], { timestamp: "2026-08-07T14:00:00Z" });
  const result = detectTemporalViolation([sentinelCause, normalEffect]);

  assert.ok(result.fractures.includes("TIMESTAMP_OUT_OF_RANGE"));
  assert.equal(
    result.fractures.includes("TEMPORAL_CAUSALITY_VIOLATION"),
    false,
    "a sentinel timestamp must be excluded from the causality comparison, not compared",
  );
  assert.ok(result.contributingArtifactIds.includes("cause"));

  // Past the 2038 signed 32-bit ceiling: same treatment.
  const overflow = detectTemporalViolation([artifact("x", [], { timestamp: "2099-01-01T00:00:00Z" })]);
  assert.ok(overflow.fractures.includes("TIMESTAMP_OUT_OF_RANGE"));

  // In-window timestamps raise nothing.
  const fine = detectTemporalViolation([artifact("y", [], { timestamp: "2026-08-07T14:00:00Z" })]);
  assert.equal(fine.fired, false);
});

test("caie Rule 9: sub-second zero runs >= 5 raise TIMESTAMP_PRECISION_ANOMALY (Timestomp signature)", () => {
  // The canonical example from the Python source: 7 zeros.
  const stomped = detectTemporalViolation([artifact("a", [], { timestamp: "2026-04-10T10:00:00.0000000Z" })]);
  assert.ok(stomped.fractures.includes("TIMESTAMP_PRECISION_ANOMALY"));

  // Exactly 5 zeros is the threshold (>= 5).
  const atThreshold = detectTemporalViolation([artifact("b", [], { timestamp: "2026-04-10T10:00:00.00000Z" })]);
  assert.ok(atThreshold.fractures.includes("TIMESTAMP_PRECISION_ANOMALY"));

  // 4 zeros: below threshold.
  const below = detectTemporalViolation([artifact("c", [], { timestamp: "2026-04-10T10:00:00.0000Z" })]);
  assert.equal(below.fractures.includes("TIMESTAMP_PRECISION_ANOMALY"), false);

  // Scheduler jitter (variable sub-seconds): legitimate.
  const jitter = detectTemporalViolation([artifact("d", [], { timestamp: "2026-04-10T10:00:00.1234567Z" })]);
  assert.equal(jitter.fractures.includes("TIMESTAMP_PRECISION_ANOMALY"), false);

  // TRAILING zeros count even after non-zero digits, as in the Python.
  const mixed = detectTemporalViolation([artifact("e", [], { timestamp: "2026-04-10T10:00:00.1200000Z" })]);
  assert.ok(mixed.fractures.includes("TIMESTAMP_PRECISION_ANOMALY"));

  // No fractional part at all: nothing to measure, nothing fires.
  const whole = detectTemporalViolation([artifact("f", [], { timestamp: "2026-04-10T10:00:00Z" })]);
  assert.equal(whole.fired, false);
});

test("B-151a: a lone contributing artifact cannot carry a score past 65/100, and the cap leaves a trace", () => {
  // One artifact tripping four categories — the F2 star scenario. Raw
  // score 1/4 + 3/10 + 1/5 + 1/5 = 19/20 > 65/100, so the cap engages.
  const lone = artifact("solo", ["effect_before_cause", "surgical_deletion", "narrative_poisoning", "process_masquerade"]);
  const capped = score({
    detectorResults: runAllDetectors([lone]),
    artifacts: [lone],
    devilAdvocate: "counter-argument",
    custodyValid: true,
  });
  assert.equal(capped.score.toString(), "13/20", "65/100 in lowest terms");
  assert.match(capped.reasoning, /Single-artifact cap \(VIGIA B-151a\)/);
  assert.notEqual(capped.verdict, "MALICE", "the Daubert gate independently blocks MALICE here");

  // Two contributing artifacts: no cap, whatever the score.
  const a = artifact("a", ["effect_before_cause", "surgical_deletion"]);
  const b = artifact("b", ["narrative_poisoning", "process_masquerade"]);
  const uncapped = score({
    detectorResults: runAllDetectors([a, b]),
    artifacts: [a, b],
    devilAdvocate: "counter-argument",
    custodyValid: true,
  });
  assert.equal(uncapped.score.toString(), "19/20");
  assert.doesNotMatch(uncapped.reasoning, /B-151a/);
});

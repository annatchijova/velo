/**
 * Phase 4 producers (VIGIA port section 6): non-sealable signal producers
 * whose thresholds were verified against the live Python
 * (detect_human_jitter, calculate_human_entropy, audit_grice_maxims).
 *
 * The contract under test: producers SUGGEST and NARRATE, they never
 * decide. Suggestions name existing markers only; floats stay in
 * narrative fields; the engine is unaffected unless a caller explicitly
 * applies a suggested marker — and then the change flows through the
 * normal, sealed input path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Artifact } from "../src/engine/evidence.js";
import { analyzeGriceQuantity, analyzeTimingRegularity, preAnalyze } from "../src/analysis/pre_analysis.js";
import { runAllDetectors } from "../src/engine/detectors.js";
import { score } from "../src/engine/scorer.js";

function artifactAt(id: string, source: string, timestamp: string): Artifact {
  return {
    id,
    type: "log",
    timestamp,
    source,
    process: "n/a",
    path: `/evidence/${id}`,
    entropyMilliBits: 4000,
    markers: [],
    description: `artifact ${id}`,
    provenanceChain: [`sha256:${id}`],
  };
}

/** Five log entries exactly 100s apart — sleep(100) incarnate. */
function uniformLogs(): Artifact[] {
  return [0, 100, 200, 300, 400].map((s, i) =>
    artifactAt(`u${i}`, "system_log", new Date(Date.UTC(2026, 3, 10, 11, 0, s % 60, 0) + Math.floor(s / 60) * 60000).toISOString()),
  );
}

/** Human-jittery timing: irregular gaps from seconds to minutes. */
function jitteryLogs(): Artifact[] {
  const offsets = [0, 7, 130, 145, 600];
  return offsets.map((s, i) => artifactAt(`j${i}`, "workstation", new Date(Date.UTC(2026, 3, 10, 11, 0, 0) + s * 1000).toISOString()));
}

test("machine-regular intervals suggest temporal_entropy_null (VIGIA jitter thresholds)", () => {
  const result = analyzeTimingRegularity(uniformLogs());

  assert.equal(result.suggestedMarkers.length, 1);
  const suggestion = result.suggestedMarkers[0]!;
  assert.equal(suggestion.marker, "temporal_entropy_null");
  assert.deepEqual(suggestion.artifactIds, ["u0", "u1", "u2", "u3", "u4"]);

  // Zero variance trips both hard jitter checks, exactly as in the Python.
  const types = result.narrativeSignals.map((s) => s.type).sort();
  assert.deepEqual(types, ["NON_HUMAN_PRECISION", "PROGRAMMED_DELAY_DETECTED"]);
});

test("human-jittery timing produces no suggestion and no signals", () => {
  const result = analyzeTimingRegularity(jitteryLogs());
  assert.deepEqual(result.suggestedMarkers, []);
  assert.deepEqual(result.narrativeSignals, []);
});

test("regularity is per source: interleaved unrelated sources fabricate no intervals", () => {
  // Two artifacts per source — below VIGIA's 3-timestamp minimum for each,
  // even though the merged sequence would look perfectly regular.
  const artifacts = [
    artifactAt("a1", "src-a", "2026-04-10T11:00:00Z"),
    artifactAt("b1", "src-b", "2026-04-10T11:00:50Z"),
    artifactAt("a2", "src-a", "2026-04-10T11:01:40Z"),
    artifactAt("b2", "src-b", "2026-04-10T11:02:30Z"),
  ];
  const result = analyzeTimingRegularity(artifacts);
  assert.deepEqual(result.suggestedMarkers, []);
});

test("unparseable timestamps are excluded with a note, not silently dropped", () => {
  const artifacts = [...uniformLogs(), artifactAt("bad", "system_log", "not-a-date")];
  const result = analyzeTimingRegularity(artifacts);
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0]!, /bad.*unparseable/);
  // The regular group still gets its suggestion.
  assert.equal(result.suggestedMarkers.length, 1);
});

test("Grice quantity maxims: saturation and scarcity at the exact Python thresholds", () => {
  const saturated = analyzeGriceQuantity(["x".repeat(1001), "normal message"]);
  assert.deepEqual(saturated.narrativeSignals.map((s) => s.type), ["SATURATION"]);

  const atLimit = analyzeGriceQuantity(["x".repeat(1000)]);
  assert.deepEqual(atLimit.narrativeSignals, [], "exactly 1000 chars does not saturate (strict >)");

  // 3 of 5 texts under 10 chars: 0.6 > 0.4 -> scarcity.
  const scarce = analyzeGriceQuantity(["ok", "no", "yes", "a normal length reply", "another normal reply"]);
  assert.deepEqual(scarce.narrativeSignals.map((s) => s.type), ["SCARCITY"]);

  // 2 of 5 = 0.4 exactly: strict >, no signal — parity with the Python.
  const boundary = analyzeGriceQuantity(["ok", "no", "reply one here", "reply two here", "reply three here"]);
  assert.deepEqual(boundary.narrativeSignals, []);
});

test("producers advise, the engine decides: verdict changes only when the caller applies the marker", () => {
  const artifacts = uniformLogs();
  const pre = preAnalyze(artifacts);
  assert.equal(pre.suggestedMarkers.length, 1);

  // Without applying the suggestion the engine sees nothing.
  const before = score({
    detectorResults: runAllDetectors(artifacts),
    artifacts,
    devilAdvocate: "",
    custodyValid: true,
  });
  assert.equal(before.verdict, "NOISE");

  // The caller applies the suggested marker — the ordinary input path.
  const applied = artifacts.map((a) =>
    pre.suggestedMarkers[0]!.artifactIds.includes(a.id) ? { ...a, markers: [...a.markers, pre.suggestedMarkers[0]!.marker] } : a,
  );
  const after = score({
    detectorResults: runAllDetectors(applied),
    artifacts: applied,
    devilAdvocate: "",
    custodyValid: true,
  });
  assert.equal(after.verdict, "SUSPICION", "temporal detector now scores the applied marker");

  // And the producer never touched the original artifacts.
  assert.ok(artifacts.every((a) => a.markers.length === 0));
});

test("determinism: same input, same suggestions and signals", () => {
  const artifacts = uniformLogs();
  assert.deepEqual(preAnalyze(artifacts, ["short", "x".repeat(2000)]), preAnalyze(artifacts, ["short", "x".repeat(2000)]));
});

test("no sealed-value producer imports the analysis layer", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.join(__dirname, "..", "..", "src");
  for (const dir of ["engine", "seal", "inference"]) {
    for (const file of readdirSync(path.join(srcRoot, dir)).filter((f) => f.endsWith(".ts"))) {
      const content = readFileSync(path.join(srcRoot, dir, file), "utf8");
      assert.ok(
        !content.includes("analysis/"),
        `${dir}/${file} imports the pre-analysis layer — producers must stay out of the decision path`,
      );
    }
  }
});

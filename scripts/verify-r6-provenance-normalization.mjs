#!/usr/bin/env node
// Red team round 6 — induction experiment for finding F20
// (docs/RED_TEAM_ROUND_6.md).
//
// HYPOTHESIS (stated before running): the corroboration gate in
// src/engine/scorer.ts deduplicates independent sources by exact string
// comparison of the provenance root — trimmed, but NOT case-folded and NOT
// whitespace-normalized, unlike the `source` fallback which is lowercased.
// Two artifacts from the SAME physical source whose declared provenance
// roots differ only by letter case are therefore counted as TWO independent
// sources, which can carry a verdict over the Daubert gate
// (corroborationCount >= 2) that a correctly normalized count would hold
// at SUSPICION.
//
// PREDICTION:
//   A) roots "DISK-IMG-01" / "disk-img-01"  -> corroborationCount 2, MALICE
//   B) roots "DISK-IMG-01" / "DISK-IMG-01"  -> corroborationCount 1, SUSPICION
//   C) source fields "Workstation"/"workstation" (no provenance) -> count 1
//      (the source fallback IS lowercased — the asymmetry is the defect)
//
// Run: npm run build && node scripts/verify-r6-provenance-normalization.mjs
import { runAllDetectors } from "../dist/src/engine/detectors.js";
import { score } from "../dist/src/engine/scorer.js";

function artifact(id, provenanceRoot, source, markers) {
  return {
    id,
    type: "log",
    timestamp: "2026-01-01T00:00:00Z",
    source,
    process: "p",
    path: "/x",
    entropyMilliBits: 4000,
    markers,
    description: "synthetic",
    provenanceChain: provenanceRoot ? [provenanceRoot] : [],
  };
}

function run(label, artifacts) {
  const detectorResults = runAllDetectors(artifacts);
  const result = score({
    detectorResults,
    artifacts,
    devilAdvocate: "maybe the admin cleared the logs",
    custodyValid: true,
    coverageGaps: [],
  });
  console.log(
    `${label}\n  score=${result.score.toString()} corroborationCount=${result.corroborationCount} ` +
      `sources=${JSON.stringify(result.corroboratingSources)} verdict=${result.verdict}`,
  );
  return result;
}

// anti_forensic (0.30) + cross_source (0.25) = 0.55 > 0.33 MALICE threshold,
// so the corroboration count alone decides MALICE vs SUSPICION here.
const a1 = artifact("a1", "DISK-IMG-01", "ws1", ["log_cleared"]);
const a2 = artifact("a2", "disk-img-01", "ws1", ["log_vs_memory"]);
const a3 = artifact("a3", "DISK-IMG-01", "ws1", ["log_vs_memory"]);
const b1 = artifact("b1", null, "Workstation", ["log_cleared"]);
const b2 = artifact("b2", null, "workstation", ["log_vs_memory"]);

const A = run("A) same physical source, provenance roots differ only by case:", [a1, a2]);
const B = run("B) control — identical provenance roots:", [a1, a3]);
const C = run("C) source-field fallback IS case-folded (asymmetry check):", [b1, b2]);

const predictionA = A.corroborationCount === 2 && A.verdict === "MALICE";
const predictionB = B.corroborationCount === 1 && B.verdict === "SUSPICION";
const predictionC = C.corroborationCount === 1;

console.log();
console.log(`prediction A (case variants count as 2 sources, MALICE): ${predictionA ? "HELD" : "FALSIFIED"}`);
console.log(`prediction B (identical roots count as 1, SUSPICION):    ${predictionB ? "HELD" : "FALSIFIED"}`);
console.log(`prediction C (source fallback dedupes case variants):    ${predictionC ? "HELD" : "FALSIFIED"}`);
process.exit(predictionA && predictionB && predictionC ? 0 : 1);

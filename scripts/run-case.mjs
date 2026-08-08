#!/usr/bin/env node
// Run one corpus case — or all 14 — through the real engine, from the CLI.
//
//   npm run build
//   node scripts/run-case.mjs                 # all 14, one line each
//   node scripts/run-case.mjs VELO-001        # one case, in full
//   node scripts/run-case.mjs VELO-001 --seal # ...and seal it to local-cases/
//
// This is the same path the MCP server and the frontend take: the fixture's
// custody events build a real hash-chained custody chain, and custody validity
// is DERIVED from that chain rather than declared (red team F13). A case with
// no custody events at all has no admissible chain, so it abstains no matter
// what its artifacts show.
//
// Exits non-zero if the engine's verdict disagrees with the verdict the case
// file documents. That makes this a check, not just a viewer — the same
// property tests/corpus.test.ts enforces in CI (red team F5).
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { analyzeCase, sealCase } from "../dist/src/core/operations.js";

const CASES_DIR = resolve(new URL("../cases", import.meta.url).pathname);

function caseFiles() {
  return readdirSync(CASES_DIR)
    .filter((f) => /^VELO-\d{3}-.+\.json$/.test(f))
    .sort();
}

function load(file) {
  return JSON.parse(readFileSync(join(CASES_DIR, file), "utf8"));
}

/** Accepts "VELO-001", "velo-001", or the whole filename. */
function resolveCase(needle) {
  const files = caseFiles();
  const wanted = needle.trim().toLowerCase();
  const hit = files.find((f) => f.toLowerCase() === wanted || f.toLowerCase().startsWith(`${wanted}-`));
  if (!hit) {
    console.error(`No case matches ${JSON.stringify(needle)}. Available:\n  ${files.join("\n  ")}`);
    process.exit(2);
  }
  return hit;
}

function run(c) {
  return analyzeCase({
    caseId: c.case_id,
    artifacts: c.artifacts,
    devilAdvocate: c.devil_advocate,
    custodyEvents: c.custodyEvents,
    // Dropping these would silently promote a gap-driven ABSTAIN back to
    // NOISE — the exact defect VELO-014 exists to demonstrate.
    coverageGaps: c.coverageGaps ?? [],
  });
}

const [needle, ...flags] = process.argv.slice(2);
const seal = flags.includes("--seal");

if (!needle) {
  let mismatches = 0;
  for (const file of caseFiles()) {
    const c = load(file);
    const { scoreResult } = run(c);
    const ok = scoreResult.verdict === c.expected_verdict;
    if (!ok) mismatches++;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${c.case_id.padEnd(8)} ${String(scoreResult.verdict).padEnd(9)} ` +
        `corroboration=${scoreResult.corroborationCount}  ${c.name}`,
    );
  }
  console.log(
    mismatches === 0
      ? `\nAll ${caseFiles().length} cases reproduce the verdict their file documents.`
      : `\n${mismatches} case(s) disagree with their documented verdict.`,
  );
  process.exit(mismatches === 0 ? 0 : 1);
}

const file = resolveCase(needle);
const c = load(file);
const analysis = run(c);
const r = analysis.scoreResult;

console.log(`${c.case_id} — ${c.name}\n${"=".repeat(60)}`);
console.log(`artifacts        : ${c.artifacts.length}`);
console.log(`custody events   : ${c.custodyEvents.length}`);
console.log(`custody valid    : ${analysis.custodyValid} — ${analysis.custodyReason}`);
console.log(`coverage gaps    : ${(c.coverageGaps ?? []).length}`);
console.log(`detectors fired  : ${r.detectorsFired.join(", ") || "none"}`);
console.log(`fractures        : ${[...new Set(analysis.detectorResults.flatMap((d) => d.fractures))].sort().join(", ") || "none"}`);
console.log(`corroboration    : ${r.corroborationCount} (${r.corroboratingSources.join(", ") || "no independent sources"})`);
console.log(`score            : ${r.score.toString()}   <- exact rational, no floats`);
console.log(`\nVERDICT          : ${r.verdict}   (case file documents ${c.expected_verdict})`);
console.log(`\n${r.reasoning}`);

if (seal) {
  const sealed = sealCase({
    caseId: c.case_id,
    artifacts: c.artifacts,
    devilAdvocate: c.devil_advocate,
    custodyEvents: c.custodyEvents,
    coverageGaps: c.coverageGaps ?? [],
  });
  console.log(`\nSealed to ${sealed.savedTo}`);
  console.log(`analysis fingerprint : ${sealed.summary.analysisFingerprint}`);
  console.log(`bundle hash          : ${sealed.summary.bundleHash}`);
  console.log(`\nVerify it offline, with no dependencies:`);
  console.log(`  node dist/src/seal/verify.js ${sealed.savedTo}`);
}

if (r.verdict !== c.expected_verdict) {
  console.error(`\nMISMATCH: the engine says ${r.verdict}, the case file documents ${c.expected_verdict}.`);
  process.exit(1);
}

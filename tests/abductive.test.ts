/**
 * Phase 3 of the VIGIA port: the abductive intent engine, inform-only.
 *
 * Parity fixtures pinned from a live run of the Python original
 * (AbductiveIntentEngine.infer_habit, executed 2026-08-14): winner,
 * integer cost/coverage, alternative ordering (including stable-sort
 * tie-breaks) and the result hash must all match byte for byte.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { HYPOTHESIS_TEMPLATES, inferIntent } from "../src/inference/abductive.js";

test("templates: 32 hypotheses across 12 phases, extracted verbatim", () => {
  const phases = Object.keys(HYPOTHESIS_TEMPLATES);
  assert.equal(phases.length, 12);
  const total = Object.values(HYPOTHESIS_TEMPLATES).reduce((n, hyps) => n + (hyps?.length ?? 0), 0);
  assert.equal(total, 32);
  assert.ok(Object.isFrozen(HYPOTHESIS_TEMPLATES));
});

interface ParityFixture {
  phase: Parameters<typeof inferIntent>[1];
  observed: string[];
  winner: string;
  cost: number;
  coverage: number;
  alternatives: Array<[string, number, number]>;
  resultHash: string;
}

const FIXTURES: ParityFixture[] = [
  {
    phase: "defense_evasion",
    observed: ["timestamp_uniformity", "process_memory_contradiction", "log_gap_intervals"],
    winner: "H_DE_001",
    cost: 0,
    coverage: 100,
    alternatives: [["H_DE_002", 4, 0], ["H_DE_003", 4, 0]],
    resultHash: "2849569e17540b1231133bd00c67c40191b0254b1cbf0142c498f36367caefbf",
  },
  {
    phase: "defense_evasion",
    observed: ["timestamp_uniformity"],
    winner: "H_DE_001",
    cost: 2,
    coverage: 33, // floor(1*100/3) — integer division, exactly as Python's //
    alternatives: [["H_DE_002", 4, 0], ["H_DE_003", 4, 0]],
    resultHash: "f1276cd12318a889d956ba6ec72a7a9ffc344c3df689a32bb902c5ad901f5849",
  },
  {
    phase: "persistence",
    observed: ["registry_modifications", "scheduled_task_creation", "service_installation"],
    winner: "H_PE_001",
    cost: 0,
    coverage: 100,
    // H_PE_002 ties the winner on (cost, coverage); the stable sort keeps
    // template order, exactly as Python's list.sort does.
    alternatives: [["H_PE_002", 0, 100], ["H_PE_003", 2, 100]],
    resultHash: "7f1d351d1863b00927e60b361cd513b87beb7f912334e5bc43f6b8a222b55fef",
  },
  {
    phase: "persistence",
    observed: [],
    winner: "H_PE_001",
    cost: 1,
    coverage: 0,
    alternatives: [["H_PE_002", 3, 0], ["H_PE_003", 5, 0]],
    resultHash: "dc9ff54a1b364926a9d8d7ff57d2f9c3cb572f6ea66efff24c70c0c190b4864c",
  },
  {
    phase: "reconnaissance",
    observed: ["whois_queries", "social_media_osint"],
    winner: "H_RE_002",
    cost: 1,
    coverage: 100,
    // Cost-3/coverage-0 tie broken by required-artifact count.
    alternatives: [["H_RE_003", 3, 0], ["H_RE_001", 3, 0]],
    resultHash: "75d665142879084df5f483e0131f92db024b2e51d6b0b206afbb645da512ad85",
  },
];

for (const f of FIXTURES) {
  test(`parity with the Python engine: ${f.phase} / [${f.observed.join(", ") || "nothing observed"}]`, () => {
    const r = inferIntent(f.observed, f.phase);
    assert.equal(r.winner.hypothesisId, f.winner);
    assert.equal(r.winner.cost, f.cost);
    assert.equal(r.winner.coverageScore, f.coverage);
    assert.deepEqual(
      r.alternatives.map((h) => [h.hypothesisId, h.cost, h.coverageScore]),
      f.alternatives,
    );
    assert.equal(r.resultHash, f.resultHash, "result hash must be byte-identical to the Python engine's");
  });
}

test("a phase with no templates returns the NO_HYPOTHESIS empty result", () => {
  const r = inferIntent(["anything"], "discovery");
  assert.equal(r.winner.hypothesisId, "NO_HYPOTHESIS");
  assert.equal(r.winner.cost, 999);
  assert.deepEqual(r.alternatives, []);
  assert.equal(r.resultHash, "");
});

test("determinism: same input twice yields identical results including the hash", () => {
  const a = inferIntent(["timestamp_uniformity"], "defense_evasion");
  const b = inferIntent(["timestamp_uniformity"], "defense_evasion");
  assert.deepEqual(a, b);
});

/**
 * The isolation boundary, stated as a regression test (port spec 5.4 R6):
 * the decision path must be structurally unable to consult the hypothesis
 * layer. VIGIA enforces the same boundary on its EPISTEMIC_KERNEL.
 */
test("no decision-path module imports the abductive engine (inform-only boundary)", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.join(__dirname, "..", "..", "src");
  const decisionPathFiles = [
    "engine/scorer.ts",
    "engine/detectors.ts",
    "engine/eco.ts",
    "engine/evidence.ts",
    "engine/fraction.ts",
    "core/operations.ts",
    "seal/bundle.ts",
    "seal/canonical.ts",
    "seal/custody.ts",
  ];
  for (const rel of decisionPathFiles) {
    const content = readFileSync(path.join(srcRoot, rel), "utf8");
    assert.ok(
      !content.includes("inference/abductive"),
      `${rel} imports the abductive engine — the hypothesis layer must stay out of the decision path`,
    );
  }
});

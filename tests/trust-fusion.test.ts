/**
 * VIGIA trust_fusion port — the sealable subset, verdict-neutral.
 *
 * Tables are pinned against the live vigia_scorer.py Fractions (read
 * directly from the source before porting). The verdict-neutrality tests
 * are the contract: this layer must never move a verdict.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_CHAIN_FACTOR,
  EPC_FACTOR_TABLE,
  EXP_NEG2_TABLE,
  computeArtifactTrust,
  provenanceDepthFactor,
  temporalTrustFactor,
} from "../src/engine/trust_fusion.js";
import { runAllDetectors } from "../src/engine/detectors.js";
import { analyzeCase } from "../src/core/operations.js";
import type { Artifact, Marker } from "../src/engine/evidence.js";

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

test("tables are pinned to the canonical vigia_scorer.py Fractions", () => {
  assert.equal(EXP_NEG2_TABLE.length, 21);
  assert.equal(EXP_NEG2_TABLE[0]!.toString(), "1/1");
  assert.equal(EXP_NEG2_TABLE[10]!.toString(), "18089/49171");
  assert.equal(EXP_NEG2_TABLE[20]!.toString(), "12957/95740");

  assert.equal(EPC_FACTOR_TABLE.length, 16);
  assert.equal(EPC_FACTOR_TABLE[1]!.toString(), "19/20");
  assert.equal(EPC_FACTOR_TABLE[4]!.toString(), "130321/160000");
  assert.equal(EPC_FACTOR_TABLE[15]!.toString(), "15181127029874798299/32768000000000000000");
  assert.equal(EMPTY_CHAIN_FACTOR.toString(), "1/10");
});

test("provenance depth factor: empty chain 1/10, short chains full trust, long chains decay, clamped at 15", () => {
  assert.equal(provenanceDepthFactor([]).toString(), "1/10");
  assert.equal(provenanceDepthFactor(["  "]).toString(), "1/10", "whitespace-only entries are not provenance");
  assert.equal(provenanceDepthFactor(["a"]).toString(), "1/1");
  assert.equal(provenanceDepthFactor(["a", "b", "c"]).toString(), "1/1");
  assert.equal(provenanceDepthFactor(["a", "b", "c", "d"]).toString(), "19/20");
  const twenty = Array.from({ length: 20 }, (_, i) => `h${i}`);
  assert.equal(provenanceDepthFactor(twenty).toString(), EPC_FACTOR_TABLE[15]!.toString(), "k clamps at 15");
});

test("temporal trust factor: weight mapping and exact bucketed exp(-2x)", () => {
  assert.equal(temporalTrustFactor([]).toString(), "1/1");
  // EFFECT_BEFORE_CAUSE analog, weight 1 -> bucket 20.
  assert.equal(temporalTrustFactor(["TEMPORAL_CAUSALITY_VIOLATION"]).toString(), "12957/95740");
  // STATISTICAL_UNIFORMITY analog, weight 3/5 -> bucket 12.
  assert.equal(temporalTrustFactor(["TEMPORAL_ENTROPY_NULL"]).toString(), "13342/44297");
  // Unlisted temporal fracture takes VIGIA's own default 1/2 -> bucket 10.
  assert.equal(temporalTrustFactor(["TIMESTAMP_UNPARSEABLE"]).toString(), "18089/49171");
  // Max weight wins when several fractures touch the artifact.
  assert.equal(
    temporalTrustFactor(["TEMPORAL_ENTROPY_NULL", "TEMPORAL_CAUSALITY_VIOLATION"]).toString(),
    "12957/95740",
  );
});

test("computeArtifactTrust: effective = provenance x temporal, only temporal contributors penalized", () => {
  const cause = artifact("t-cause", ["cause_event"], { timestamp: "2026-08-07T15:00:00Z" });
  const effect = artifact("t-effect", ["effect_event"], { timestamp: "2026-08-07T14:00:00Z" }); // before the cause
  const bystander = artifact("t-clean", ["log_cleared"], { provenanceChain: ["a", "b", "c", "d"] });

  const artifacts = [cause, effect, bystander];
  const trust = computeArtifactTrust(artifacts, runAllDetectors(artifacts));
  const byId = new Map(trust.map((t) => [t.artifactId, t]));

  // Both causality participants carry the temporal penalty.
  assert.equal(byId.get("t-cause")!.temporalFactor, "12957/95740");
  assert.equal(byId.get("t-effect")!.temporalFactor, "12957/95740");
  assert.equal(byId.get("t-cause")!.effectiveTrust, "12957/95740"); // chain of 1 -> provenance 1/1

  // The anti-forensic contributor is untouched by the TEMPORAL factor but
  // carries its provenance-depth decay (chain of 4 -> 19/20).
  const clean = byId.get("t-clean")!;
  assert.equal(clean.temporalFactor, "1/1");
  assert.deepEqual(clean.temporalFractures, []);
  assert.equal(clean.provenanceFactor, "19/20");
  assert.equal(clean.effectiveTrust, "19/20");
});

test("verdict-neutral: analyzeCase exposes artifactTrust without moving the verdict", () => {
  // A collapse-grade scenario: every artifact has an EMPTY provenance
  // chain (factor 1/10) AND participates in a causality violation
  // (factor 12957/95740). Under VIGIA's gates this mean would cap the
  // verdict; VELO's must not move.
  const input = {
    caseId: "VELO-TRUST-001",
    artifacts: [
      artifact("c", ["cause_event", "log_cleared"], { timestamp: "2026-08-07T15:00:00Z", provenanceChain: [] }),
      artifact("e", ["effect_event", "narrative_poisoning"], { timestamp: "2026-08-07T14:00:00Z", provenanceChain: [] }),
    ],
    devilAdvocate: "A clock skew could explain the inversion.",
    custodyEvents: [{ eventType: "ACQUIRED" as const, timestamp: "2026-08-07T13:00:00Z", detail: "synthetic" }],
  };
  const analysis = analyzeCase(input);

  assert.equal(analysis.artifactTrust.length, 2);
  for (const t of analysis.artifactTrust) {
    assert.equal(t.provenanceFactor, "1/10");
    assert.equal(t.temporalFactor, "12957/95740");
    assert.equal(t.effectiveTrust, "12957/957400");
  }

  // The verdict is exactly what the scorer alone decides — trust metadata
  // reports, it never gates. (MALICE needs >= 2 provenance roots; with
  // empty chains each artifact falls back to its own source, so the
  // corroboration comes from two distinct source fields here.)
  assert.equal(analysis.scoreResult.verdict, "MALICE");

  // Nothing in the trust layer is a float: every factor is a Fraction string.
  for (const t of analysis.artifactTrust) {
    assert.match(t.provenanceFactor, /^\d+\/\d+$/);
    assert.match(t.temporalFactor, /^\d+\/\d+$/);
    assert.match(t.effectiveTrust, /^\d+\/\d+$/);
  }
});

import { ecoOverinterpretation } from "./eco.js";
import type { Artifact, Marker } from "./evidence.js";
import { Fraction } from "./fraction.js";

export interface DetectorResult {
  /** Stable identifier for the detector category. */
  name: string;
  fired: boolean;
  fractures: string[];
  /** Contribution to the aggregate score if fired. Zero if not fired. */
  weight: Fraction;
  /**
   * IDs of the artifacts that actually caused this detector to fire.
   *
   * Red team F2: without this, corroboration was counted as "how many
   * detector categories fired", which a single artifact carrying markers
   * from four categories could satisfy on its own. Corroboration is a
   * claim about independent *sources*, so the scorer needs to know which
   * artifacts contributed, not just that something did.
   */
  contributingArtifactIds: string[];
}

const HAS = (a: Artifact, m: Marker) => a.markers.includes(m);

/** Parses an ISO timestamp, or returns null — never NaN, which compares false against everything. */
function parseTimestamp(ts: string): number | null {
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Effect-before-cause is checked for real (timestamp comparison), not just
 * marker presence — a case can carry a `cause_event`/`effect_event` pair
 * whose actual timestamps we can verify independently of what the artifact
 * claims about itself.
 *
 * Red team F6: an unparseable timestamp used to silently disable this
 * comparison, because `NaN < x` is false. An unreadable timestamp on
 * forensic evidence is itself an anomaly, so it now fails closed and
 * raises its own fracture instead of passing quietly.
 */
export function detectTemporalViolation(artifacts: Artifact[]): DetectorResult {
  const causes = artifacts.filter((a) => HAS(a, "cause_event"));
  const effects = artifacts.filter((a) => HAS(a, "effect_event"));
  const fractures: string[] = [];
  const contributors = new Set<string>();

  for (const a of artifacts) {
    if (parseTimestamp(a.timestamp) === null) {
      fractures.push("TIMESTAMP_UNPARSEABLE");
      contributors.add(a.id);
    }
  }

  for (const cause of causes) {
    for (const effect of effects) {
      const causeMs = parseTimestamp(cause.timestamp);
      const effectMs = parseTimestamp(effect.timestamp);
      if (causeMs === null || effectMs === null) continue; // already reported above
      if (effectMs < causeMs) {
        fractures.push("TEMPORAL_CAUSALITY_VIOLATION");
        contributors.add(cause.id);
        contributors.add(effect.id);
      }
    }
  }
  for (const a of artifacts) {
    if (HAS(a, "effect_before_cause")) {
      fractures.push("TEMPORAL_CAUSALITY_VIOLATION");
      contributors.add(a.id);
    }
    if (HAS(a, "temporal_entropy_null")) {
      fractures.push("TEMPORAL_ENTROPY_NULL");
      contributors.add(a.id);
    }
  }

  const fired = fractures.length > 0;
  return {
    name: "temporal",
    fired,
    fractures: [...new Set(fractures)],
    weight: fired ? new Fraction(1, 4) : Fraction.zero(),
    contributingArtifactIds: [...contributors],
  };
}

/** Shared shape for the marker-driven detectors: map markers to fractures, collect contributors. */
function markerDetector(
  name: string,
  weight: Fraction,
  mapping: ReadonlyArray<readonly [Marker, string]>,
  artifacts: Artifact[],
): DetectorResult {
  const fractures: string[] = [];
  const contributors = new Set<string>();

  for (const [marker, fracture] of mapping) {
    for (const a of artifacts) {
      if (HAS(a, marker)) {
        fractures.push(fracture);
        contributors.add(a.id);
      }
    }
  }

  const fired = fractures.length > 0;
  return {
    name,
    fired,
    fractures: [...new Set(fractures)],
    weight: fired ? weight : Fraction.zero(),
    contributingArtifactIds: [...contributors],
  };
}

export function detectCrossSourceContradiction(artifacts: Artifact[]): DetectorResult {
  return markerDetector(
    "cross_source",
    new Fraction(1, 4),
    [
      ["log_vs_memory", "LOG_MEMORY_CONTRADICTION"],
      ["network_vs_host", "NETWORK_HOST_CONTRADICTION"],
      ["cryptographic_inconsistency", "CRYPTOGRAPHIC_INCONSISTENCY"],
    ],
    artifacts,
  );
}

export function detectAntiForensicMarker(artifacts: Artifact[]): DetectorResult {
  return markerDetector(
    "anti_forensic",
    new Fraction(3, 10),
    [
      ["log_cleared", "LOG_CLEARED"],
      ["timestamps_stomped", "TIMESTAMPS_STOMPED"],
      ["usn_journal_gap", "USN_JOURNAL_GAP"],
      ["mft_entry_anomaly", "MFT_ENTRY_ANOMALY"],
      ["surgical_deletion", "SURGICAL_DELETION"],
    ],
    artifacts,
  );
}

export function detectNarrativePattern(artifacts: Artifact[]): DetectorResult {
  return markerDetector(
    "narrative",
    new Fraction(1, 5),
    [
      ["competence_theater", "COMPETENCE_THEATER"],
      ["narrative_poisoning", "NARRATIVE_POISONING_DETECTED"],
      ["false_flag_attribution", "FALSE_FLAG_ATTRIBUTION"],
      ["documentary_fabrication", "DOCUMENTARY_FABRICATION"],
    ],
    artifacts,
  );
}

export function detectProcessMasquerade(artifacts: Artifact[]): DetectorResult {
  return markerDetector(
    "process",
    new Fraction(1, 5),
    [
      ["process_masquerade", "PROCESS_MASQUERADE"],
      ["unusual_path", "UNUSUAL_PATH"],
      ["parent_anomaly", "PARENT_ANOMALY"],
    ],
    artifacts,
  );
}

/**
 * Set-level Eco fracture, ported from VIGIA (`eco_overinterpretation_check`,
 * wired as its D1 gate use (b)): when more than half of the artifact
 * descriptions carry obvious-bait vocabulary, the scene itself is the
 * anomaly — evidence that screams attack in the majority is more consistent
 * with staging than with a competent adversary. The decision is the integer
 * predicate `2 * hits > n`; the float ratio the Eco module also reports is
 * narrative-only and never read here.
 *
 * This contributes a fracture like any other detector — it does not by
 * itself force a verdict.
 *
 * contributingArtifactIds is deliberately EMPTY: this is a claim about
 * the evidence SET, not about any artifact individually, and the inputs
 * are analyst-written descriptions, not acquired evidence content.
 * Counting the bait-carrying artifacts as corroborating sources would let
 * vocabulary in prose (including negations like "no exploit found" and
 * meta-commentary like "same provenance root") inflate the Daubert
 * corroboration count — verified against the corpus, where it added a
 * clean TPM reading as a fourth "corroborating source" because its
 * description said "the attack is post-boot". The Daubert gate counts
 * independent evidence of the finding; a set-level prose predicate is not
 * that. Which texts tripped the filter remains available to the narrative
 * layer via `ecoOverinterpretation` itself.
 */
export function detectSceneStaging(artifacts: Artifact[]): DetectorResult {
  const eco = ecoOverinterpretation(artifacts.map((a) => a.description));
  const fired = eco.staged;
  return {
    name: "scene_staging",
    fired,
    fractures: fired ? ["POSSIBLE_SCENE_STAGING"] : [],
    weight: fired ? new Fraction(1, 4) : Fraction.zero(),
    contributingArtifactIds: [],
  };
}

export function runAllDetectors(artifacts: Artifact[]): DetectorResult[] {
  return [
    detectTemporalViolation(artifacts),
    detectCrossSourceContradiction(artifacts),
    detectAntiForensicMarker(artifacts),
    detectNarrativePattern(artifacts),
    detectProcessMasquerade(artifacts),
    detectSceneStaging(artifacts),
  ];
}

import type { Artifact, Marker } from "./evidence.js";
import { Fraction } from "./fraction.js";

export interface DetectorResult {
  /** Stable identifier — used as the corroboration "source" name. */
  name: string;
  fired: boolean;
  fractures: string[];
  /** Contribution to the aggregate score if fired. Zero if not fired. */
  weight: Fraction;
}

const HAS = (a: Artifact, m: Marker) => a.markers.includes(m);

/**
 * Effect-before-cause is checked for real (timestamp comparison), not just
 * marker presence — a case can carry a `cause_event`/`effect_event` pair
 * whose actual timestamps we can verify independently of what the artifact
 * claims about itself.
 */
export function detectTemporalViolation(artifacts: Artifact[]): DetectorResult {
  const causes = artifacts.filter((a) => HAS(a, "cause_event"));
  const effects = artifacts.filter((a) => HAS(a, "effect_event"));
  const fractures: string[] = [];

  for (const cause of causes) {
    for (const effect of effects) {
      if (new Date(effect.timestamp).getTime() < new Date(cause.timestamp).getTime()) {
        fractures.push("TEMPORAL_CAUSALITY_VIOLATION");
      }
    }
  }
  if (artifacts.some((a) => HAS(a, "effect_before_cause"))) {
    fractures.push("TEMPORAL_CAUSALITY_VIOLATION");
  }
  if (artifacts.some((a) => HAS(a, "temporal_entropy_null"))) {
    fractures.push("TEMPORAL_ENTROPY_NULL");
  }

  const fired = fractures.length > 0;
  return {
    name: "temporal",
    fired,
    fractures: [...new Set(fractures)],
    weight: fired ? new Fraction(1, 4) : Fraction.zero(),
  };
}

export function detectCrossSourceContradiction(artifacts: Artifact[]): DetectorResult {
  const fractures: string[] = [];
  if (artifacts.some((a) => HAS(a, "log_vs_memory"))) fractures.push("LOG_MEMORY_CONTRADICTION");
  if (artifacts.some((a) => HAS(a, "network_vs_host"))) fractures.push("NETWORK_HOST_CONTRADICTION");
  if (artifacts.some((a) => HAS(a, "cryptographic_inconsistency"))) fractures.push("CRYPTOGRAPHIC_INCONSISTENCY");

  const fired = fractures.length > 0;
  return {
    name: "cross_source",
    fired,
    fractures,
    weight: fired ? new Fraction(1, 4) : Fraction.zero(),
  };
}

export function detectAntiForensicMarker(artifacts: Artifact[]): DetectorResult {
  const fractures: string[] = [];
  if (artifacts.some((a) => HAS(a, "log_cleared"))) fractures.push("LOG_CLEARED");
  if (artifacts.some((a) => HAS(a, "timestamps_stomped"))) fractures.push("TIMESTAMPS_STOMPED");
  if (artifacts.some((a) => HAS(a, "usn_journal_gap"))) fractures.push("USN_JOURNAL_GAP");
  if (artifacts.some((a) => HAS(a, "mft_entry_anomaly"))) fractures.push("MFT_ENTRY_ANOMALY");
  if (artifacts.some((a) => HAS(a, "surgical_deletion"))) fractures.push("SURGICAL_DELETION");

  const fired = fractures.length > 0;
  return {
    name: "anti_forensic",
    fired,
    fractures,
    weight: fired ? new Fraction(3, 10) : Fraction.zero(),
  };
}

export function detectNarrativePattern(artifacts: Artifact[]): DetectorResult {
  const fractures: string[] = [];
  if (artifacts.some((a) => HAS(a, "competence_theater"))) fractures.push("COMPETENCE_THEATER");
  if (artifacts.some((a) => HAS(a, "narrative_poisoning"))) fractures.push("NARRATIVE_POISONING_DETECTED");
  if (artifacts.some((a) => HAS(a, "false_flag_attribution"))) fractures.push("FALSE_FLAG_ATTRIBUTION");
  if (artifacts.some((a) => HAS(a, "documentary_fabrication"))) fractures.push("DOCUMENTARY_FABRICATION");

  const fired = fractures.length > 0;
  return {
    name: "narrative",
    fired,
    fractures,
    weight: fired ? new Fraction(1, 5) : Fraction.zero(),
  };
}

export function detectProcessMasquerade(artifacts: Artifact[]): DetectorResult {
  const fractures: string[] = [];
  if (artifacts.some((a) => HAS(a, "process_masquerade"))) fractures.push("PROCESS_MASQUERADE");
  if (artifacts.some((a) => HAS(a, "unusual_path"))) fractures.push("UNUSUAL_PATH");
  if (artifacts.some((a) => HAS(a, "parent_anomaly"))) fractures.push("PARENT_ANOMALY");

  const fired = fractures.length > 0;
  return {
    name: "process",
    fired,
    fractures,
    weight: fired ? new Fraction(1, 5) : Fraction.zero(),
  };
}

export function runAllDetectors(artifacts: Artifact[]): DetectorResult[] {
  return [
    detectTemporalViolation(artifacts),
    detectCrossSourceContradiction(artifacts),
    detectAntiForensicMarker(artifacts),
    detectNarrativePattern(artifacts),
    detectProcessMasquerade(artifacts),
  ];
}

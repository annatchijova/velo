/**
 * Synthetic evidence artifact types. Every case VELO analyzes during this
 * event is 100% synthetic — no real PII, no copyrighted material.
 */

export type ArtifactType = "file" | "process" | "log" | "network" | "registry" | "dns_record";

export type Marker =
  // temporal
  | "cause_event"
  | "effect_event"
  | "effect_before_cause"
  | "temporal_entropy_null"
  // cross-source contradiction
  | "log_vs_memory"
  | "network_vs_host"
  | "cryptographic_inconsistency"
  // anti-forensic
  | "log_cleared"
  | "timestamps_stomped"
  | "usn_journal_gap"
  | "mft_entry_anomaly"
  | "surgical_deletion"
  // narrative pattern
  | "competence_theater"
  | "narrative_poisoning"
  | "false_flag_attribution"
  | "documentary_fabrication"
  // process/path
  | "process_masquerade"
  | "unusual_path"
  | "parent_anomaly";

export interface Artifact {
  id: string;
  type: ArtifactType;
  /** ISO 8601 UTC timestamp. */
  timestamp: string;
  source: string;
  process: string;
  path: string;
  /**
   * Shannon entropy of the artifact's content, scaled by 1000 and rounded
   * to an integer (e.g. 4.5 bits/byte -> 4500). Display-only, never a
   * decision input by itself — but it still gets sealed into the bundle
   * hash for integrity, and canonicalize() rejects floats, so it's stored
   * as a scaled integer rather than excluded from the hash entirely.
   */
  entropyMilliBits: number;
  markers: Marker[];
  description: string;
  /** Chain of hashes proving this artifact's own provenance, oldest first. */
  provenanceChain: string[];
}

export interface EvidenceManifest {
  caseId: string;
  artifacts: Artifact[];
}

/**
 * A source that should have been examined and was not.
 *
 * This is the difference between "I looked and found nothing" and "I
 * could not look where it mattered". Both used to end as `NOISE`, which
 * conflates a true negative with an unknown — the exact overclaim this
 * system exists to prevent, made by the system itself.
 *
 * Declared by the analyst, not detected: the engine cannot know what was
 * never collected. That makes it the same kind of claim as the custody
 * chain — asserted by a human, then used to constrain what the engine is
 * allowed to conclude.
 */
export interface CoverageGap {
  /** The source that was expected. */
  expected: string;
  /** Why it was not available — rotated, never imaged, destroyed before acquisition. */
  reason: string;
}

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

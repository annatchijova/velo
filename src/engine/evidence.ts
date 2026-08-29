/**
 * Synthetic evidence artifact types. Every case VELO analyzes during this
 * event is 100% synthetic — no real PII, no copyrighted material.
 */

import { z } from "zod";

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
  // anti-forensic: defense evasion (VIGIA caie Rule 13 — vssadmin shadow
  // deletion / host firewall disabled; deliberate, privilege-requiring acts
  // with no benign automated equivalent)
  | "vsc_deleted"
  | "firewall_disabled"
  // narrative pattern
  | "competence_theater"
  | "narrative_poisoning"
  | "false_flag_attribution"
  | "documentary_fabrication"
  // process/path
  | "process_masquerade"
  | "unusual_path"
  | "parent_anomaly"
  // process: injection/hiding (VIGIA caie Rule 14 — a process executing
  // code that is not its on-disk image, or unlinked from the process list)
  | "process_injection"
  | "pid_hidden";

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
 * The validated shape of an artifact at the trust boundary. Unknown keys
 * (e.g. `description_es` on a corpus case) are stripped, so a parsed artifact is
 * exactly the engine's decision-relevant fields — which is also precisely what
 * the seal canonicalizes and the evidence Merkle root commits to. Shared by the
 * MCP boundary (src/mcp/server.ts) and the Layer 7 case_commitment derivation
 * (src/perito/second_opinion.ts) so both strip identically and can never drift
 * into two roots for one evidence set (F8).
 *
 * Red team F6: an unparseable timestamp used to silence the temporal detector
 * (NaN comparisons are always false). Rejected at the edge here; the detector
 * also fails closed independently.
 */
export const artifactSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "process", "log", "network", "registry", "dns_record"]),
  timestamp: z.string().datetime({ offset: true }),
  source: z.string(),
  process: z.string(),
  path: z.string(),
  entropyMilliBits: z.number().int().safe(),
  markers: z.array(z.string()),
  description: z.string(),
  provenanceChain: z.array(z.string()),
});

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

// VELO frontend types — mirror the data corpus and the engine contract.

export type Verdict = "MALICE" | "SUSPICION" | "NOISE" | "ABSTAIN";

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
  timestamp: string;
  source: string;
  process: string;
  path: string;
  entropyMilliBits: number;
  markers: Marker[];
  description: string;
  provenanceChain: string[];
}

export interface CustodyEvent {
  eventType: string;
  timestamp: string;
  detail: string;
}

export interface PeirceChain {
  firstness: string;
  secondness: string;
  thirdness: string;
}

export interface CaseFile {
  case_id: string;
  name: string;
  description: string;
  expected_verdict: Verdict;
  expected_corroboration_count: number;
  devil_advocate: string;
  custodyEvents: CustodyEvent[];
  artifacts: Artifact[];
  expected_fractures: string[];
  peirce_chain: PeirceChain;
  demo_quote: string;
}

export type CredentialPeriod = {
  valid_from: string;
  valid_until: string;
  reason?: string;
};

export type CredentialStatus = "VALID" | "EXPIRED" | "REVOKED";

export interface PeritoFile {
  perito_id: string;
  public_alias: string;
  jurisdiction_model: "AR" | "US" | "agnostic";
  specialty: string;
  accrediting_body_synthetic: string;
  credential_id_synthetic: string;
  matriculation_year: number;
  years_active: number;
  valid_from?: string;
  valid_until?: string;
  credential_periods?: CredentialPeriod[];
  continuing_education_hours_last_cycle: number;
  cases_attested: string[];
  credential_status_at_attestation: Record<string, CredentialStatus>;
  notes: string;
}

// Engine scoring output (mirrors velo/src/engine/scorer.ts).
export interface DetectorResult {
  name: string;
  fired: boolean;
  fractures: string[];
  weight: string; // Fraction as "num/den"
  contributingArtifactIds: string[];
}

export interface ScoreResult {
  verdict: Verdict;
  score: string;
  corroborationCount: number;
  detectorCategoriesFired: number;
  detectorsFired: string[];
  corroboratingSources: string[];
  devilAdvocate: string;
  reasoning: string;
}

export interface SealedBundle {
  caseId: string;
  sealedAt: string;
  verdict: Verdict;
  score: string;
  corroborationCount: number;
  detectorsFired: string[];
  devilAdvocate: string;
  reasoning: string;
  evidenceManifest: { caseId: string; artifacts: Artifact[] };
  custodyChain: {
    caseId: string;
    genesisHash: string;
    events: (CustodyEvent & { seq: number; prevHash: string; entryHash: string })[];
  };
  bundleHash: string;
  analysisFingerprint: string;
}

export interface EngineRun {
  detectorResults: DetectorResult[];
  score: ScoreResult;
  custodyValid: boolean;
  custodyReason?: string;
}

export interface SealResponse {
  bundle: SealedBundle;
  summary: CaseSummary;
  custodyValid: boolean;
}

export interface VerifyResponse {
  internallyConsistent: boolean;
  reasons: string[];
  doesNotEstablish?: string;
  tamperApplied?: string;
}

export interface CaseSummary {
  caseId: string;
  verdict: Verdict;
  sealedAt: string;
  bundleHash: string;
  analysisFingerprint: string;
  corroborationCount: number;
}

export interface AttestResponse {
  commitment: string;
  bundleHash: string;
  analysisFingerprint: string;
  status: "local_pending_contract" | "attested" | "error";
  networkId: string;
  attestedAt: string;
  note: string;
}

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
  // anti-forensic: defense evasion (VIGIA caie Rule 13)
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
  // process: injection/hiding (VIGIA caie Rule 14)
  | "process_injection"
  | "pid_hidden";

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
  description_es?: string;
  provenanceChain: string[];
}

export interface CustodyEvent {
  eventType: string;
  timestamp: string;
  detail: string;
  detail_es?: string;
}

/**
 * A source that should have been examined and was not.
 *
 * Declared by the analyst, never inferred — the engine cannot know what
 * was never collected. That makes it the same kind of human assertion as
 * a custody event, which is why it is named in camelCase alongside
 * `custodyEvents` rather than in the corpus's snake_case metadata style.
 *
 * Mirrors `CoverageGap` in velo/src/engine/evidence.ts.
 */
export interface CoverageGap {
  /** The source that was expected. */
  expected: string;
  expected_es?: string;
  /** Why it was not available — rotated, never imaged, destroyed before acquisition. */
  reason: string;
  reason_es?: string;
}

export interface PeirceChain {
  firstness: string;
  secondness: string;
  thirdness: string;
}

export interface CaseFile {
  case_id: string;
  name: string;
  name_es?: string;
  description: string;
  description_es?: string;
  expected_verdict: Verdict;
  expected_corroboration_count: number;
  devil_advocate: string;
  devil_advocate_es?: string;
  custodyEvents: CustodyEvent[];
  /** Optional. A case that declares none is asserting full coverage. */
  coverageGaps?: CoverageGap[];
  artifacts: Artifact[];
  expected_fractures: string[];
  peirce_chain: PeirceChain;
  peirce_chain_es?: PeirceChain;
  demo_quote: string;
  demo_quote_es?: string;
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
  /** Echoed back so the UI can show what was NOT examined next to the verdict. */
  coverageGaps: CoverageGap[];
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
  coverageGaps: CoverageGap[];
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
  selfCheck?: { internallyConsistent: boolean; reasons: string[]; doesNotEstablish: string };
  attestationPayload?: { analysisFingerprint: string; custodyTip: string };
  persisted?: boolean;
  sealedId?: string;
  persistenceReason?: string;
}

export interface SessionResponse {
  address: string;
  role: "expert" | "none";
  name: string | null;
  peritoRef: string | null;
  apiKey?: string;
  apiKeyNote?: string;
}

export interface SealedAttestationInfo {
  txHash: string;
  commitment: string;
  attestedAt: string | null;
}

export interface SealedLedgerRow {
  id: string;
  caseId: string;
  bundleHash: string;
  verdict: string;
  expertAddress: string;
  sealedAt: string;
  attestation: SealedAttestationInfo | null;
}

export interface SealedLedgerResponse {
  sealed: SealedLedgerRow[];
  total: number;
  configured: boolean;
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

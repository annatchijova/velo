/**
 * Layer 6 operations — the shared behavior behind the perito MCP tools (and,
 * later, the perito dashboard). Interfaces stay thin; the rules live here, so
 * MCP and the frontend cannot drift (the F8 lesson, as in operations.ts).
 *
 * These operations read the SYNTHETIC corpus (peritos-syntetic/, cases/). A
 * real deployment would load accredited peritos from an accreditation
 * authority and hold each perito's secret in the encrypted vault (vault.ts);
 * here, for the demo, per-perito secrets are DERIVED DETERMINISTICALLY from
 * the public profile id (see syntheticLeafSecretKey) so the registry root is
 * reproducible without shipping real secrets. That derivation is clearly
 * synthetic and must never be used for a real credential.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { normalizePerito, type NormalizedPerito } from "../perito/credential.js";
import { checkValidity, type ValidityResult } from "../perito/validity.js";
import { attestationEpochForCase } from "../perito/case_adapter.js";
import { peritoSecretCommitment } from "../perito/secret.js";
import { buildRegistry, type PeritoRegistryEntry } from "../perito/registry.js";
import { listPeritoCases, unclaimedQueue, type CaseObject, type ShapedCase, type UnclaimedCaseEntry } from "../perito/visibility.js";

// dist/src/core/perito_operations.js -> repo root is three levels up.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CORPUS_DIR = path.join(ROOT, "peritos-syntetic");
const CASES_DIR = path.join(ROOT, "cases");

function loadAllPeritos(): NormalizedPerito[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => /^VELO-PERITO-\d+\.json$/.test(f))
    .map((f) => normalizePerito(JSON.parse(readFileSync(path.join(CORPUS_DIR, f), "utf8"))));
}

function loadPerito(peritoId: string): NormalizedPerito | null {
  return loadAllPeritos().find((p) => p.peritoId === peritoId) ?? null;
}

/** caseId -> parsed case object, keyed by the case_id field (not the filename). */
function loadCaseMap(): Map<string, CaseObject> {
  const map = new Map<string, CaseObject>();
  for (const f of readdirSync(CASES_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const obj = JSON.parse(readFileSync(path.join(CASES_DIR, f), "utf8")) as CaseObject;
      if (typeof obj.case_id === "string") map.set(obj.case_id, obj);
    } catch {
      // A non-case JSON in the directory is skipped, not fatal.
    }
  }
  return map;
}

/**
 * DEMO-ONLY deterministic leaf secret key for a synthetic profile. Real
 * peritos generate a CSPRNG key once and keep it in the vault; this exists
 * so the synthetic registry has a reproducible root without real secrets.
 */
function syntheticLeafSecretKey(peritoId: string): string {
  return createHash("sha256").update(`velo:SYNTHETIC-perito-leafkey:v1:${peritoId}`).digest("hex");
}

function syntheticEntry(p: NormalizedPerito): PeritoRegistryEntry {
  const commitment = peritoSecretCommitment({
    peritoId: p.peritoId,
    realName: p.publicAlias, // synthetic: no real name available in the public corpus
    licenseId: p.peritoId,
    leafSecretKey: syntheticLeafSecretKey(p.peritoId),
  });
  return { peritoId: p.peritoId, peritoCommitment: commitment, spans: p.spans };
}

export interface RegistrySummary {
  version: number;
  root: string;
  leafCount: number;
  synthetic: true;
  peritos: { peritoId: string; spanCount: number }[];
}

/** Build the synthetic accredited-examiners registry — root + leaf count, no secrets. */
export function buildSyntheticRegistry(): RegistrySummary {
  const peritos = loadAllPeritos();
  const registry = buildRegistry(peritos.map(syntheticEntry));
  return {
    version: registry.version,
    root: registry.root,
    leafCount: registry.leafCount,
    synthetic: true,
    peritos: peritos.map((p) => ({ peritoId: p.peritoId, spanCount: p.spans.length })),
  };
}

export interface CredentialValidityReport {
  peritoId: string;
  caseId?: string;
  attestationDate: string | null;
  attestationEpoch: number | null;
  declaredStatus?: string;
  validity: ValidityResult;
}

/**
 * Check a perito's credential validity at the attestation date of a case.
 * This is where VELO-006 -> INVALID (gap) and VELO-009/010 -> VALID is
 * observable. Returns a not-found marker as a typed error string rather than
 * throwing, so the MCP layer can surface it cleanly.
 */
export function checkCredentialAtCase(peritoId: string, caseId: string): CredentialValidityReport | { error: string } {
  const perito = loadPerito(peritoId);
  if (!perito) return { error: `No perito profile found with id ${peritoId}` };
  const caseObj = loadCaseMap().get(caseId);
  if (!caseObj) return { error: `No case found with id ${caseId}` };

  const epoch = attestationEpochForCase(caseObj);
  return {
    peritoId,
    caseId,
    attestationEpoch: epoch,
    attestationDate: epoch === null ? null : new Date(epoch * 1000).toISOString(),
    declaredStatus: perito.credentialStatusAtAttestation[caseId],
    validity: checkValidity(perito.spans, epoch),
  };
}

/** Check validity at an explicit ISO date rather than a case. */
export function checkCredentialAtDate(peritoId: string, isoDate: string): CredentialValidityReport | { error: string } {
  const perito = loadPerito(peritoId);
  if (!perito) return { error: `No perito profile found with id ${peritoId}` };
  const ms = Date.parse(isoDate);
  const epoch = Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  return {
    peritoId,
    attestationEpoch: epoch,
    attestationDate: epoch === null ? null : new Date(epoch * 1000).toISOString(),
    validity: checkValidity(perito.spans, epoch),
  };
}

export interface PeritoCasesView {
  peritoId: string;
  cases: ShapedCase[];
  unclaimed: UnclaimedCaseEntry[];
}

/**
 * The "my cases" surface for one examiner: owned cases in full, others'
 * cases restricted to the four public fields, unclaimed cases excluded (and
 * listed separately without a verdict).
 */
export function listPeritoCasesOp(peritoId: string): PeritoCasesView | { error: string } {
  const perito = loadPerito(peritoId);
  if (!perito) return { error: `No perito profile found with id ${peritoId}` };
  const allPeritos = loadAllPeritos();
  const allCases = [...loadCaseMap().values()];
  return {
    peritoId,
    cases: listPeritoCases(perito, allCases, allPeritos),
    unclaimed: unclaimedQueue(allPeritos, allCases),
  };
}

/**
 * Layer 6 — the perito (forensic examiner) credential model.
 *
 * Parses the synthetic examiner profiles in `peritos-syntetic/` into ONE
 * normalized internal shape, so the rest of Layer 6 never has to know
 * whether a profile used the simple `valid_from`/`valid_until` fields or the
 * multi-span `credential_periods` array. The distinction between a
 * single-span and a multi-span credential dies here, at the boundary
 * (validate-at-the-boundary): downstream code only ever sees
 * `NormalizedPerito.spans: ValiditySpan[]`, of length 1 for the common case
 * and length >= 2 for an examiner who lapsed and re-licensed
 * (VELO-PERITO-005).
 *
 * Design note — ONE MERKLE LEAF PER SPAN. A credential with K validity
 * spans becomes K leaves in the accredited-examiners tree, not one leaf
 * carrying an in-circuit array of periods. The gap in VELO-PERITO-005
 * (2026-02-01 -> 2026-06-01) then falls out for free: an attestation dated
 * inside the gap (VELO-006, 2026-04-10) has NO leaf whose window covers it,
 * so the validity check fails on validity, not membership. A re-licensing
 * after a lapse genuinely IS a new credential span, so modeling it as an
 * appended leaf matches the append-only doctrine already used for the
 * custody chain and the tamper-evident log. See docs/layer6-perito-credential.md.
 *
 * DETERMINISM: every value here is integer or string. Dates are integer
 * epoch SECONDS (no float ever reaches a span), so a span can be hashed
 * into a Merkle leaf reproducibly. Sub-second precision is intentionally
 * discarded: credential windows are administrative dates, and keeping
 * milliseconds would put a platform-dependent value into the decision path.
 */

import { z } from "zod";

export const PERITO_CREDENTIAL_VERSION = 1;

export type JurisdictionModel = "AR" | "US" | "agnostic";
export type CredentialStatus = "VALID" | "EXPIRED" | "REVOKED";

/**
 * One licensing window, as integer epoch seconds. Both bounds are
 * INCLUSIVE (an attestation dated exactly on `validFromEpoch` or
 * `validUntilEpoch` is covered) — see checkValidity in validity.ts, where
 * that boundary choice is enforced and documented.
 */
export interface ValiditySpan {
  validFromEpoch: number;
  validUntilEpoch: number;
  /** Optional human note carried from `credential_periods[].reason`. Cosmetic; never hashed. */
  reason?: string;
}

export interface NormalizedPerito {
  peritoId: string;
  publicAlias: string;
  jurisdictionModel: JurisdictionModel;
  specialty: string;
  /** One span for a simple credential; >= 2 for a lapsed-and-re-licensed one. Never empty. */
  spans: ValiditySpan[];
  casesAttested: string[];
  credentialStatusAtAttestation: Record<string, CredentialStatus>;
}

export class CredentialParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialParseError";
  }
}

/**
 * ISO-8601 string to integer epoch seconds, validated. An unparseable
 * timestamp is a defect upstream, not a value to coerce: silently turning
 * it into `NaN` or 0 would either crash a later comparison or, worse,
 * quietly place a credential window at the epoch. Fail closed instead, with
 * a message that names the field.
 */
export function isoToEpochSeconds(iso: string, field: string): number {
  if (typeof iso !== "string") {
    throw new CredentialParseError(`${field}: expected an ISO-8601 string, got ${JSON.stringify(iso)}`);
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new CredentialParseError(`${field}: unparseable ISO-8601 timestamp ${JSON.stringify(iso)}`);
  }
  const seconds = Math.floor(ms / 1000);
  if (!Number.isSafeInteger(seconds)) {
    throw new CredentialParseError(`${field}: epoch seconds ${seconds} for ${JSON.stringify(iso)} exceed the safe integer range`);
  }
  return seconds;
}

const spanSchema = z.object({
  valid_from: z.string(),
  valid_until: z.string(),
  reason: z.string().optional(),
});

/**
 * Accepts BOTH profile shapes. Unknown keys (accrediting_body_synthetic,
 * credential_id_synthetic, matriculation_year, notes, ...) are ignored by
 * default — they are corpus provenance, not part of the credential's
 * decision-relevant state.
 */
const profileSchema = z.object({
  perito_id: z.string(),
  public_alias: z.string(),
  jurisdiction_model: z.enum(["AR", "US", "agnostic"]),
  specialty: z.string(),
  cases_attested: z.array(z.string()).default([]),
  credential_status_at_attestation: z.record(z.enum(["VALID", "EXPIRED", "REVOKED"])).default({}),
  valid_from: z.string().optional(),
  valid_until: z.string().optional(),
  credential_periods: z.array(spanSchema).optional(),
});

function toSpan(validFrom: string, validUntil: string, peritoId: string, where: string, reason?: string): ValiditySpan {
  const validFromEpoch = isoToEpochSeconds(validFrom, `${peritoId} ${where}.valid_from`);
  const validUntilEpoch = isoToEpochSeconds(validUntil, `${peritoId} ${where}.valid_until`);
  if (validUntilEpoch < validFromEpoch) {
    throw new CredentialParseError(
      `${peritoId} ${where}: valid_until (${validUntil}) precedes valid_from (${validFrom}) — a span cannot end before it begins`,
    );
  }
  return reason === undefined ? { validFromEpoch, validUntilEpoch } : { validFromEpoch, validUntilEpoch, reason };
}

/**
 * Parse and normalize one raw profile object. Rejects the ambiguous case
 * where BOTH a single window and `credential_periods` are present rather
 * than silently preferring one — an examiner is either single-span or
 * multi-span, and a profile that is both is a corpus error worth surfacing.
 */
export function normalizePerito(raw: unknown): NormalizedPerito {
  const p = profileSchema.parse(raw);

  const hasSingle = p.valid_from !== undefined || p.valid_until !== undefined;
  const hasPeriods = p.credential_periods !== undefined && p.credential_periods.length > 0;

  let spans: ValiditySpan[];
  if (hasPeriods) {
    if (hasSingle) {
      throw new CredentialParseError(
        `${p.perito_id}: profile has both credential_periods and valid_from/valid_until — ambiguous, pick one`,
      );
    }
    spans = p.credential_periods!.map((s, i) => toSpan(s.valid_from, s.valid_until, p.perito_id, `credential_periods[${i}]`, s.reason));
  } else if (p.valid_from !== undefined && p.valid_until !== undefined) {
    spans = [toSpan(p.valid_from, p.valid_until, p.perito_id, "valid_from/valid_until")];
  } else {
    throw new CredentialParseError(
      `${p.perito_id}: no validity window — needs either valid_from + valid_until, or a non-empty credential_periods`,
    );
  }

  return {
    peritoId: p.perito_id,
    publicAlias: p.public_alias,
    jurisdictionModel: p.jurisdiction_model,
    specialty: p.specialty,
    spans,
    casesAttested: p.cases_attested,
    credentialStatusAtAttestation: p.credential_status_at_attestation,
  };
}

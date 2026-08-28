/**
 * Layer 6 — validity of a perito credential AT THE ATTESTATION DATE.
 *
 * This is the check the synthetic corpus was built to exercise, and it is
 * DELIBERATELY separate from membership (registry.ts). The corpus's key
 * adversarial fixture, VELO-PERITO-005, belongs to the accredited tree
 * (membership always passes) but has a licensing gap; attesting inside that
 * gap must be rejected HERE, on validity, not on membership. Keeping the two
 * checks in different modules keeps that distinction visible.
 *
 * Three states, not two (honest degradation, CLAUDE.md 5.3):
 *   - VALID   — the attestation date falls inside one of the credential's
 *               spans (inclusive on both bounds).
 *   - INVALID — no span covers the date (before the earliest, after the
 *               latest, or in a gap between two spans).
 *   - ABSTAIN — the attestation date is unknown / not an integer epoch. An
 *               unknown date must never silently PASS; abstaining is the
 *               Layer-6 analogue of VELO-004-cadena-rota returning ABSTAIN
 *               for a broken chain of custody rather than a verdict.
 *
 * DETERMINISM: pure integer comparison over epoch seconds. No float, no
 * Fraction needed — the decision is `from <= date <= until` on integers.
 */

import type { ValiditySpan } from "./credential.js";

export type ValidityStatus = "VALID" | "INVALID" | "ABSTAIN";

export interface ValidityResult {
  status: ValidityStatus;
  /** Index of the covering span when VALID, else null. */
  coveringSpanIndex: number | null;
  /** Complete reasoning, not just the first note — a small damage map. */
  reasons: string[];
  /** What a VALID result does and does not establish. */
  establishes: string;
}

const ESTABLISHES =
  "A VALID result establishes only that some accredited examiner's credential window covered this exact attestation date. " +
  "It does not identify which examiner (that stays private), and it does not by itself establish the admissibility of the " +
  "underlying analysis — membership (registry.ts) and the Daubert gate (the sealed bundle) are separate checks.";

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Decide validity of a set of spans at a given attestation date.
 *
 * `attestationEpoch` is integer epoch SECONDS, matching the units produced
 * by credential.ts `isoToEpochSeconds`. Passing `null`/`undefined`/a
 * non-integer yields ABSTAIN, on purpose: the caller that could not
 * determine when the attestation happened must be told "cannot decide",
 * never handed a false PASS.
 */
export function checkValidity(spans: ValiditySpan[], attestationEpoch: number | null | undefined): ValidityResult {
  if (!isInteger(attestationEpoch)) {
    return {
      status: "ABSTAIN",
      coveringSpanIndex: null,
      reasons: [
        `Attestation date is ${attestationEpoch === null || attestationEpoch === undefined ? "unknown" : "not an integer epoch (" + String(attestationEpoch) + ")"} — ` +
          "abstaining rather than deciding validity, because an unknown date must not silently pass.",
      ],
      establishes: ESTABLISHES,
    };
  }

  if (spans.length === 0) {
    return {
      status: "INVALID",
      coveringSpanIndex: null,
      reasons: ["Credential has no validity spans — nothing can cover the attestation date."],
      establishes: ESTABLISHES,
    };
  }

  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!;
    // Inclusive on both bounds: a case dated exactly on a boundary is
    // covered. Documented Daubert choice, not an accident.
    if (attestationEpoch >= s.validFromEpoch && attestationEpoch <= s.validUntilEpoch) {
      return {
        status: "VALID",
        coveringSpanIndex: i,
        reasons: [
          `Attestation epoch ${attestationEpoch} is within span ${i} [${s.validFromEpoch}, ${s.validUntilEpoch}] (inclusive).`,
        ],
        establishes: ESTABLISHES,
      };
    }
  }

  // No covering span — classify WHY, for a useful damage map.
  const earliest = Math.min(...spans.map((s) => s.validFromEpoch));
  const latest = Math.max(...spans.map((s) => s.validUntilEpoch));
  const reasons: string[] = [
    `Attestation epoch ${attestationEpoch} is not covered by any of the ${spans.length} credential span(s).`,
  ];
  if (attestationEpoch < earliest) {
    reasons.push(`It precedes the earliest span start (${earliest}) — the credential had not yet been issued.`);
  } else if (attestationEpoch > latest) {
    reasons.push(`It follows the latest span end (${latest}) — the credential had expired and was not renewed.`);
  } else {
    reasons.push(
      `It falls in a gap between two spans (after ${earliest}, before ${latest}) — the credential had lapsed and was not yet re-licensed at that date.`,
    );
  }
  return { status: "INVALID", coveringSpanIndex: null, reasons, establishes: ESTABLISHES };
}

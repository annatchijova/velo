/**
 * Layer 6 — deriving the ATTESTATION DATE from a case object.
 *
 * The credential must be checked "at the exact date of THIS attestation"
 * (peritos-syntetic/README.md). That date is when the deterministic engine
 * ran over the acquired artifacts — the ANALYZED custody event. This adapter
 * extracts it, so validity.ts can stay pure over an integer epoch and never
 * has to know the shape of a case file.
 *
 * Order of preference, each a deliberate fallback:
 *   1. The ANALYZED custody event timestamp — the moment the sealed analysis
 *      was produced, which is what gets attested.
 *   2. The latest custody event timestamp — if there is no explicit ANALYZED
 *      event, the most recent custody step is the closest available proxy.
 *   3. The latest artifact timestamp — a case with no custody chain at all.
 *   4. null — nothing datable. The caller must then ABSTAIN (validity.ts),
 *      never PASS.
 *
 * Returns integer epoch SECONDS to match credential.ts, or null. Parsing is
 * non-throwing here on purpose: an undatable case is a "cannot decide", which
 * is a valid ABSTAIN input, not an error to raise.
 */

export interface CustodyEventLike {
  eventType?: string;
  timestamp?: string;
}

export interface ArtifactLike {
  timestamp?: string;
}

export interface CaseWithTimestamps {
  case_id?: string;
  custodyEvents?: CustodyEventLike[];
  artifacts?: ArtifactLike[];
}

function toEpochOrNull(iso: string | undefined): number | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const seconds = Math.floor(ms / 1000);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function latestEpoch(timestamps: (string | undefined)[]): number | null {
  const epochs = timestamps.map(toEpochOrNull).filter((e): e is number => e !== null);
  return epochs.length === 0 ? null : Math.max(...epochs);
}

export function attestationEpochForCase(caseObj: CaseWithTimestamps): number | null {
  const custody = caseObj.custodyEvents ?? [];
  const analyzed = custody.find((e) => e.eventType === "ANALYZED");
  if (analyzed !== undefined) {
    const epoch = toEpochOrNull(analyzed.timestamp);
    if (epoch !== null) return epoch;
  }
  const latestCustody = latestEpoch(custody.map((e) => e.timestamp));
  if (latestCustody !== null) return latestCustody;

  return latestEpoch((caseObj.artifacts ?? []).map((a) => a.timestamp));
}

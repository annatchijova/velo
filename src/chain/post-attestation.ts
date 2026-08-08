/**
 * Write-side companion to the chain read (read.ts) — MVP Phase 4.
 *
 * After the CLI proves and submits an attestation on-chain, it may link the
 * record to a deployed VELO app (AC-J3.2, ADR-006) so the sealed ledger can
 * show it. The link is the EXPERT-REPORTED side of the trust model
 * (docs/ADRS_001_006.md, ADR-003): the on-chain facts remain independently
 * readable through the ledger itself, and the verification panel labels the
 * two separately.
 *
 * Strictly best-effort by design: the attestation already succeeded on-chain
 * before any of this runs, so a missing env var, an unreachable API, or an
 * API refusal degrades to a reason string, never to a failed attestation.
 */

export interface PostAttestationInput {
  apiUrl: string | undefined;
  apiKey: string | undefined;
  bundleHash: string;
  txHash: string;
  commitment: string;
  fetchImpl?: typeof fetch;
}

export interface PostAttestationOutcome {
  posted: boolean;
  reason?: string;
}

export async function postAttestationRecord(input: PostAttestationInput): Promise<PostAttestationOutcome> {
  const apiUrl = input.apiUrl?.trim();
  const apiKey = input.apiKey?.trim();
  if (!apiUrl) {
    return { posted: false, reason: "VELO_API_URL not set — skipping the web record." };
  }
  if (!apiKey) {
    return { posted: false, reason: "VELO_API_KEY not set — skipping the web record." };
  }

  const doFetch = input.fetchImpl ?? fetch;
  const endpoint = `${apiUrl.replace(/\/$/, "")}/api/attestations`;
  try {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        bundleHash: input.bundleHash,
        txHash: input.txHash,
        commitment: input.commitment,
      }),
    });
    if (res.ok) return { posted: true };
    return { posted: false, reason: `The web API answered ${res.status}; the on-chain attestation stands regardless.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { posted: false, reason: `Could not reach the web API (${message}); the on-chain attestation stands regardless.` };
  }
}

/**
 * Commitments present `after` but absent `before` — how the CLI identifies
 * its own on-chain commitment without being able to recompute it (Compact's
 * persistentHash is circuit-internal, not reproducible from TypeScript).
 * Hex is compared case-insensitively.
 */
export function newCommitments(
  before: string[],
  after: { commitment: string; verdict: string }[],
): string[] {
  const known = new Set(before.map((c) => c.toLowerCase()));
  return after.map((a) => a.commitment).filter((c) => !known.has(c.toLowerCase()));
}

import type { SealedBundleRow } from "@/db/schema";

/**
 * Shared serialization for the sealed-case ledger (used by both
 * /api/sealed and /api/sealed/:id — one shape, two routes, no drift).
 */
export function serializeSealedRow(row: SealedBundleRow) {
  return {
    id: row.id,
    caseId: row.case_id,
    bundleHash: row.bundle_hash,
    verdict: row.verdict,
    expertAddress: row.expert_address,
    sealedAt: row.sealed_at instanceof Date ? row.sealed_at.toISOString() : row.sealed_at,
    attestation:
      row.attest_tx_hash && row.attest_commitment
        ? {
            txHash: row.attest_tx_hash,
            commitment: row.attest_commitment,
            attestedAt: row.attested_at instanceof Date ? row.attested_at.toISOString() : row.attested_at,
          }
        : null,
  };
}

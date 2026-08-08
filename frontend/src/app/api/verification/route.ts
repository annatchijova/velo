import { NextResponse } from "next/server";
import { readOnChainLedger } from "velo/chain/read.js";
import { verifyBundle } from "velo/seal/bundle.js";
import { verifyCustodyChain } from "velo/seal/custody.js";
import { getAdapter } from "@/db/adapter";

/**
 * Phase 4 (AC-J4.*): verification endpoint joins three independent facts:
 * 1. Internal consistency + custody of the stored bundle (recomputed, never trusted)
 * 2. Expert-reported attestation record (CLI-posted link)
 * 3. Chain-verified ledger state (deployed contract's caseVerdicts)
 *
 * Query parameter `q` accepts either:
 * - A sealed case ID (e.g., "sb-1")
 * - A commitment hash (64 hex chars)
 *
 * Trust classes:
 * - "chain-verified": commitment exists on-chain with matching verdict
 * - "expert-reported": commitment exists in DB but not on-chain, or chain unavailable
 */

export const runtime = "nodejs";

const COMMITMENT_PATTERN = /^[0-9a-f]{64}$/i;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "Query parameter 'q' is required." }, { status: 400 });
  }

  const adapter = getAdapter();
  const isCommitment = COMMITMENT_PATTERN.test(q);

  // Fetch the sealed bundle if we have an adapter and the query is an ID
  let sealedBundle = null;
  if (adapter) {
    if (isCommitment) {
      sealedBundle = await adapter.getSealedBundleByCommitment(q);
    } else {
      sealedBundle = await adapter.getSealedBundle(q);
    }
  }

  // If query is an ID and no bundle found, 404
  if (!isCommitment && !sealedBundle) {
    return NextResponse.json({ found: false, error: "Sealed case not found." }, { status: 404 });
  }

  // Recompute bundle checks if we have a bundle
  let bundleCheck = null;
  let custody = null;
  if (sealedBundle) {
    const bundle = sealedBundle.bundle as any;
    bundleCheck = verifyBundle(bundle);
    custody = verifyCustodyChain(bundle.custodyChain);
  }

  // Check chain ledger
  let onChainStatus: "attested" | "not-found" | "unavailable" = "unavailable";
  let ledgerVerdict: string | null = null;
  let trustClass: "chain-verified" | "expert-reported" = "expert-reported";

  try {
    const ledger = await readOnChainLedger();
    const commitment = sealedBundle?.attest_commitment || (isCommitment ? q : null);

    if (commitment) {
      const match = ledger.attestations.find((a: any) => a.commitment === commitment);
      if (match) {
        onChainStatus = "attested";
        ledgerVerdict = match.verdict;
        // A bare commitment present on-chain is backed by the ledger itself.
        // With a sealed bundle, the on-chain verdict must also agree with the
        // expert's claimed verdict before we call it chain-verified.
        if (!sealedBundle || match.verdict === sealedBundle.verdict) {
          trustClass = "chain-verified";
        }
      } else {
        onChainStatus = "not-found";
      }
    } else {
      onChainStatus = "not-found";
    }
  } catch (err) {
    // Indexer unreachable — degrade gracefully
    onChainStatus = "unavailable";
  }

  // If query is a commitment and nothing found anywhere, 404
  if (isCommitment && !sealedBundle && onChainStatus === "not-found") {
    return NextResponse.json(
      {
        found: false,
        onChain: { status: onChainStatus, trustClass },
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    found: Boolean(sealedBundle),
    source: isCommitment ? "commitment" : "sealed-case",
    sealed: sealedBundle
      ? {
          id: sealedBundle.id,
          caseId: sealedBundle.case_id,
          verdict: sealedBundle.verdict,
          expertAddress: sealedBundle.expert_address,
          sealedAt: sealedBundle.sealed_at.toISOString(),
          bundleHash: sealedBundle.bundle_hash,
        }
      : null,
    bundleCheck: bundleCheck
      ? {
          internallyConsistent: bundleCheck.internallyConsistent,
          reasons: bundleCheck.reasons,
          doesNotEstablish: bundleCheck.doesNotEstablish,
        }
      : null,
    custody: custody
      ? {
          valid: custody.valid,
          reason: custody.reason,
        }
      : null,
    onChain: {
      status: onChainStatus,
      commitment: sealedBundle?.attest_commitment || (isCommitment ? q : null),
      ledgerVerdict,
      trustClass,
    },
  });
}

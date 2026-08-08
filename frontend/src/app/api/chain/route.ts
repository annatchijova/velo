import { NextResponse } from "next/server";
import { ChainReadError, readOnChainLedger } from "velo/chain/read.js";

export const runtime = "nodejs";
export const maxDuration = 30;
// The ledger changes when someone attests; never serve a cached view of it.
export const dynamic = "force-dynamic";

/**
 * What the Midnight ledger actually says right now.
 *
 * Reading is deliberately independent of attesting: no wallet, no proving
 * keys, no proof server, no fees. That means this endpoint keeps working —
 * and the UI keeps showing real on-chain state — on a machine that cannot
 * produce a proof at all.
 *
 * Scope, stated so the UI does not overstate it: this reports what is
 * recorded on-chain. A commitment listed here means *someone attested it*,
 * not that the underlying analysis is true. See docs/RED_TEAM_ROUND_2.md,
 * findings G1 and G3.
 */
export async function GET() {
  try {
    const ledger = await readOnChainLedger();
    return NextResponse.json({
      contractAddress: ledger.contractAddress,
      networkId: ledger.networkId,
      // JSON has no bigint; the count is small but the type is not lossy here.
      attestationCount: ledger.attestationCount.toString(),
      attestations: ledger.attestations,
      doesNotEstablish:
        "This is what the ledger records, nothing more. A commitment appearing here shows that an attestation was published for it — not that the analysis behind it is correct.",
    });
  } catch (err) {
    if (err instanceof ChainReadError) {
      // A read failure is a real, reportable state — an unreachable indexer
      // or an undeployed contract is not the same as "no attestations", and
      // must never render as an empty list.
      return NextResponse.json({ error: err.message, reachable: false }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error reading the chain", reachable: false },
      { status: 500 },
    );
  }
}

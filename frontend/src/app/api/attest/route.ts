import { NextResponse } from "next/server";
import { verifyBundle, attestationPayload } from "velo/seal/bundle.js";
import { computeCommitment } from "@/lib/contract";

export const runtime = "nodejs";
export const maxDuration = 30;

interface AttestBody {
  bundle: {
    caseId: string;
    analysisFingerprint: string;
    bundleHash: string;
    verdict: string;
    corroborationCount?: number;
    custodyChain?: { genesisHash: string; events: unknown[] };
  };
  walletLabel?: string;
  networkId?: string;
}

export async function POST(req: Request) {
  let body: AttestBody;
  try {
    body = (await req.json()) as AttestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.bundle?.analysisFingerprint) {
    return NextResponse.json({ error: "bundle.analysisFingerprint is required" }, { status: 400 });
  }

  // Honesty gate: a bundle that fails internal-consistency cannot be attested.
  const check = verifyBundle(body.bundle as never);
  if (!check.internallyConsistent) {
    return NextResponse.json(
      {
        status: "error",
        commitment: null,
        note: `Refused: the bundle is not internally consistent. ${check.reasons.join(" ")}`,
      },
      { status: 422 },
    );
  }

  const walletLabel = body.walletLabel?.trim() || "unknown";
  if (walletLabel === "Anonymous examiner" || walletLabel === "demo-mode") {
    return NextResponse.json(
      {
        status: "error",
        commitment: null,
        note: "Attestation requires a connected Midnight wallet (Lace or 1AM). Demo mode can seal and verify but not attest.",
      },
      { status: 403 },
    );
  }

  // Contract seam: derive the payload the Compact witnesses must return, and
  // compute the F3-shaped commitment. The salt is generated server-side and
  // never leaves this process — it is the witness the ZK circuit proves
  // knowledge of.
  const payload = attestationPayload(body.bundle as never);
  const { commitment, covers } = computeCommitment({
    bundleFingerprint: body.bundle.analysisFingerprint,
    custodyTip: payload.custodyTip,
    verdict: body.bundle.verdict,
    corroborationCount: body.bundle.corroborationCount ?? 0,
  });

  return NextResponse.json({
    commitment,
    covers,
    bundleHash: body.bundle.bundleHash,
    analysisFingerprint: body.bundle.analysisFingerprint,
    custodyTip: payload.custodyTip,
    caseId: body.bundle.caseId,
    verdict: body.bundle.verdict,
    status: "local_pending_contract",
    networkId: body.networkId ?? "preprod",
    attestedAt: new Date().toISOString(),
    note: "Placeholder commitment computed locally following the F3 shape (fingerprint + custody tip + verdict + corroboration count + random salt). Compact's persistentHash is not SHA-256, so this demo value is clearly a seam: the real on-chain commitment comes from the compiled contract. The salt is a server-side witness and is never returned.",
    saltDiscarded: true,
  });
}

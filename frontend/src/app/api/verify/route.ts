import { NextResponse } from "next/server";
import { verifyBundle } from "velo/seal/bundle.js";
import { verifyCustodyChain } from "velo/seal/custody.js";
import { requireJsonContentType } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

interface VerifyBody {
  bundle: Record<string, unknown>;
  // Adversarial demo controls — prove that tampering is detected.
  tamper?: "none" | "verdict" | "fingerprint" | "truncate";
}

function applyTamper(bundle: Record<string, unknown>, tamper: string): Record<string, unknown> {
  const copy: Record<string, unknown> = JSON.parse(JSON.stringify(bundle));
  if (tamper === "verdict") {
    const flip: Record<string, string> = {
      MALICE: "NOISE",
      SUSPICION: "NOISE",
      NOISE: "MALICE",
      ABSTAIN: "MALICE",
    };
    copy.verdict = flip[String(copy.verdict)] ?? "NOISE";
  } else if (tamper === "fingerprint") {
    copy.analysisFingerprint = "0".repeat(64);
  } else if (tamper === "truncate") {
    const chain = copy.custodyChain as { events: unknown[] };
    if (Array.isArray(chain?.events) && chain.events.length > 1) {
      chain.events = chain.events.slice(0, -1);
    }
  }
  return copy;
}

export async function POST(req: Request) {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) return contentTypeError;

  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.bundle) {
    return NextResponse.json({ error: "bundle is required" }, { status: 400 });
  }

  const candidate = applyTamper(body.bundle, body.tamper ?? "none");
  const result = verifyBundle(candidate as never);
  const custody = verifyCustodyChain(
    (candidate.custodyChain as never) ?? { caseId: "", genesisHash: "", events: [] },
  );

  return NextResponse.json({
    internallyConsistent: result.internallyConsistent,
    reasons: result.reasons,
    doesNotEstablish: result.doesNotEstablish,
    custody,
    tamperApplied: body.tamper ?? "none",
  });
}

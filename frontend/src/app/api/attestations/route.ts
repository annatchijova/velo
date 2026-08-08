import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAdapter } from "@/db/adapter";
import { readJsonBody, requireJsonContentType } from "@/lib/http";

/**
 * Attestation linkage (AC-J3.2, ADR-006).
 *
 * The local CLI proves and submits the attestation on-chain, then posts the
 * record here so the sealed ledger can show it. Authentication is the expert
 * API key issued at first login — only its SHA-256 hash is stored, and the
 * route additionally verifies that the sealed bundle belongs to that expert.
 * The key never authorizes anything beyond attestation posts for the owner's
 * own bundles.
 *
 * What this endpoint stores is the EXPERT-REPORTED link (bundle ↔ tx ↔
 * commitment). The on-chain facts are independently readable through
 * GET /api/chain and shown with their own trust label by the /verify panel —
 * never conflated with this record (ADR-003).
 */

export const runtime = "nodejs";

interface AttestationBody {
  bundleHash?: unknown;
  txHash?: unknown;
  commitment?: unknown;
}

function apiKeyFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function POST(req: Request) {
  const typeError = requireJsonContentType(req);
  if (typeError) return typeError;

  const key = apiKeyFrom(req);
  if (!key) {
    return NextResponse.json({ error: "Missing API key (Authorization: Bearer <key>)." }, { status: 401 });
  }

  const adapter = getAdapter();
  if (!adapter) {
    return NextResponse.json(
      { error: "Persistence is not configured on this deployment." },
      { status: 503 },
    );
  }

  const expert = await adapter.getExpertByApiKeyHash(createHash("sha256").update(key).digest("hex"));
  if (!expert) {
    return NextResponse.json({ error: "Unknown API key." }, { status: 401 });
  }

  const parsed = await readJsonBody(req);
  if (parsed.status !== 200) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body as AttestationBody;
  if (
    typeof body.bundleHash !== "string" ||
    typeof body.txHash !== "string" ||
    typeof body.commitment !== "string" ||
    !body.bundleHash ||
    !body.txHash ||
    !body.commitment
  ) {
    return NextResponse.json(
      { error: "bundleHash, txHash and commitment are required." },
      { status: 400 },
    );
  }

  const sealed = await adapter.getSealedBundleByHash(body.bundleHash);
  if (!sealed) {
    return NextResponse.json(
      { error: "No sealed case with that bundle hash on this deployment." },
      { status: 404 },
    );
  }
  if (sealed.expert_address !== expert.wallet_address) {
    return NextResponse.json(
      { error: "This sealed case belongs to a different expert." },
      { status: 403 },
    );
  }

  const updated = await adapter.recordAttestation(sealed.id, {
    txHash: body.txHash,
    commitment: body.commitment,
  });
  if (!updated) {
    return NextResponse.json({ error: "The attestation record could not be stored." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sealedId: updated.id });
}

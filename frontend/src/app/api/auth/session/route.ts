import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getAdapter } from "@/db/adapter";
import {
  clearSessionCookieHeader,
  normalizeWalletAddress,
  sessionCookieHeader,
  signSession,
} from "@/lib/auth";
import { readJsonBody, requireJsonContentType } from "@/lib/http";

/**
 * Wallet connect → server session (AC-J2.1, ADR-004).
 *
 * No passwords anywhere: the connected wallet address is the identity. An
 * UNKNOWN wallet still gets a session with role "none" (AC-J2.6) — identity
 * attaches to actions, and persistence is the action that gets refused.
 *
 * First login of a registered expert issues the CLI API key (ADR-006):
 * shown exactly once in this response; only its SHA-256 hash is stored.
 */

export const runtime = "nodejs";

function authSecret(): string | null {
  return process.env.AUTH_SECRET || null;
}

export async function POST(req: Request) {
  const typeError = requireJsonContentType(req);
  if (typeError) return typeError;

  const parsed = await readJsonBody(req);
  if (parsed.status !== 200) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.body as { walletAddress?: unknown; name?: unknown };

  const address = typeof body.walletAddress === "string" ? normalizeWalletAddress(body.walletAddress) : null;
  if (!address) {
    return NextResponse.json(
      { error: "walletAddress must be a 64-character hex wallet address." },
      { status: 400 },
    );
  }

  const secret = authSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "AUTH_SECRET is not configured on this deployment — sessions cannot be issued." },
      { status: 503 },
    );
  }

  const adapter = getAdapter();
  const expert = adapter ? await adapter.getExpert(address) : null;
  const role = expert ? "expert" : "none";
  const name = expert?.display_name ?? (typeof body.name === "string" ? body.name : undefined);

  let apiKey: string | undefined;
  if (expert && adapter && !expert.api_key_hash) {
    apiKey = `velo_${randomBytes(32).toString("hex")}`;
    const hash = createHash("sha256").update(apiKey).digest("hex");
    await adapter.setExpertApiKeyHash(address, hash);
  }

  const token = await signSession(
    { address, role, name, peritoRef: expert?.perito_ref ?? null },
    secret,
  );

  const secure = new URL(req.url).protocol === "https:";
  const res = NextResponse.json({
    address,
    role,
    name: name ?? null,
    peritoRef: expert?.perito_ref ?? null,
    ...(apiKey ? { apiKey } : {}),
    apiKeyNote: apiKey
      ? "Store this key now — it is shown exactly once. The CLI uses it to post attestation records."
      : undefined,
  });
  res.headers.set("set-cookie", sessionCookieHeader(token, secure));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("set-cookie", clearSessionCookieHeader());
  return res;
}

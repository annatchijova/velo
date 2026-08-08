import { SignJWT, jwtVerify } from "jose";

/**
 * Wallet identity — MVP Phase 3 (ADR-004).
 *
 * No passwords, no email, no OAuth: the connected Midnight wallet address IS
 * the identity. The session is an HS256 JWT in an httpOnly cookie, signed
 * with AUTH_SECRET.
 *
 * Known limitation, stated where the decision was made: the address is
 * UI-attested — the server trusts what the connected client reports, because
 * the official connector API v4 exposes no message-signing primitive. That
 * is sufficient for role gating (attaching identity to actions); it would
 * not be sufficient for anything financial. Possession-proof hardening is
 * post-MVP.
 */

export type SessionRole = "expert" | "none";

export interface SessionPayload {
  /** Normalized wallet address (64 lowercase hex chars). */
  address: string;
  role: SessionRole;
  name?: string;
  peritoRef?: string | null;
}

const WALLET_ADDRESS_PATTERN = /^(0x)?[0-9a-f]{64}$/i;

/**
 * Midnight addresses are 64-char hex (an optional 0x prefix appears in some
 * tooling). Anything else is rejected outright: the address is a primary
 * key, so no near-misses.
 */
export function normalizeWalletAddress(raw: string): string | null {
  const candidate = raw.trim();
  if (!WALLET_ADDRESS_PATTERN.test(candidate)) return null;
  return candidate.toLowerCase().replace(/^0x/, "");
}

function secretKey(secret: string): Uint8Array {
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured — sessions cannot be signed.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  payload: SessionPayload,
  secret: string,
  ttlDays = 7,
): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name, peritoRef: payload.peritoRef })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.address)
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .sign(secretKey(secret));
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    if (!payload.sub) return null;
    const address = normalizeWalletAddress(payload.sub);
    if (!address) return null;
    return {
      address,
      role: payload.role === "expert" ? "expert" : "none",
      name: typeof payload.name === "string" ? payload.name : undefined,
      peritoRef: typeof payload.peritoRef === "string" ? payload.peritoRef : null,
    };
  } catch {
    return null;
  }
}

/**
 * Reads the session cookie from a request and verifies it. Returns null —
 * never throws — for any of: no secret configured, no cookie header, no
 * session cookie present, or an invalid/expired token. Routes treat null as
 * "anonymous".
 */
export async function getSessionFromRequest(req: Request, secret: string): Promise<SessionPayload | null> {
  if (!secret) return null;
  const header = req.headers.get("cookie");
  if (!header) return null;
  const token = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  return verifySession(token, secret);
}

export const SESSION_COOKIE = "velo_session";

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function sessionCookieHeader(token: string, secure: boolean, ttlDays = 7): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ttlDays * 24 * 60 * 60}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

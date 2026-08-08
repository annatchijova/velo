// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 (AC-J2.1, AC-J2.6, ADR-004): wallet connect issues a server
 * session. Unknown wallets still get a session — identity attaches to
 * actions, and the action here (persistence) is what gets refused.
 */

const getAdapterMock = vi.fn();
vi.mock("@/db/adapter", () => ({ getAdapter: () => getAdapterMock() }));

import { DELETE, POST } from "./route";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const SECRET = "test-auth-secret";
const EXPERT_ADDRESS = "b".repeat(64);
const STRANGER_ADDRESS = "c".repeat(64);

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  getAdapterMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function cookieOf(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

describe("POST /api/auth/session", () => {
  it("issues an expert session for a registered wallet (AC-J2.1)", async () => {
    getAdapterMock.mockReturnValue({
      getExpert: async () => ({
        wallet_address: EXPERT_ADDRESS,
        display_name: "Perito Demo",
        perito_ref: "VELO-PERITO-001",
        role: "expert",
        api_key_hash: "already-hashed",
      }),
    });
    const res = await POST(jsonRequest({ walletAddress: EXPERT_ADDRESS }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.role).toBe("expert");
    expect(body.address).toBe(EXPERT_ADDRESS);
    expect(body.name).toBe("Perito Demo");
    expect(body.apiKey).toBeUndefined(); // key already issued — never re-shown
    const cookie = cookieOf(res);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    const token = cookie.split(`${SESSION_COOKIE}=`)[1].split(";")[0];
    const payload = await verifySession(token, SECRET);
    expect(payload?.role).toBe("expert");
    expect(payload?.address).toBe(EXPERT_ADDRESS);
  });

  it("issues an API key exactly once, at first login, when none exists (ADR-006)", async () => {
    const setExpertApiKeyHash = vi.fn(async (_address: string, _hash: string) => undefined);
    getAdapterMock.mockReturnValue({
      getExpert: async () => ({
        wallet_address: EXPERT_ADDRESS,
        display_name: "Perito Demo",
        perito_ref: null,
        role: "expert",
        api_key_hash: null,
      }),
      setExpertApiKeyHash,
    });
    const res = await POST(jsonRequest({ walletAddress: EXPERT_ADDRESS }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.apiKey).toBe("string");
    expect((body.apiKey as string).length).toBeGreaterThanOrEqual(32);
    expect(setExpertApiKeyHash).toHaveBeenCalledTimes(1);
    expect(setExpertApiKeyHash.mock.calls[0][0]).toBe(EXPERT_ADDRESS);
    // Only the HASH is stored.
    expect(setExpertApiKeyHash.mock.calls[0][1]).not.toBe(body.apiKey);
  });

  it("unknown wallet: session exists, role is none (AC-J2.6)", async () => {
    getAdapterMock.mockReturnValue({ getExpert: async () => null });
    const res = await POST(jsonRequest({ walletAddress: STRANGER_ADDRESS }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.role).toBe("none");
    expect(cookieOf(res)).toContain(`${SESSION_COOKIE}=`);
  });

  it("no adapter configured: session still issued, role none (demo degradation)", async () => {
    getAdapterMock.mockReturnValue(null);
    const res = await POST(jsonRequest({ walletAddress: STRANGER_ADDRESS }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).role).toBe("none");
  });

  it("rejects malformed wallet addresses with 400", async () => {
    getAdapterMock.mockReturnValue(null);
    const res = await POST(jsonRequest({ walletAddress: "not-an-address" }));
    expect(res.status).toBe(400);
  });

  it("enforces content-type (F14) and the body cap (F22)", async () => {
    getAdapterMock.mockReturnValue(null);
    const wrongType = new Request("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    expect((await POST(wrongType)).status).toBe(415);
    const oversized = new Request("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "999999999" },
      body: "{}",
    });
    expect((await POST(oversized)).status).toBe(413);
  });

  it("fails loud (503) when AUTH_SECRET is missing", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    getAdapterMock.mockReturnValue(null);
    const res = await POST(jsonRequest({ walletAddress: STRANGER_ADDRESS }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as Record<string, unknown>).error).toMatch(/AUTH_SECRET/);
  });
});

describe("DELETE /api/auth/session", () => {
  it("clears the session cookie", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("Max-Age=0");
  });
});

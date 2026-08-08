// @vitest-environment node
// Sessions only ever run in the Node server runtime (API routes); jose's
// webapi build does realm-sensitive Uint8Array checks that jsdom breaks.
import { describe, expect, it } from "vitest";
import {
  normalizeWalletAddress,
  signSession,
  verifySession,
} from "./auth";

/**
 * Phase 3 (AC-J2.1, ADR-004): identity = the connected wallet address, no
 * passwords. The session is a signed JWT in an httpOnly cookie. Known
 * limitation, stated in the ADR: the address is UI-attested — these
 * functions secure the SESSION, not wallet possession.
 */

const SECRET = "test-auth-secret-do-not-use-in-prod";
const VALID_ADDRESS = "a".repeat(64);

describe("normalizeWalletAddress", () => {
  it("accepts 64-char hex and normalizes to lowercase", () => {
    expect(normalizeWalletAddress("A".repeat(64))).toBe("a".repeat(64));
    expect(normalizeWalletAddress(VALID_ADDRESS)).toBe(VALID_ADDRESS);
  });

  it("strips an optional 0x prefix", () => {
    expect(normalizeWalletAddress(`0x${VALID_ADDRESS}`)).toBe(VALID_ADDRESS);
  });

  it("rejects everything that is not exactly 64 hex chars", () => {
    expect(normalizeWalletAddress("")).toBeNull();
    expect(normalizeWalletAddress("abc")).toBeNull();
    expect(normalizeWalletAddress("g".repeat(64))).toBeNull();
    expect(normalizeWalletAddress("a".repeat(63))).toBeNull();
    expect(normalizeWalletAddress("a".repeat(65))).toBeNull();
    expect(normalizeWalletAddress(`0x${"a".repeat(63)}`)).toBeNull();
  });
});

describe("session tokens", () => {
  it("round-trips a signed session payload", async () => {
    const token = await signSession(
      { address: VALID_ADDRESS, role: "expert", name: "Perito Demo" },
      SECRET,
    );
    const payload = await verifySession(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.address).toBe(VALID_ADDRESS);
    expect(payload?.role).toBe("expert");
    expect(payload?.name).toBe("Perito Demo");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ address: VALID_ADDRESS, role: "expert" }, SECRET);
    expect(await verifySession(token, "another-secret")).toBeNull();
  });

  it("rejects garbage and empty tokens without throwing", async () => {
    expect(await verifySession("not-a-jwt", SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
  });

  it("requires a secret to sign", async () => {
    await expect(signSession({ address: VALID_ADDRESS, role: "expert" }, "")).rejects.toThrowError(
      /AUTH_SECRET/,
    );
  });
});

import { SESSION_COOKIE, getSessionFromRequest } from "./auth";

describe("getSessionFromRequest", () => {
  it("extracts and verifies the session from the cookie header", async () => {
    const token = await signSession({ address: VALID_ADDRESS, role: "expert" }, SECRET);
    const req = new Request("http://localhost/api/seal", {
      headers: { cookie: `other=1; ${SESSION_COOKIE}=${token}` },
    });
    const session = await getSessionFromRequest(req, SECRET);
    expect(session?.address).toBe(VALID_ADDRESS);
    expect(session?.role).toBe("expert");
  });

  it("returns null without cookies, with unknown cookies, or bad tokens", async () => {
    const none = new Request("http://localhost/x");
    expect(await getSessionFromRequest(none, SECRET)).toBeNull();
    const unrelated = new Request("http://localhost/x", { headers: { cookie: "a=b" } });
    expect(await getSessionFromRequest(unrelated, SECRET)).toBeNull();
    const bad = new Request("http://localhost/x", {
      headers: { cookie: `${SESSION_COOKIE}=garbage` },
    });
    expect(await getSessionFromRequest(bad, SECRET)).toBeNull();
  });

  it("returns null when no secret is configured", async () => {
    const token = await signSession({ address: VALID_ADDRESS, role: "expert" }, SECRET);
    const req = new Request("http://localhost/x", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(await getSessionFromRequest(req, "")).toBeNull();
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 4 (AC-J3.2, ADR-006): the CLI posts attestation records using the
 * expert API key issued at first login. The key itself never touches the DB
 * — only its SHA-256 hash is stored, and the route resolves the expert by
 * that hash. Ownership of the sealed bundle is checked server-side.
 */

const getAdapterMock = vi.fn();
vi.mock("@/db/adapter", () => ({ getAdapter: () => getAdapterMock() }));

import { POST } from "./route";

const EXPERT_ADDRESS = "b".repeat(64);
const API_KEY = "velo_test_key";
const API_KEY_HASH = "hashed-key";
const BUNDLE_HASH = "ff".repeat(32);

const EXPERT_ROW = {
  wallet_address: EXPERT_ADDRESS,
  display_name: "Perito Demo",
  perito_ref: null,
  role: "expert",
  api_key_hash: API_KEY_HASH,
  created_at: new Date(),
};

const BUNDLE_ROW = {
  id: "sb-1",
  case_id: "VELO-001",
  bundle: { bundleHash: BUNDLE_HASH },
  bundle_hash: BUNDLE_HASH,
  verdict: "MALICE",
  expert_address: EXPERT_ADDRESS,
  sealed_at: new Date(),
  attest_tx_hash: null,
  attest_commitment: null,
  attested_at: null,
};

function request(body: unknown, key?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return new Request("http://localhost/api/attestations", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { bundleHash: BUNDLE_HASH, txHash: "0xabc", commitment: "dd".repeat(32) };

beforeEach(() => getAdapterMock.mockReset());

describe("POST /api/attestations", () => {
  it("records the attestation for the owning expert (AC-J3.2)", async () => {
    const recordAttestation = vi.fn(async () => ({ ...BUNDLE_ROW }));
    getAdapterMock.mockReturnValue({
      getExpertByApiKeyHash: async () => EXPERT_ROW,
      getSealedBundleByHash: async () => BUNDLE_ROW,
      recordAttestation,
    });
    const res = await POST(request(VALID_BODY, API_KEY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.sealedId).toBe("sb-1");
    expect(recordAttestation).toHaveBeenCalledWith("sb-1", {
      txHash: "0xabc",
      commitment: "dd".repeat(32),
    });
  });

  it("401 without an API key", async () => {
    getAdapterMock.mockReturnValue({});
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("401 for an unknown API key", async () => {
    getAdapterMock.mockReturnValue({ getExpertByApiKeyHash: async () => null });
    const res = await POST(request(VALID_BODY, "velo_wrong"));
    expect(res.status).toBe(401);
  });

  it("400 for a malformed body", async () => {
    getAdapterMock.mockReturnValue({ getExpertByApiKeyHash: async () => EXPERT_ROW });
    const res = await POST(request({ bundleHash: BUNDLE_HASH }, API_KEY));
    expect(res.status).toBe(400);
  });

  it("404 for an unknown bundle hash", async () => {
    getAdapterMock.mockReturnValue({
      getExpertByApiKeyHash: async () => EXPERT_ROW,
      getSealedBundleByHash: async () => null,
    });
    const res = await POST(request(VALID_BODY, API_KEY));
    expect(res.status).toBe(404);
  });

  it("403 when the bundle belongs to a different expert", async () => {
    getAdapterMock.mockReturnValue({
      getExpertByApiKeyHash: async () => EXPERT_ROW,
      getSealedBundleByHash: async () => ({ ...BUNDLE_ROW, expert_address: "c".repeat(64) }),
    });
    const res = await POST(request(VALID_BODY, API_KEY));
    expect(res.status).toBe(403);
  });

  it("503 when persistence is not configured", async () => {
    getAdapterMock.mockReturnValue(null);
    const res = await POST(request(VALID_BODY, API_KEY));
    expect(res.status).toBe(503);
  });

  it("413 for oversized bodies (F22)", async () => {
    getAdapterMock.mockReturnValue({ getExpertByApiKeyHash: async () => EXPERT_ROW });
    const req = new Request("http://localhost/api/attestations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "999999999",
        authorization: `Bearer ${API_KEY}`,
      },
      body: "{}",
    });
    expect((await POST(req)).status).toBe(413);
  });

  it("never buffers unauthenticated bodies (401 before any read)", async () => {
    getAdapterMock.mockReturnValue({});
    const req = new Request("http://localhost/api/attestations", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "999999999" },
      body: "{}",
    });
    expect((await POST(req)).status).toBe(401);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 (AC-J2.4): one sealed bundle, full contents, public read.
 */

const getAdapterMock = vi.fn();
vi.mock("@/db/adapter", () => ({ getAdapter: () => getAdapterMock() }));

import { GET } from "./route";

const ROW = {
  id: "sb-1",
  case_id: "VELO-001",
  bundle: { caseId: "VELO-001", verdict: "MALICE", bundleHash: "ff".repeat(32) },
  bundle_hash: "ff".repeat(32),
  verdict: "MALICE",
  expert_address: "b".repeat(64),
  sealed_at: new Date("2026-08-08T00:00:00Z"),
  attest_tx_hash: "0xabc",
  attest_commitment: "dd".repeat(32),
  attested_at: new Date("2026-08-08T01:00:00Z"),
};

beforeEach(() => getAdapterMock.mockReset());

describe("GET /api/sealed/:id", () => {
  it("returns the full stored bundle with attestation state (AC-J2.4)", async () => {
    getAdapterMock.mockReturnValue({ getSealedBundle: async () => ROW });
    const res = await GET(new Request("http://localhost/api/sealed/sb-1"), {
      params: Promise.resolve({ id: "sb-1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe("sb-1");
    expect(body.caseId).toBe("VELO-001");
    expect(body.bundle).toEqual(ROW.bundle);
    expect(body.attestation).toEqual({
      txHash: "0xabc",
      commitment: "dd".repeat(32),
      attestedAt: ROW.attested_at.toISOString(),
    });
  });

  it("404 when the id is unknown", async () => {
    getAdapterMock.mockReturnValue({ getSealedBundle: async () => null });
    const res = await GET(new Request("http://localhost/api/sealed/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("404 with configured:false when persistence is off", async () => {
    getAdapterMock.mockReturnValue(null);
    const res = await GET(new Request("http://localhost/api/sealed/sb-1"), {
      params: Promise.resolve({ id: "sb-1" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.configured).toBe(false);
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 (AC-J2.3, AC-J2.4): the sealed-case ledger is PUBLIC — reads
 * never require a session. When no adapter is configured, the endpoints
 * degrade to "nothing persisted" instead of failing (demo environments).
 */

const getAdapterMock = vi.fn();
vi.mock("@/db/adapter", () => ({ getAdapter: () => getAdapterMock() }));

import { GET } from "./route";

const ROW = {
  id: "sb-1",
  case_id: "VELO-001",
  bundle: { caseId: "VELO-001", verdict: "MALICE" },
  bundle_hash: "ff".repeat(32),
  verdict: "MALICE",
  expert_address: "b".repeat(64),
  sealed_at: new Date("2026-08-08T00:00:00Z"),
  attest_tx_hash: null,
  attest_commitment: null,
  attested_at: null,
};

beforeEach(() => getAdapterMock.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/sealed", () => {
  it("returns rows and total from the adapter (AC-J2.3)", async () => {
    const listSealedBundles = vi.fn(async () => ({ rows: [ROW], total: 1 }));
    getAdapterMock.mockReturnValue({ listSealedBundles });
    const res = await GET(new Request("http://localhost/api/sealed"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.total).toBe(1);
    expect(Array.isArray(body.sealed)).toBe(true);
    expect(listSealedBundles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it("passes verdict/expert/date filters through", async () => {
    const listSealedBundles = vi.fn(async () => ({ rows: [], total: 0 }));
    getAdapterMock.mockReturnValue({ listSealedBundles });
    await GET(
      new Request(
        "http://localhost/api/sealed?verdict=MALICE&expert=b&from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z&limit=10&offset=5",
      ),
    );
    expect(listSealedBundles).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: "MALICE",
        expertAddress: "b",
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2026-12-31T00:00:00Z"),
        limit: 10,
        offset: 5,
      }),
    );
  });

  it("clamps abusive limits", async () => {
    const listSealedBundles = vi.fn(async () => ({ rows: [], total: 0 }));
    getAdapterMock.mockReturnValue({ listSealedBundles });
    await GET(new Request("http://localhost/api/sealed?limit=100000"));
    expect(listSealedBundles).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("degrades to an empty ledger when no adapter is configured", async () => {
    getAdapterMock.mockReturnValue(null);
    const res = await GET(new Request("http://localhost/api/sealed"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sealed).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.configured).toBe(false);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 4 (AC-J4.*): the verification endpoint joins three facts that must
 * stay visually and logically separate:
 * - internal consistency + custody of the stored bundle (recomputed, never
 *   trusted),
 * - the expert-REPORTED attestation record (the CLI-posted link),
 * - the chain-VERIFIED ledger state (the deployed contract's caseVerdicts).
 * An unreachable indexer degrades to "unavailable" — never to "not attested"
 * and never to a crash (AC-J4.3).
 */

const getAdapterMock = vi.fn();
vi.mock("@/db/adapter", () => ({ getAdapter: () => getAdapterMock() }));

const readOnChainLedgerMock = vi.fn();
vi.mock("velo/chain/read.js", () => ({
  readOnChainLedger: () => readOnChainLedgerMock(),
}));

vi.mock("velo/seal/bundle.js", () => ({
  verifyBundle: () => ({
    internallyConsistent: true,
    reasons: [],
    doesNotEstablish: "authenticity is anchored by the on-chain attestation",
  }),
}));
vi.mock("velo/seal/custody.js", () => ({
  verifyCustodyChain: () => ({ valid: true, reason: "ok" }),
}));

import { GET } from "./route";

const COMMITMENT = "dd".repeat(32);
const BUNDLE_ROW = {
  id: "sb-1",
  case_id: "VELO-001",
  bundle: { caseId: "VELO-001", custodyChain: { events: [] }, verdict: "MALICE" },
  bundle_hash: "ff".repeat(32),
  verdict: "MALICE",
  expert_address: "b".repeat(64),
  sealed_at: new Date("2026-08-08T00:00:00Z"),
  attest_tx_hash: "0xabc",
  attest_commitment: COMMITMENT,
  attested_at: new Date("2026-08-08T01:00:00Z"),
};

function req(q: string): Request {
  return new Request(`http://localhost/api/verification?q=${encodeURIComponent(q)}`, {
    method: "GET",
  });
}

beforeEach(() => {
  getAdapterMock.mockReset();
  readOnChainLedgerMock.mockReset();
});

describe("GET /api/verification", () => {
  it("400 without a query", async () => {
    const res = await GET(new Request("http://localhost/api/verification"));
    expect(res.status).toBe(400);
  });

  it("sealed case by id: consistency + custody + chain-verified status (AC-J4.1/4.2)", async () => {
    getAdapterMock.mockReturnValue({ getSealedBundle: async () => BUNDLE_ROW });
    readOnChainLedgerMock.mockResolvedValue({
      contractAddress: "46".repeat(32),
      networkId: "preview",
      attestationCount: 1n,
      attestations: [{ commitment: COMMITMENT, verdict: "MALICE" }],
    });
    const res = await GET(req("sb-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.found).toBe(true);
    expect(body.bundleCheck.internallyConsistent).toBe(true);
    expect(body.custody.valid).toBe(true);
    expect(body.onChain.status).toBe("attested");
    expect(body.onChain.trustClass).toBe("chain-verified");
    expect(body.onChain.ledgerVerdict).toBe("MALICE");
  });

  it("marks the record expert-reported when the commitment is not on-chain", async () => {
    getAdapterMock.mockReturnValue({ getSealedBundle: async () => BUNDLE_ROW });
    readOnChainLedgerMock.mockResolvedValue({
      contractAddress: "46".repeat(32),
      networkId: "preview",
      attestationCount: 0n,
      attestations: [],
    });
    const res = await GET(req("sb-1"));
    const body = (await res.json()) as Record<string, any>;
    expect(body.onChain.status).toBe("not-found");
    expect(body.onChain.trustClass).toBe("expert-reported");
  });

  it("degrades to 'unavailable' when the indexer cannot be reached (AC-J4.3)", async () => {
    getAdapterMock.mockReturnValue({ getSealedBundle: async () => BUNDLE_ROW });
    readOnChainLedgerMock.mockRejectedValue(new Error("indexer unreachable"));
    const res = await GET(req("sb-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.onChain.status).toBe("unavailable");
    expect(body.onChain.trustClass).toBe("expert-reported");
    expect(body.bundleCheck.internallyConsistent).toBe(true);
  });

  it("answers a bare commitment from the ledger even without persistence", async () => {
    getAdapterMock.mockReturnValue(null);
    readOnChainLedgerMock.mockResolvedValue({
      contractAddress: "46".repeat(32),
      networkId: "preview",
      attestationCount: 1n,
      attestations: [{ commitment: COMMITMENT, verdict: "MALICE" }],
    });
    const res = await GET(req(COMMITMENT));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.found).toBe(false);
    expect(body.onChain.status).toBe("attested");
    expect(body.onChain.trustClass).toBe("chain-verified");
    expect(body.onChain.ledgerVerdict).toBe("MALICE");
  });

  it("commitment on no ledger and no persistence: honest not-found", async () => {
    getAdapterMock.mockReturnValue({ getSealedBundleByCommitment: async () => null });
    readOnChainLedgerMock.mockResolvedValue({
      contractAddress: "46".repeat(32),
      networkId: "preview",
      attestationCount: 0n,
      attestations: [],
    });
    const res = await GET(req(COMMITMENT));
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.found).toBe(false);
    expect(body.onChain.status).toBe("not-found");
  });

  it("unknown sealed id: 404 with found:false", async () => {
    getAdapterMock.mockReturnValue({ getSealedBundle: async () => null });
    const res = await GET(req("nope"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.found).toBe(false);
  });
});

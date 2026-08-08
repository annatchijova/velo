// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 (AC-J2.2) + F22: the seal route persists exactly when a
 * registered expert session is present AND an adapter is configured; every
 * other caller keeps the demo behavior. Body parsing is size-capped.
 */

const ANALYSIS = {
  detectorResults: [],
  scoreResult: {
    verdict: "MALICE",
    score: { toString: () => "3/4" },
    corroborationCount: 2,
    detectorCategoriesFired: 2,
    detectorsFired: ["a", "b"],
    corroboratingSources: ["S1", "S2"],
    coverageGaps: [],
    devilAdvocate: "considered",
    reasoning: "because",
  },
  custodyValid: true,
  custodyReason: "ok",
};

const BUNDLE = {
  caseId: "VELO-001",
  sealedAt: "2026-08-08T00:00:00.000Z",
  verdict: "MALICE",
  score: "3/4",
  corroborationCount: 2,
  detectorsFired: ["a", "b"],
  devilAdvocate: "considered",
  reasoning: "because",
  evidenceManifest: [],
  custodyChain: [],
  bundleHash: "ff".repeat(32),
  analysisFingerprint: "ee".repeat(32),
};

vi.mock("velo/core/operations.js", () => ({
  analyzeCase: () => ANALYSIS,
  sealAnalysis: () => BUNDLE,
}));
vi.mock("velo/seal/bundle.js", () => ({
  verifyBundle: () => ({ internallyConsistent: true, reasons: [], doesNotEstablish: "x" }),
  attestationPayload: () => ({ analysisFingerprint: BUNDLE.analysisFingerprint, custodyTip: "00" }),
}));

const getAdapterMock = vi.fn();
vi.mock("@/db/adapter", () => ({ getAdapter: () => getAdapterMock() }));

import { POST } from "./route";
import { signSession } from "@/lib/auth";

const SECRET = "test-auth-secret";
const EXPERT_ADDRESS = "b".repeat(64);

function sealRequest(extra: { cookie?: string; contentLength?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (extra.cookie) headers.cookie = extra.cookie;
  if (extra.contentLength) headers["content-length"] = extra.contentLength;
  return new Request("http://localhost/api/seal", {
    method: "POST",
    headers,
    body: JSON.stringify({ caseId: "VELO-001", artifacts: [], scenario: "seal" }),
  });
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  getAdapterMock.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/seal — persistence (AC-J2.2)", () => {
  it("persists for a registered expert session", async () => {
    const insertSealedBundle = vi.fn(async () => ({}));
    getAdapterMock.mockReturnValue({ insertSealedBundle });
    const token = await signSession({ address: EXPERT_ADDRESS, role: "expert" }, SECRET);
    const res = await POST(sealRequest({ cookie: `velo_session=${token}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.persisted).toBe(true);
    expect(body.sealedId).toBeTypeOf("string");
    expect(insertSealedBundle).toHaveBeenCalledTimes(1);
  });

  it("keeps demo behavior for anonymous callers", async () => {
    const insertSealedBundle = vi.fn();
    getAdapterMock.mockReturnValue({ insertSealedBundle });
    const res = await POST(sealRequest());
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.persisted).toBe(false);
    expect(body.persistenceReason).toBeTypeOf("string");
    expect(insertSealedBundle).not.toHaveBeenCalled();
  });

  it("keeps demo behavior when no adapter is configured", async () => {
    getAdapterMock.mockReturnValue(null);
    const token = await signSession({ address: EXPERT_ADDRESS, role: "expert" }, SECRET);
    const res = await POST(sealRequest({ cookie: `velo_session=${token}` }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.persisted).toBe(false);
  });

  it("does not persist on engine-only runs, even for experts", async () => {
    const insertSealedBundle = vi.fn();
    getAdapterMock.mockReturnValue({ insertSealedBundle });
    const token = await signSession({ address: EXPERT_ADDRESS, role: "expert" }, SECRET);
    const req = new Request("http://localhost/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `velo_session=${token}` },
      body: JSON.stringify({ caseId: "VELO-001", artifacts: [] }),
    });
    await POST(req);
    expect(insertSealedBundle).not.toHaveBeenCalled();
  });
});

describe("POST /api/seal — body discipline (F14/F22)", () => {
  it("refuses oversized bodies with 413", async () => {
    getAdapterMock.mockReturnValue(null);
    const res = await POST(sealRequest({ contentLength: "999999999" }));
    expect(res.status).toBe(413);
  });

  it("refuses malformed JSON with 400", async () => {
    getAdapterMock.mockReturnValue(null);
    const req = new Request("http://localhost/api/seal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });
    expect((await POST(req)).status).toBe(400);
  });
});

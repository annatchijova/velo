// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3 (AC-J2.2): the persistence DECISION matrix. Sealing always works;
 * persisting only happens for registered experts with a configured adapter.
 * Every other combination degrades to the demo behavior — honestly, with a
 * reason, never with a crash.
 */

const getAdapterMock = vi.fn();
vi.mock("@/db/adapter", () => ({ getAdapter: () => getAdapterMock() }));

import { maybePersistSeal } from "./persist";
import type { SessionPayload } from "@/lib/auth";

const BUNDLE = {
  caseId: "VELO-001",
  sealedAt: "2026-08-08T00:00:00.000Z",
  verdict: "MALICE",
  bundleHash: "ff".repeat(32),
  analysisFingerprint: "ee".repeat(32),
} as never;

const EXPERT_SESSION: SessionPayload = { address: "b".repeat(64), role: "expert" };
const NONE_SESSION: SessionPayload = { address: "c".repeat(64), role: "none" };

beforeEach(() => getAdapterMock.mockReset());

describe("maybePersistSeal", () => {
  it("persists for a registered expert with a configured adapter (AC-J2.2)", async () => {
    const insertSealedBundle = vi.fn(async (row: Record<string, unknown>) => ({ ...row, id: row.id }));
    getAdapterMock.mockReturnValue({ insertSealedBundle });
    const outcome = await maybePersistSeal(EXPERT_SESSION, BUNDLE);
    expect(outcome.persisted).toBe(true);
    expect(outcome.id).toBeTypeOf("string");
    expect(insertSealedBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        case_id: "VELO-001",
        bundle_hash: "ff".repeat(32),
        verdict: "MALICE",
        expert_address: EXPERT_SESSION.address,
        bundle: BUNDLE,
      }),
    );
  });

  it("does not persist for anonymous sessions", async () => {
    const insertSealedBundle = vi.fn();
    getAdapterMock.mockReturnValue({ insertSealedBundle });
    const outcome = await maybePersistSeal(null, BUNDLE);
    expect(outcome.persisted).toBe(false);
    expect(outcome.reason).toBeTypeOf("string");
    expect(insertSealedBundle).not.toHaveBeenCalled();
  });

  it("does not persist for connected-but-unregistered wallets (AC-J2.6)", async () => {
    const insertSealedBundle = vi.fn();
    getAdapterMock.mockReturnValue({ insertSealedBundle });
    const outcome = await maybePersistSeal(NONE_SESSION, BUNDLE);
    expect(outcome.persisted).toBe(false);
    expect(insertSealedBundle).not.toHaveBeenCalled();
  });

  it("degrades to demo behavior when no adapter is configured", async () => {
    getAdapterMock.mockReturnValue(null);
    const outcome = await maybePersistSeal(EXPERT_SESSION, BUNDLE);
    expect(outcome.persisted).toBe(false);
    expect(outcome.reason).toMatch(/configured/i);
  });

  it("survives a DB failure without crashing the seal response", async () => {
    getAdapterMock.mockReturnValue({
      insertSealedBundle: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    });
    const outcome = await maybePersistSeal(EXPERT_SESSION, BUNDLE);
    expect(outcome.persisted).toBe(false);
    expect(outcome.reason).toMatch(/error/i);
  });
});

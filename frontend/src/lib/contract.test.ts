import { describe, expect, it } from "vitest";
import { computeCommitment } from "@/lib/contract";

/**
 * Red team round 6, F24: the placeholder-commitment seam's return type still
 * carried the salt. The salt is a witness value — it must be generated
 * server-side, fold into the commitment, and never leave the module, in any
 * type or payload shape. These tests pin that boundary until Phase 4 retires
 * the seam entirely.
 */

const INPUT = {
  bundleFingerprint: "ab".repeat(32),
  custodyTip: "cd".repeat(32),
  verdict: "MALICE",
  corroborationCount: 2,
};

describe("contract seam (F24)", () => {
  it("never exposes the salt in the returned commitment shape", () => {
    const result = computeCommitment(INPUT) as unknown as Record<string, unknown>;
    expect("salt" in result).toBe(false);
    expect(Object.keys(result).sort()).toEqual(["commitment", "covers", "fingerprint"]);
  });

  it("returns a 64-char hex commitment covering the F3-bound values", () => {
    const { commitment, covers, fingerprint } = computeCommitment(INPUT);
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).toBe(INPUT.bundleFingerprint);
    expect(covers.sort()).toEqual(
      ["corroborationCount", "custodyTip", "fingerprint", "salt", "verdict"].sort(),
    );
  });

  it("uses a fresh internal salt per call (commitments differ, both valid)", () => {
    const first = computeCommitment(INPUT);
    const second = computeCommitment(INPUT);
    expect(first.commitment).not.toBe(second.commitment);
    expect(first.commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(second.commitment).toMatch(/^[0-9a-f]{64}$/);
  });
});

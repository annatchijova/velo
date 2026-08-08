import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { experts, sealedBundles } from "./schema";

/**
 * Phase 3 (AC-J2.*): the persistence schema is the shape of the public
 * sealed-case ledger and the expert role registry. Tests pin the shape so a
 * migration that drops or renames a load-bearing column fails loudly.
 */

describe("sealed_bundles schema", () => {
  it("maps to the sealed_bundles table", () => {
    expect(getTableName(sealedBundles)).toBe("sealed_bundles");
  });

  it("carries the bundle, its hashes, and the attestation linkage columns", () => {
    const cols = Object.keys(getTableColumns(sealedBundles)).sort();
    expect(cols).toEqual(
      [
        "attest_commitment",
        "attest_tx_hash",
        "attested_at",
        "bundle",
        "bundle_hash",
        "case_id",
        "expert_address",
        "id",
        "sealed_at",
        "verdict",
      ].sort(),
    );
  });
});

describe("experts schema", () => {
  it("maps to the experts table keyed by wallet address", () => {
    expect(getTableName(experts)).toBe("experts");
    const cols = Object.keys(getTableColumns(experts)).sort();
    expect(cols).toEqual(
      ["api_key_hash", "created_at", "display_name", "perito_ref", "role", "wallet_address"].sort(),
    );
  });
});

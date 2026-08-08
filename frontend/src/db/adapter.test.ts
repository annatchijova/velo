import { afterEach, describe, expect, it } from "vitest";
import {
  createAdapter,
  getAdapter,
  resetAdapterCache,
  resolveAdapterKind,
} from "./adapter";

/**
 * Phase 3 (user decision 2026-08-08): the DB engine is deferred and
 * abstracted. `DB_ADAPTER` selects between Neon and Cloud SQL at deploy
 * time; no adapter is configured at all in demo/local environments, and the
 * routes must degrade to the pre-persistence behavior (AC-J2.2 anonymous
 * path) instead of failing.
 */

const ADAPTER_KEYS = [
  "getExpert",
  "getSealedBundle",
  "getSealedBundleByHash",
  "insertExpert",
  "insertSealedBundle",
  "listSealedBundles",
  "recordAttestation",
  "setExpertApiKeyHash",
] as const;

describe("resolveAdapterKind", () => {
  it("returns null when DB_ADAPTER is unset (demo degradation, not failure)", () => {
    expect(resolveAdapterKind({})).toBeNull();
    expect(resolveAdapterKind({ DB_ADAPTER: "" })).toBeNull();
  });

  it("accepts the two supported engines", () => {
    expect(resolveAdapterKind({ DB_ADAPTER: "neon" })).toBe("neon");
    expect(resolveAdapterKind({ DB_ADAPTER: "cloudsql" })).toBe("cloudsql");
  });

  it("rejects unknown adapters with an actionable error", () => {
    expect(() => resolveAdapterKind({ DB_ADAPTER: "sqlite" })).toThrowError(/DB_ADAPTER/);
  });
});

describe("createAdapter", () => {
  it("requires DATABASE_URL when an adapter is configured", () => {
    expect(() => createAdapter("neon", {})).toThrowError(/DATABASE_URL/);
    expect(() => createAdapter("cloudsql", {})).toThrowError(/DATABASE_URL/);
  });

  it.each(["neon", "cloudsql"] as const)(
    "%s adapter implements the full DatabaseAdapter surface without connecting eagerly",
    (kind) => {
      const adapter = createAdapter(kind, { DATABASE_URL: "postgres://user:pass@localhost:5432/db" });
      expect(adapter.kind).toBe(kind);
      for (const key of ADAPTER_KEYS) {
        expect(adapter[key], `missing ${key}`).toBeTypeOf("function");
      }
    },
  );
});

describe("getAdapter", () => {
  afterEach(() => {
    resetAdapterCache();
    delete process.env.DB_ADAPTER;
    delete process.env.DATABASE_URL;
  });

  it("returns null when nothing is configured", () => {
    delete process.env.DB_ADAPTER;
    expect(getAdapter()).toBeNull();
  });

  it("returns the configured adapter, cached", () => {
    process.env.DB_ADAPTER = "neon";
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
    const first = getAdapter();
    expect(first?.kind).toBe("neon");
    expect(getAdapter()).toBe(first);
  });

  it("fails loud when configured but missing DATABASE_URL", () => {
    process.env.DB_ADAPTER = "cloudsql";
    expect(() => getAdapter()).toThrowError(/DATABASE_URL/);
  });
});

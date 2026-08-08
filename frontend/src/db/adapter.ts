import { and, count, eq, gte, lte, type SQL } from "drizzle-orm";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { type PgDatabase } from "drizzle-orm/pg-core";
import { neon } from "@neondatabase/serverless";
import pg from "pg";
import * as schema from "./schema";
import {
  experts,
  sealedBundles,
  type ExpertRow,
  type NewExpertRow,
  type NewSealedBundleRow,
  type SealedBundleRow,
} from "./schema";

/**
 * Database adapter — MVP Phase 3.
 *
 * Decision (2026-08-08, recorded in docs/ADRS_001_006.md, ADR-001 status):
 * the persistence ENGINE is deferred, the INTERFACE is not. One Drizzle
 * schema, two drivers — Neon (serverless HTTP client) and Cloud SQL
 * (node-postgres pool) — selected at deploy time via `DB_ADAPTER`. Both
 * drivers are lazy: constructing an adapter never opens a connection, which
 * is what lets routes degrade to demo behavior when nothing is configured
 * (and what lets unit tests exercise the factory offline).
 */

export type AdapterKind = "neon" | "cloudsql";

export type Db = PgDatabase<any, typeof schema>;

export interface SealedBundleFilter {
  verdict?: string;
  expertAddress?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface DatabaseAdapter {
  kind: AdapterKind;
  insertSealedBundle(row: NewSealedBundleRow): Promise<SealedBundleRow>;
  listSealedBundles(filter: SealedBundleFilter): Promise<{ rows: SealedBundleRow[]; total: number }>;
  getSealedBundle(id: string): Promise<SealedBundleRow | null>;
  getSealedBundleByHash(bundleHash: string): Promise<SealedBundleRow | null>;
  recordAttestation(
    id: string,
    attestation: { txHash: string; commitment: string },
  ): Promise<SealedBundleRow | null>;
  getExpert(walletAddress: string): Promise<ExpertRow | null>;
  insertExpert(row: NewExpertRow): Promise<ExpertRow>;
  setExpertApiKeyHash(walletAddress: string, apiKeyHash: string): Promise<void>;
}

export function resolveAdapterKind(env: Record<string, string | undefined>): AdapterKind | null {
  const raw = env.DB_ADAPTER ?? "";
  if (raw === "") return null;
  if (raw === "neon" || raw === "cloudsql") return raw;
  throw new Error(
    `DB_ADAPTER must be "neon" or "cloudsql" (got ${JSON.stringify(raw)}). ` +
      "Unset it to run without persistence.",
  );
}

function requireUrl(env: Record<string, string | undefined>): string {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error("DB_ADAPTER is set but DATABASE_URL is missing — configure the connection string.");
  }
  return url;
}

function openDb(kind: AdapterKind, env: Record<string, string | undefined>): Db {
  const connectionString = requireUrl(env);
  if (kind === "neon") {
    // HTTP client: stateless, no websocket — the right shape for serverless.
    const sql = neon(connectionString);
    return drizzleNeonHttp(sql, { schema }) as Db;
  }
  const pool = new pg.Pool({ connectionString });
  return drizzlePg(pool, { schema }) as Db;
}

function filterToSql(filter: SealedBundleFilter): SQL | undefined {
  const clauses: SQL[] = [];
  if (filter.verdict) clauses.push(eq(sealedBundles.verdict, filter.verdict));
  if (filter.expertAddress) clauses.push(eq(sealedBundles.expert_address, filter.expertAddress));
  if (filter.from) clauses.push(gte(sealedBundles.sealed_at, filter.from));
  if (filter.to) clauses.push(lte(sealedBundles.sealed_at, filter.to));
  if (clauses.length === 0) return undefined;
  return and(...clauses);
}

function adapterFor(kind: AdapterKind, env: Record<string, string | undefined>): DatabaseAdapter {
  const db = openDb(kind, env);
  return {
    kind,
    async insertSealedBundle(row) {
      const inserted = await db.insert(sealedBundles).values(row).returning();
      return inserted[0];
    },
    async listSealedBundles(filter) {
      const where = filterToSql(filter);
      const [rows, totalResult] = await Promise.all([
        db
          .select()
          .from(sealedBundles)
          .where(where)
          .orderBy(sealedBundles.sealed_at)
          .limit(filter.limit ?? 50)
          .offset(filter.offset ?? 0),
        db.select({ value: count() }).from(sealedBundles).where(where),
      ]);
      return { rows, total: totalResult[0]?.value ?? 0 };
    },
    async getSealedBundle(id) {
      const rows = await db.select().from(sealedBundles).where(eq(sealedBundles.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async getSealedBundleByHash(bundleHash) {
      const rows = await db
        .select()
        .from(sealedBundles)
        .where(eq(sealedBundles.bundle_hash, bundleHash))
        .limit(1);
      return rows[0] ?? null;
    },
    async recordAttestation(id, attestation) {
      const updated = await db
        .update(sealedBundles)
        .set({
          attest_tx_hash: attestation.txHash,
          attest_commitment: attestation.commitment,
          attested_at: new Date(),
        })
        .where(eq(sealedBundles.id, id))
        .returning();
      return updated[0] ?? null;
    },
    async getExpert(walletAddress) {
      const rows = await db
        .select()
        .from(experts)
        .where(eq(experts.wallet_address, walletAddress))
        .limit(1);
      return rows[0] ?? null;
    },
    async insertExpert(row) {
      await db.insert(experts).values(row).onConflictDoNothing();
      const existing = await db
        .select()
        .from(experts)
        .where(eq(experts.wallet_address, row.wallet_address))
        .limit(1);
      return existing[0];
    },
    async setExpertApiKeyHash(walletAddress, apiKeyHash) {
      await db.update(experts).set({ api_key_hash: apiKeyHash }).where(eq(experts.wallet_address, walletAddress));
    },
  };
}

let cached: DatabaseAdapter | null | undefined;

/**
 * Process-wide accessor for route handlers. Returns null when no adapter is
 * configured — routes treat that as "persistence off" and keep the demo
 * behavior (AC-J2.2 anonymous path). Throws only when configured wrongly.
 */
export function getAdapter(): DatabaseAdapter | null {
  if (cached === undefined) {
    const kind = resolveAdapterKind(process.env);
    cached = kind === null ? null : adapterFor(kind, process.env);
  }
  return cached;
}

/** Test seam: drop the cached adapter so env changes take effect. */
export function resetAdapterCache(): void {
  cached = undefined;
}

/** Test/CI seam: build an adapter from explicit env without touching globals. */
export function createAdapter(kind: AdapterKind, env: Record<string, string | undefined>): DatabaseAdapter {
  return adapterFor(kind, env);
}

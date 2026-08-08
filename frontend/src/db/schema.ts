import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Persistence schema — MVP Phase 3 (docs/PRD_MVP.md, J2).
 *
 * Two tables, deliberately small:
 *
 * - `sealed_bundles`: the public sealed-case ledger. The full SealedBundle is
 *   stored as JSONB so verification can re-check the stored copy exactly as
 *   the engine sealed it; the denormalized columns exist for filtering and
 *   for the Phase 4 attestation linkage. `bundle_hash` is unique: one sealing
 *   event, one row.
 * - `experts`: the role registry (ADR-004). The wallet address is the
 *   identity; no passwords anywhere. `api_key_hash` stores the hashed CLI
 *   API key issued at first login (ADR-006) — the plaintext is shown once
 *   and never stored.
 *
 * The same schema serves both adapters behind `DatabaseAdapter`
 * (`src/db/adapter.ts`): Neon and Cloud SQL are both Postgres; only the
 * driver differs.
 */

export const sealedBundles = pgTable(
  "sealed_bundles",
  {
    id: text("id").primaryKey(),
    case_id: text("case_id").notNull(),
    bundle: jsonb("bundle").notNull(),
    bundle_hash: text("bundle_hash").notNull(),
    verdict: text("verdict").notNull(),
    expert_address: text("expert_address").notNull(),
    sealed_at: timestamp("sealed_at", { withTimezone: true }).notNull().defaultNow(),
    attest_tx_hash: text("attest_tx_hash"),
    attest_commitment: text("attest_commitment"),
    attested_at: timestamp("attested_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sealed_bundles_bundle_hash_idx").on(table.bundle_hash),
    index("sealed_bundles_verdict_idx").on(table.verdict),
    index("sealed_bundles_expert_idx").on(table.expert_address),
    index("sealed_bundles_sealed_at_idx").on(table.sealed_at),
  ],
);

export const experts = pgTable("experts", {
  wallet_address: text("wallet_address").primaryKey(),
  display_name: text("display_name").notNull(),
  perito_ref: text("perito_ref"),
  role: text("role").notNull().default("expert"),
  api_key_hash: text("api_key_hash"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SealedBundleRow = typeof sealedBundles.$inferSelect;
export type NewSealedBundleRow = typeof sealedBundles.$inferInsert;
export type ExpertRow = typeof experts.$inferSelect;
export type NewExpertRow = typeof experts.$inferInsert;

import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — MVP Phase 3.
 *
 * `generate` reads the schema and emits SQL migrations into ./drizzle
 * without touching a database. `migrate` (via drizzle-kit or the migrator
 * in scripts/db-migrate.ts) applies them using DATABASE_URL. The same
 * schema serves both adapters (Neon and Cloud SQL) — only the driver
 * differs, per the DatabaseAdapter decision in docs/ADRS_001_006.md.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only used by `drizzle-kit migrate`/`push`; the app itself reads
    // DATABASE_URL at runtime through the adapter.
    url: process.env.DATABASE_URL ?? "",
  },
});

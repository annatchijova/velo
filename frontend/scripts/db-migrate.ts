/**
 * Apply committed SQL migrations (./drizzle) to DATABASE_URL.
 *
 * Usage:  DATABASE_URL=postgres://... npm run db:migrate
 *
 * Picks the right drizzle migrator for the configured adapter. This is the
 * only place a connection is opened for schema management; the app opens its
 * own at runtime through src/db/adapter.ts.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to migrate.");
    process.exit(1);
  }
  const adapter = (process.env.DB_ADAPTER ?? "neon") as "neon" | "cloudsql";
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

  if (adapter === "cloudsql") {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: url });
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
    await pool.end();
  } else {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const db = drizzle(neon(url));
    await migrate(db, { migrationsFolder });
  }

  console.log(`Migrations applied from ${migrationsFolder} (adapter: ${adapter}).`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

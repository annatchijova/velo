/**
 * Seed the sealed-case ledger deterministically (MVP Phase 3).
 *
 * Runs the deterministic engine over every corpus case and inserts the
 * sealed bundles under a synthetic demo expert — so the deployed ledger is
 * not empty, and every row in it can be re-derived bit-for-bit by re-running
 * the engine (the two-hash invariant: identical analysisFingerprint, fresh
 * bundleHash per sealing event).
 *
 * Usage:  DATABASE_URL=postgres://... DB_ADAPTER=neon npm run db:seed
 *
 * Re-runnable: rows are keyed by bundle_hash (unique), and each run produces
 * new bundle hashes (sealedAt moves), so seeding adds, never corrupts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { analyzeCase, sealAnalysis } from "velo/core/operations.js";
import { createAdapter, type AdapterKind } from "../src/db/adapter";

interface CorpusCase {
  case_id: string;
  artifacts: unknown[];
  devil_advocate: string;
  custodyEvents: unknown[];
  coverageGaps?: unknown[];
}

const SYNTHETIC_EXPERT = {
  wallet_address: createHash("sha256").update("velo:synthetic-seed-expert").digest("hex"),
  display_name: "VELO Seed Expert (synthetic)",
  perito_ref: null,
  role: "expert",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to seed.");
    process.exit(1);
  }
  const kind = (process.env.DB_ADAPTER ?? "neon") as AdapterKind;
  const adapter = createAdapter(kind, { DATABASE_URL: url });

  await adapter.insertExpert(SYNTHETIC_EXPERT);

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const casesDir = join(repoRoot, "cases");
  const files = readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort();

  let inserted = 0;
  for (const file of files) {
    const caseFile = JSON.parse(readFileSync(join(casesDir, file), "utf8")) as CorpusCase;
    const analysis = analyzeCase({
      caseId: caseFile.case_id,
      artifacts: caseFile.artifacts as never,
      devilAdvocate: caseFile.devil_advocate ?? "",
      custodyEvents: (caseFile.custodyEvents ?? []) as never,
      coverageGaps: (caseFile.coverageGaps ?? []) as never,
    });
    const bundle = sealAnalysis(caseFile.case_id, caseFile.artifacts as never, analysis);
    try {
      await adapter.insertSealedBundle({
        id: randomUUID(),
        case_id: bundle.caseId,
        bundle: bundle as unknown as Record<string, unknown>,
        bundle_hash: bundle.bundleHash,
        verdict: bundle.verdict,
        expert_address: SYNTHETIC_EXPERT.wallet_address,
        sealed_at: new Date(bundle.sealedAt),
      });
      inserted += 1;
      console.log(`seeded ${bundle.caseId} -> ${bundle.verdict} (${bundle.bundleHash.slice(0, 12)}…)`);
    } catch (err) {
      // A duplicate bundle_hash means this exact sealing event already
      // exists — skip, never overwrite.
      console.warn(`skipped ${bundle.caseId}: ${(err as Error).message}`);
    }
  }

  console.log(`Seed complete: ${inserted}/${files.length} cases inserted (adapter: ${kind}).`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

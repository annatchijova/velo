import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SealedBundle } from "../seal/bundle.js";

/**
 * Local, runtime-only storage for sealed bundles — populated when a user
 * actually calls seal_case, never pre-populated with fixture data. This
 * directory is gitignored: what ships in the repo is the code that
 * produces bundles, not any bundle itself.
 */
const DEFAULT_STORE_DIR = "local-cases";

export function ensureStoreDir(dir: string = DEFAULT_STORE_DIR): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function saveBundle(bundle: SealedBundle, dir: string = DEFAULT_STORE_DIR): string {
  ensureStoreDir(dir);
  const path = join(dir, `${bundle.caseId}.json`);
  writeFileSync(path, JSON.stringify(bundle, null, 2), "utf8");
  return path;
}

export function loadBundle(caseId: string, dir: string = DEFAULT_STORE_DIR): SealedBundle | null {
  const path = join(dir, `${caseId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as SealedBundle;
}

export interface CaseSummary {
  caseId: string;
  verdict: SealedBundle["verdict"];
  sealedAt: string;
  bundleHash: string;
  analysisFingerprint: string;
  corroborationCount: number;
}

/** Public-only summary — never includes the evidence manifest or custody chain detail. */
export function toSummary(bundle: SealedBundle): CaseSummary {
  return {
    caseId: bundle.caseId,
    verdict: bundle.verdict,
    sealedAt: bundle.sealedAt,
    bundleHash: bundle.bundleHash,
    analysisFingerprint: bundle.analysisFingerprint,
    corroborationCount: bundle.corroborationCount,
  };
}

export function listBundles(dir: string = DEFAULT_STORE_DIR): CaseSummary[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const bundle = JSON.parse(readFileSync(join(dir, f), "utf8")) as SealedBundle;
      return toSummary(bundle);
    });
}

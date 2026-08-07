import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { SealedBundle } from "../seal/bundle.js";

/**
 * Local, runtime-only storage for sealed bundles — populated when a user
 * actually calls seal_case, never pre-populated with fixture data. This
 * directory is gitignored: what ships in the repo is the code that
 * produces bundles, not any bundle itself.
 */
const DEFAULT_STORE_DIR = "local-cases";

/**
 * A case ID is a filename component, never a path. Anything outside this
 * character set — separators, "..", NUL, absolute prefixes — is rejected
 * rather than sanitized: silently rewriting a caller's ID would mean the
 * bundle gets stored under a name the caller didn't ask for, which is its
 * own correctness problem in a chain-of-custody system.
 *
 * Red team F1: without this, `caseId: "../pwned"` wrote outside the store
 * and `"../secret"` read arbitrary .json files back out, reachable
 * end-to-end over the real MCP protocol.
 */
const CASE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export class InvalidCaseIdError extends Error {
  constructor(caseId: string) {
    super(
      `Invalid caseId ${JSON.stringify(caseId)}: must match ${CASE_ID_PATTERN} ` +
        `(letters, digits, dot, underscore, hyphen — no path separators).`,
    );
    this.name = "InvalidCaseIdError";
  }
}

export function assertValidCaseId(caseId: string): void {
  if (!CASE_ID_PATTERN.test(caseId) || caseId === "." || caseId === "..") {
    throw new InvalidCaseIdError(caseId);
  }
}

/**
 * Defense in depth: even with a validated ID, resolve the final path and
 * confirm it really lands inside the store directory. The schema is the
 * boundary; the store does not trust its callers to have honored it.
 */
function resolveInsideStore(dir: string, caseId: string): string {
  assertValidCaseId(caseId);
  const storeRoot = resolve(dir);
  const target = resolve(join(dir, `${caseId}.json`));
  if (target !== storeRoot && !target.startsWith(storeRoot + sep)) {
    throw new InvalidCaseIdError(caseId);
  }
  return target;
}

export function ensureStoreDir(dir: string = DEFAULT_STORE_DIR): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function saveBundle(bundle: SealedBundle, dir: string = DEFAULT_STORE_DIR): string {
  const path = resolveInsideStore(dir, bundle.caseId);
  ensureStoreDir(dir);
  writeFileSync(path, JSON.stringify(bundle, null, 2), "utf8");
  return path;
}

export function loadBundle(caseId: string, dir: string = DEFAULT_STORE_DIR): SealedBundle | null {
  const path = resolveInsideStore(dir, caseId);
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

export interface UnreadableCase {
  file: string;
  error: string;
}

export interface CaseListing {
  cases: CaseSummary[];
  /**
   * Files that could not be read as bundles. Surfaced rather than skipped:
   * a case that silently disappears from a custody-tracking system is
   * worse than one that shows up as broken.
   */
  unreadable: UnreadableCase[];
}

/**
 * Red team F12: previously a single corrupt .json in the store took down
 * the whole listing with an uncaught parse error. Now each file fails
 * independently and is reported, not swallowed.
 */
export function listBundles(dir: string = DEFAULT_STORE_DIR): CaseListing {
  if (!existsSync(dir)) return { cases: [], unreadable: [] };

  const cases: CaseSummary[] = [];
  const unreadable: UnreadableCase[] = [];

  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const bundle = JSON.parse(readFileSync(join(dir, f), "utf8")) as SealedBundle;
      if (typeof bundle?.caseId !== "string" || typeof bundle?.bundleHash !== "string") {
        unreadable.push({ file: f, error: "not a sealed bundle (missing caseId/bundleHash)" });
        continue;
      }
      cases.push(toSummary(bundle));
    } catch (err) {
      unreadable.push({ file: f, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { cases, unreadable };
}

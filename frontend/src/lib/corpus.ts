import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CaseFile, PeritoFile } from "@/lib/types";

/**
 * Single source for the synthetic corpus.
 *
 * The corpus lives at the repository root (`cases/`, `peritos-syntetic/`)
 * and is read from there — it is NOT copied into the frontend. It used to
 * be, byte-identically, which is a rerun of red team finding F5: that
 * finding was two copies of the corpus drifting apart until the demo's
 * flagship case produced the wrong verdict on stage. Identical copies are
 * not safe, they are pre-drift.
 *
 * `process.cwd()` is the frontend directory under `next dev` and
 * `next build`. `VELO_REPO_ROOT` overrides it for any deployment where
 * that stops being true.
 */
const REPO_ROOT = process.env.VELO_REPO_ROOT ?? resolve(process.cwd(), "..");

export const CASES_DIR = join(REPO_ROOT, "cases");
export const PERITOS_DIR = join(REPO_ROOT, "peritos-syntetic");

/**
 * A case ID is a filename component, never a path. Same rule as the
 * engine's store (red team F1) — a caller-supplied ID reaching the
 * filesystem is a filesystem read unless it is constrained first.
 */
const CASE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isValidCaseId(caseId: string): boolean {
  return CASE_ID_PATTERN.test(caseId) && caseId !== "." && caseId !== "..";
}

function jsonFilesIn(dir: string): string[] {
  if (!existsSync(dir)) {
    throw new Error(
      `Corpus directory not found: ${dir}. The frontend reads the corpus from the repository root; ` +
        `set VELO_REPO_ROOT if the frontend is running from somewhere else.`,
    );
  }
  return readdirSync(dir).filter((f) => f.endsWith(".json"));
}

export function loadAllCases(): CaseFile[] {
  return jsonFilesIn(CASES_DIR)
    .map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as CaseFile)
    .sort((a, b) => a.case_id.localeCompare(b.case_id));
}

export function loadCase(caseId: string): CaseFile | null {
  if (!isValidCaseId(caseId)) return null;
  const fileName = jsonFilesIn(CASES_DIR).find(
    (f) => f.startsWith(`${caseId}-`) || f === `${caseId}.json`,
  );
  if (!fileName) return null;
  return JSON.parse(readFileSync(join(CASES_DIR, fileName), "utf8")) as CaseFile;
}

export function loadAllPeritos(): PeritoFile[] {
  return jsonFilesIn(PERITOS_DIR)
    .map((f) => JSON.parse(readFileSync(join(PERITOS_DIR, f), "utf8")) as PeritoFile)
    .sort((a, b) => a.perito_id.localeCompare(b.perito_id));
}

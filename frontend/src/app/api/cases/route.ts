import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { CaseFile } from "@/lib/types";

const CASES_DIR = join(process.cwd(), "src", "data", "cases");

function loadAllCases(): CaseFile[] {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as CaseFile)
    .sort((a, b) => a.case_id.localeCompare(b.case_id));
}

export async function GET() {
  const cases = loadAllCases();
  return NextResponse.json(cases);
}

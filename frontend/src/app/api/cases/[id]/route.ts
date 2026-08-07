import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { CaseFile } from "@/lib/types";

const CASES_DIR = join(process.cwd(), "src", "data", "cases");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fileName = readdirName(id);
  if (!fileName) {
    return NextResponse.json({ error: `Case ${id} not found` }, { status: 404 });
  }
  const raw = readFileSync(join(CASES_DIR, fileName), "utf8");
  const parsed = JSON.parse(raw) as CaseFile;
  return NextResponse.json(parsed);
}

import { readdirSync } from "node:fs";

function readdirName(caseId: string): string | null {
  return (
    readdirSync(CASES_DIR)
      .filter((f) => f.endsWith(".json"))
      .find((f) => f.startsWith(`${caseId}-`) || f.startsWith(`${caseId}.`)) ?? null
  );
}

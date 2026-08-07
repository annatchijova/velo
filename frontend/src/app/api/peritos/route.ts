import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { PeritoFile } from "@/lib/types";

const PERITOS_DIR = join(process.cwd(), "src", "data", "peritos");

export async function GET() {
  const peritos = readdirSync(PERITOS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(PERITOS_DIR, f), "utf8")) as PeritoFile)
    .sort((a, b) => a.perito_id.localeCompare(b.perito_id));
  return NextResponse.json(peritos);
}

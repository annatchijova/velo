import { NextResponse } from "next/server";
import { loadAllPeritos } from "@/lib/corpus";

// ADR-002: the corpus is committed data, so it is evaluated at build time and
// served statically — the serverless runtime never reads the repo filesystem.
export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(loadAllPeritos());
}

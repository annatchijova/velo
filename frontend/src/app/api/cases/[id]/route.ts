import { NextResponse } from "next/server";
import { loadAllCases, loadCase } from "@/lib/corpus";

// ADR-002: one static document per corpus case, generated at build time.
// Unknown ids fall through to 404 — same behavior as the dynamic route had.
export const runtime = "nodejs";
export const dynamic = "force-static";

export async function generateStaticParams() {
  return loadAllCases().map((c) => ({ id: c.case_id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = loadCase(id);
  if (!found) {
    return NextResponse.json({ error: `Case ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(found);
}

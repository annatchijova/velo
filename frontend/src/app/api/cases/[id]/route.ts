import { NextResponse } from "next/server";
import { loadCase } from "@/lib/corpus";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = loadCase(id);
  if (!found) {
    return NextResponse.json({ error: `Case ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(found);
}

import { NextResponse } from "next/server";
import { getAdapter } from "@/db/adapter";
import { serializeSealedRow } from "@/lib/sealed";

/**
 * One sealed bundle, full contents (AC-J2.4). Public read: the stored
 * bundle is exactly what the engine sealed, so anyone can re-run
 * verification against it.
 */

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adapter = getAdapter();
  if (!adapter) {
    return NextResponse.json(
      { error: "Persistence is not configured on this deployment.", configured: false },
      { status: 404 },
    );
  }

  const row = await adapter.getSealedBundle(id);
  if (!row) {
    return NextResponse.json({ error: `Sealed case ${id} not found.`, configured: true }, { status: 404 });
  }

  return NextResponse.json({ ...serializeSealedRow(row), bundle: row.bundle });
}

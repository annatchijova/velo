import { NextResponse } from "next/server";
import { getAdapter, type SealedBundleFilter } from "@/db/adapter";
import { serializeSealedRow } from "@/lib/sealed";

/**
 * Public sealed-case ledger (AC-J2.3). Reads never require a session —
 * the verdict is visible; that is the point of the product.
 *
 * When no adapter is configured the endpoint degrades to an empty ledger
 * with `configured: false` instead of an error, so demo deployments and
 * local development stay honest without a database.
 */

export const runtime = "nodejs";

const MAX_LIMIT = 100;

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function clampInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(req: Request) {
  const adapter = getAdapter();
  if (!adapter) {
    return NextResponse.json({ sealed: [], total: 0, configured: false });
  }

  const url = new URL(req.url);
  const filter: SealedBundleFilter = {
    verdict: url.searchParams.get("verdict") ?? undefined,
    expertAddress: url.searchParams.get("expert") ?? undefined,
    from: parseDate(url.searchParams.get("from")),
    to: parseDate(url.searchParams.get("to")),
    limit: clampInt(url.searchParams.get("limit"), 50, MAX_LIMIT),
    offset: clampInt(url.searchParams.get("offset"), 0, Number.MAX_SAFE_INTEGER),
  };

  const { rows, total } = await adapter.listSealedBundles(filter);
  return NextResponse.json({
    sealed: rows.map(serializeSealedRow),
    total,
    configured: true,
  });
}

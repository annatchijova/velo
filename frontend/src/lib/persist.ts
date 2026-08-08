import { randomUUID } from "node:crypto";
import { getAdapter } from "@/db/adapter";
import type { SessionPayload } from "@/lib/auth";

/**
 * The persistence decision (AC-J2.2) — deliberately separate from sealing:
 * the engine's work is done and returned either way. Persistence is an
 * addition for registered experts when a database is configured; everything
 * else keeps the demo behavior with a reason attached, never a crash.
 */

export interface PersistOutcome {
  persisted: boolean;
  id?: string;
  reason?: string;
}

export interface SealBundleLike {
  caseId: string;
  sealedAt: string;
  verdict: string;
  bundleHash: string;
}

export async function maybePersistSeal(
  session: SessionPayload | null,
  bundle: SealBundleLike & Record<string, unknown>,
): Promise<PersistOutcome> {
  const adapter = getAdapter();
  if (!adapter) {
    return { persisted: false, reason: "Persistence is not configured on this deployment." };
  }
  if (!session) {
    return { persisted: false, reason: "Demo seal: connect a registered expert wallet to persist." };
  }
  if (session.role !== "expert") {
    return { persisted: false, reason: "This wallet is not a registered expert; the seal was not persisted." };
  }

  try {
    const id = randomUUID();
    await adapter.insertSealedBundle({
      id,
      case_id: bundle.caseId,
      bundle,
      bundle_hash: bundle.bundleHash,
      verdict: bundle.verdict,
      expert_address: session.address,
      sealed_at: new Date(bundle.sealedAt),
    });
    return { persisted: true, id };
  } catch (err) {
    console.error("Sealed-case persistence failed:", err);
    return { persisted: false, reason: "Persistence error — the seal succeeded but was not stored." };
  }
}

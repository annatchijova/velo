import type {
  CaseFile,
  PeritoFile,
  SealedLedgerResponse,
  SessionResponse,
} from "@/lib/types";

/**
 * Server session (AC-J2.1): the connected wallet address is exchanged for a
 * signed httpOnly cookie. The cookie — not this client code — is what the
 * seal route sees, which is what makes persistence a server decision.
 */
export async function establishServerSession(walletAddress: string, name?: string): Promise<SessionResponse> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, name }),
  });
  if (!res.ok) throw new Error("Could not establish a server session");
  return res.json();
}

export async function clearServerSession(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
}

export async function fetchSealedLedger(params?: {
  verdict?: string;
  expert?: string;
  limit?: number;
  offset?: number;
}): Promise<SealedLedgerResponse> {
  const search = new URLSearchParams();
  if (params?.verdict) search.set("verdict", params.verdict);
  if (params?.expert) search.set("expert", params.expert);
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.offset !== undefined) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(`/api/sealed${qs ? `?${qs}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load the sealed ledger");
  return res.json();
}

export async function fetchCases(): Promise<CaseFile[]> {
  const res = await fetch("/api/cases", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load cases");
  return res.json();
}

export async function fetchCase(caseId: string): Promise<CaseFile> {
  const res = await fetch(`/api/cases/${caseId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Case ${caseId} not found`);
  return res.json();
}

export async function fetchPeritos(): Promise<PeritoFile[]> {
  const res = await fetch("/api/peritos", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load examiners");
  return res.json();
}

export async function runEngine(caseFile: CaseFile): Promise<EngineRunResult> {
  const res = await fetch("/api/seal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId: caseFile.case_id,
      artifacts: caseFile.artifacts,
      devilAdvocate: caseFile.devil_advocate,
      custodyEvents: caseFile.custodyEvents ?? [],
      coverageGaps: caseFile.coverageGaps ?? [],
      scenario: "engine-only",
    }),
  });
  if (!res.ok) throw new Error("Engine run failed");
  return res.json();
}

export async function sealCase(caseFile: CaseFile): Promise<SealResult> {
  const res = await fetch("/api/seal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseId: caseFile.case_id,
      artifacts: caseFile.artifacts,
      devilAdvocate: caseFile.devil_advocate,
      custodyEvents: caseFile.custodyEvents ?? [],
      coverageGaps: caseFile.coverageGaps ?? [],
      scenario: "seal",
    }),
  });
  if (!res.ok) throw new Error("Sealing failed");
  return res.json();
}

/**
 * Bug fix: this used to take a single `bundle: unknown` argument and wrap
 * it as `{ bundle }` in the POST body. ActionPanel.tsx calls this as
 * `verifyBundle({ bundle, tamper: mode })` -- passing an options object,
 * not the bundle itself -- so the real bundle ended up double-nested at
 * `body.bundle.bundle`, and `/api/verify` read `body.bundle.custodyChain`,
 * which was always undefined. Every "Verify" click crashed the route with
 * a 500/503, no matter which case or tamper mode. Signature now matches
 * how the route (and the caller) actually use it: bundle and tamper mode
 * as two separate parameters.
 */
export async function verifyBundle(bundle: unknown, tamper?: string): Promise<VerifyResult> {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bundle, tamper }),
  });
  if (!res.ok) throw new Error("Verification failed");
  return res.json();
}

import type {
  EngineRun,
  SealResponse,
  VerifyResponse,
} from "@/lib/types";

type EngineRunResult = EngineRun;
type SealResult = SealResponse;
type VerifyResult = VerifyResponse;

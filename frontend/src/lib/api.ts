import type { CaseFile, PeritoFile } from "@/lib/types";

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

export async function attestCase(
  bundle: unknown,
  walletLabel: string,
): Promise<AttestResult> {
  const res = await fetch("/api/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bundle, walletLabel }),
  });
  if (!res.ok) throw new Error("Attestation failed");
  return res.json();
}

import type {
  AttestResponse,
  EngineRun,
  SealResponse,
  VerifyResponse,
} from "@/lib/types";

type EngineRunResult = EngineRun;
type SealResult = SealResponse;
type VerifyResult = VerifyResponse;
type AttestResult = AttestResponse;

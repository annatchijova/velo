"use client";

import { useState } from "react";
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Link2,
  ServerOff,
  FileSearch,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { VerdictBadge } from "@/components/VerdictBadge";
import { truncateAddress, shortHash } from "@/lib/utils";
import type { Verdict } from "@/lib/types";

/**
 * Public verification panel (AC-J4.1/4.2/4.3). Anyone can query by sealed
 * case id or by commitment and see three facts kept strictly separate:
 * internal consistency + custody (recomputed), the expert-REPORTED
 * attestation record, and the chain-VERIFIED ledger state. Reads never
 * require a session.
 */

type OnChainStatus = "attested" | "not-found" | "unavailable";

interface VerificationResult {
  found: boolean;
  source: "commitment" | "sealed-case";
  sealed: {
    id: string;
    caseId: string;
    verdict: string;
    expertAddress: string;
    sealedAt: string;
    bundleHash: string;
  } | null;
  bundleCheck: { internallyConsistent: boolean; reasons: string[]; doesNotEstablish: string } | null;
  custody: { valid: boolean; reason: string } | null;
  onChain: {
    status: OnChainStatus;
    commitment: string | null;
    ledgerVerdict: string | null;
    trustClass: "chain-verified" | "expert-reported";
  };
}

export default function VerifyPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runVerify() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setResult(null);
    setNotFound(false);
    setError(null);
    try {
      const res = await fetch(`/api/verification?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Verification failed");
      setResult(await res.json());
    } catch {
      setError(t("verify.failed"));
    } finally {
      setBusy(false);
    }
  }

  const onChain = result?.onChain;

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
          {t("verify.title")}
        </h1>
        <p className="mt-2 text-[15px] text-ink-500">{t("verify.subtitle")}</p>
      </header>

      <div className="card-solid rounded-3xl p-5 shadow-soft">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runVerify()}
            placeholder={t("verify.placeholder")}
            aria-label={t("verify.placeholder")}
            className="w-full rounded-xl border border-ink-900/10 px-3.5 py-2.5 text-[14px] outline-none focus:border-brand-indigo/40"
          />
          <button
            onClick={runVerify}
            disabled={busy || !query.trim()}
            className="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t("verify.action")}
          </button>
        </div>
        <p className="mt-2 text-[12px] text-ink-400">{t("verify.hint")}</p>
      </div>

      {error && (
        <div className="card-solid mt-6 flex items-center gap-3 rounded-3xl p-5 text-ink-700">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <p>{error}</p>
        </div>
      )}

      {notFound && (
        <div className="card-solid mt-6 flex items-center gap-3 rounded-3xl p-5 text-ink-700">
          <FileSearch className="h-5 w-5 text-amber-600" />
          <p>{t("verify.notFound")}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          {/* On-chain status */}
          <div className="card-solid rounded-3xl p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {onChain?.status === "attested" ? (
                  <Link2 className="h-5 w-5 text-emerald-600" />
                ) : onChain?.status === "unavailable" ? (
                  <ServerOff className="h-5 w-5 text-amber-600" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-ink-400" />
                )}
                <h2 className="font-display text-[16px] font-bold text-ink-900">
                  {t("verify.onChain")}
                </h2>
              </div>
              {onChain && (
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    onChain.trustClass === "chain-verified"
                      ? "bg-emerald-500/10 text-emerald-700"
                      : "bg-amber-500/10 text-amber-700"
                  }`}
                >
                  {onChain.trustClass === "chain-verified"
                    ? t("verify.chainVerified")
                    : t("verify.expertReported")}
                </span>
              )}
            </div>

            <dl className="mt-3 space-y-1.5 text-[13.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">{t("verify.status")}</dt>
                <dd className="font-semibold text-ink-900">
                  {onChain?.status === "attested"
                    ? t("verify.attested")
                    : onChain?.status === "unavailable"
                      ? t("verify.unavailable")
                      : t("verify.notAttested")}
                </dd>
              </div>
              {onChain?.ledgerVerdict && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("verify.ledgerVerdict")}</dt>
                  <dd>
                    <VerdictBadge verdict={onChain.ledgerVerdict as Verdict} />
                  </dd>
                </div>
              )}
              {onChain?.commitment && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("verify.commitment")}</dt>
                  <dd className="font-mono text-[12px] text-ink-700">{shortHash(onChain.commitment)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 rounded-xl bg-ink-900/[0.03] px-3 py-2 text-[12px] leading-snug text-ink-500">
              {onChain?.trustClass === "chain-verified"
                ? t("verify.chainVerifiedNote")
                : t("verify.expertReportedNote")}
            </p>
          </div>

          {/* Bundle integrity + custody */}
          {result.bundleCheck && (
            <div className="card-solid rounded-3xl p-5 shadow-soft">
              <div className="flex items-center gap-2.5">
                {result.bundleCheck.internallyConsistent ? (
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                )}
                <h2 className="font-display text-[16px] font-bold text-ink-900">
                  {t("verify.integrity")}
                </h2>
              </div>
              <p className="mt-2 text-[13.5px] text-ink-700">
                {result.bundleCheck.internallyConsistent ? t("verify.consistent") : t("verify.inconsistent")}
              </p>
              {result.bundleCheck.reasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-rose-700">
                  {result.bundleCheck.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              {result.custody && (
                <p className="mt-2 text-[13px] text-ink-500">
                  {t("verify.custody")}:{" "}
                  <span className={result.custody.valid ? "text-emerald-700" : "text-rose-700"}>
                    {result.custody.valid ? t("verify.custodyValid") : t("verify.custodyInvalid")}
                  </span>
                </p>
              )}
              <p className="mt-3 rounded-xl bg-ink-900/[0.03] px-3 py-2 text-[12px] leading-snug text-ink-500">
                {result.bundleCheck.doesNotEstablish}
              </p>
            </div>
          )}

          {/* Sealed case metadata */}
          {result.sealed && (
            <div className="card-solid rounded-3xl p-5 shadow-soft">
              <h2 className="font-display text-[16px] font-bold text-ink-900">
                {t("verify.sealedCase")}
              </h2>
              <dl className="mt-3 space-y-1.5 text-[13.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("verify.caseId")}</dt>
                  <dd className="font-semibold text-ink-900">{result.sealed.caseId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("verify.verdict")}</dt>
                  <dd>
                    <VerdictBadge verdict={result.sealed.verdict as Verdict} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("verify.sealedBy")}</dt>
                  <dd className="font-mono text-[12px] text-ink-700">
                    {truncateAddress(result.sealed.expertAddress)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t("verify.sealedAt")}</dt>
                  <dd className="text-ink-700">{new Date(result.sealed.sealedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

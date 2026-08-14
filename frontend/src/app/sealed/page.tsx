"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, SearchX, FileCheck2, Inbox } from "lucide-react";
import { VerdictBadge } from "@/components/VerdictBadge";
import { useI18n } from "@/lib/i18n";
import { truncateAddress, shortHash } from "@/lib/utils";
import type { SealedLedgerRow, SealedLedgerResponse, Verdict } from "@/lib/types";

const VERDICTS: Verdict[] = ["MALICE", "SUSPICION", "NOISE", "ABSTAIN"];

/**
 * Public sealed-case ledger (AC-J2.3, AC-J2.5). Reads never require a
 * session — the verdict is visible; that is the point of the product. When
 * persistence is not configured this page says so, honestly, instead of
 * pretending there is nothing to show.
 */
export default function SealedLedgerPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SealedLedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<"All" | Verdict>("All");

  useEffect(() => {
    fetch("/api/sealed", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(t("sealed.loadFailed")))))
      .then((d: SealedLedgerResponse) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    const all = data?.sealed ?? [];
    return tier === "All" ? all : all.filter((r) => r.verdict === tier);
  }, [data, tier]);

  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16">
        <div className="card-solid flex items-center gap-3 rounded-3xl p-6 text-ink-700">
          <SearchX className="h-5 w-5 text-amber-600" />
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mx-auto flex max-w-4xl justify-center px-4 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
          {t("sealed.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-ink-500">{t("sealed.subtitle")}</p>
      </header>

      {!data.configured ? (
        <div className="card-solid flex items-start gap-3 rounded-3xl p-6 text-ink-700">
          <Inbox className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">{t("sealed.notConfiguredTitle")}</p>
            <p className="mt-1 text-[14px] text-ink-500">{t("sealed.notConfiguredBody")}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {(["All", ...VERDICTS] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTier(v)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  tier === v
                    ? "bg-ink-900 text-white"
                    : "bg-ink-900/5 text-ink-500 hover:bg-ink-900/10"
                }`}
              >
                {v === "All" ? t("sealed.all") : v}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="card-solid flex items-center gap-3 rounded-3xl p-6 text-ink-500">
              <SearchX className="h-5 w-5" />
              <p>{t("sealed.empty")}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row: SealedLedgerRow) => (
                <li key={row.id} className="card-solid rounded-3xl p-5 shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <FileCheck2 className="h-5 w-5 text-brand-indigo" />
                      <div>
                        <p className="font-display text-[16px] font-bold text-ink-900">{row.caseId}</p>
                        <p className="font-mono text-[11px] text-ink-400">
                          {shortHash(row.bundleHash)} · {new Date(row.sealedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <VerdictBadge verdict={row.verdict as Verdict} />
                      {row.attestation ? (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-700">
                          {t("sealed.attested")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-ink-900/5 px-3 py-1 text-[11px] font-semibold text-ink-400">
                          {t("sealed.pending")}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-[11px] text-ink-400">
                    {t("sealed.sealedBy")} {truncateAddress(row.expertAddress)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

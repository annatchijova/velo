"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Quote, Gavel, ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import type { CaseFile, EngineRun } from "@/lib/types";
import { fetchCase, runEngine } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { VerdictBadge } from "@/components/VerdictBadge";
import { VerdictGauge } from "@/components/VerdictGauge";
import { DetectorChips } from "@/components/DetectorChips";
import { ArtifactList } from "@/components/ArtifactList";
import { CustodyChain } from "@/components/CustodyChain";
import { PeirceChain } from "@/components/PeirceChain";
import { ActionPanel } from "@/components/ActionPanel";

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const caseId = decodeURIComponent(params.id);
  const { t } = useI18n();

  const [caseFile, setCaseFile] = useState<CaseFile | null>(null);
  const [engine, setEngine] = useState<EngineRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCase(caseId)
      .then(async (cf) => {
        if (cancelled) return;
        setCaseFile(cf);
        try {
          const run = await runEngine(cf);
          if (!cancelled) setEngine(run);
        } catch {
          if (!cancelled) setEngine(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-[16px] font-bold text-verdict-malice">{error}</p>
        <Link href="/cases" className="btn-primary mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold">
          <ArrowLeft className="h-4 w-4" />
          {t("detail.back")}
        </Link>
      </section>
    );
  }

  if (!caseFile) {
    return (
      <section className="mx-auto flex max-w-4xl items-center justify-center px-4 py-24 text-ink-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t("common.loading")}
      </section>
    );
  }

  const engineVerdict = engine?.score.verdict;
  const matches = engine && engineVerdict === caseFile.expected_verdict;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 pt-6">
      {/* Back */}
      <Link
        href="/cases"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-500 transition hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("detail.back")}
      </Link>

      {/* Header */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[13px] font-bold tracking-wide text-ink-400">
            {caseFile.case_id}
          </span>
          <VerdictBadge verdict={caseFile.expected_verdict} size="md" />
          {engineVerdict && (
            <span className="inline-flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                {t("detail.engine")}
              </span>
              <VerdictBadge verdict={engineVerdict} size="md" />
              {matches ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-verdict-noiseBg px-2.5 py-1 text-[10.5px] font-bold text-verdict-noise">
                  <ShieldAlert className="h-3 w-3" />
                  engine reproduces it
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">
                  mismatch
                </span>
              )}
            </span>
          )}
        </div>
        <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-0.03em] text-ink-900">
          {caseFile.name}
        </h1>
        <p className="mt-2 max-w-[720px] text-[14.5px] leading-relaxed text-ink-500">
          {caseFile.description}
        </p>

        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-brand-indigo/15 bg-brand-indigo/5 px-4 py-3">
          <Quote className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" />
          <p className="text-[13px] italic leading-relaxed text-ink-700">{caseFile.demo_quote}</p>
        </div>
      </div>

      {/* Main grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left — engine result */}
        <div className="space-y-5">
          <div className="card-solid rounded-3xl p-6 shadow-soft">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-brand-indigo" />
              <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-ink-900">
                {t("detail.verdict")}
              </h2>
            </div>
            <div className="mt-3 flex justify-center">
              <VerdictGauge
                score={engine?.score.score ?? "0/1"}
                verdict={engine?.score.verdict ?? caseFile.expected_verdict}
              />
            </div>
            <div className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between rounded-xl bg-ink-900/[0.03] px-3 py-2">
                <span className="font-semibold text-ink-500">{t("detail.corroboration")}</span>
                <span className="font-mono font-extrabold text-ink-900">
                  {engine?.score.corroborationCount ?? caseFile.expected_corroboration_count}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-ink-900/[0.03] px-3 py-2">
                <span className="font-semibold text-ink-500">{t("detail.expected")}</span>
                <VerdictBadge verdict={caseFile.expected_verdict} size="sm" />
              </div>
              {engine && (
                <div className="flex items-center justify-between rounded-xl bg-ink-900/[0.03] px-3 py-2">
                  <span className="font-semibold text-ink-500">{t("detail.engine")}</span>
                  <VerdictBadge verdict={engine.score.verdict} size="sm" />
                </div>
              )}
            </div>
          </div>

          <div className="card-solid rounded-3xl p-6 shadow-soft">
            <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-ink-900">
              {t("detail.detectors")}
            </h2>
            <div className="mt-3">
              {engine ? (
                <DetectorChips detectors={engine.detectorResults} />
              ) : (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-11 rounded-xl" />
                  ))}
                </div>
              )}
            </div>
            {engine && !engine.custodyValid && (
              <p className="mt-3 rounded-xl bg-verdict-abstainBg px-3 py-2 text-[12px] font-semibold leading-relaxed text-verdict-abstain">
                {engine.custodyReason ?? "Custody chain invalid."}
              </p>
            )}
            {caseFile.devil_advocate && (
              <div className="mt-4 rounded-2xl border border-verdict-malice/20 bg-verdict-maliceBg p-4">
                <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-verdict-malice">
                  {t("detail.devil")}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700">
                  {caseFile.devil_advocate}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right — actions + evidence */}
        <div className="space-y-5">
          <ActionPanel caseFile={caseFile} />

          <div className="card-solid rounded-3xl p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-ink-900">
                {t("detail.custody")}
              </h2>
              <span className="text-[11px] text-ink-400">
                {caseFile.custodyEvents.length} event
                {caseFile.custodyEvents.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4">
              <CustodyChain events={caseFile.custodyEvents} />
            </div>
          </div>

          <div className="card-solid rounded-3xl p-6 shadow-soft">
            <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-ink-900">
              {t("detail.evidence")}
            </h2>
            <div className="mt-4">
              <ArtifactList artifacts={caseFile.artifacts} />
            </div>
          </div>

          <div className="card-solid rounded-3xl p-6 shadow-soft">
            <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-ink-900">
              {t("detail.peirce")}
            </h2>
            <div className="mt-4">
              <PeirceChain chain={caseFile.peirce_chain} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

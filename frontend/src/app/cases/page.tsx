"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, LayoutGrid, Rows3, Loader2, SearchX } from "lucide-react";
import { CaseCard } from "@/components/CaseCard";
import { VerdictBadge } from "@/components/VerdictBadge";
import { useI18n } from "@/lib/i18n";
import type { CaseFile, Verdict } from "@/lib/types";

type View = "grid" | "table";

const VERDICTS: Verdict[] = ["MALICE", "SUSPICION", "NOISE", "ABSTAIN"];

export default function CasesPage() {
  const { t } = useI18n();
  const [cases, setCases] = useState<CaseFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"All" | Verdict>("All");
  const [view, setView] = useState<View>("grid");

  useEffect(() => {
    fetch("/api/cases", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(t("cases.loadFailed")))))
      .then((data: CaseFile[]) => setCases(data))
      .catch((e) => setError(e.message));
  }, []);

  const counts = useMemo(() => {
    const c = { All: cases?.length ?? 0, MALICE: 0, SUSPICION: 0, NOISE: 0, ABSTAIN: 0 };
    for (const cs of cases ?? []) {
      c[cs.expected_verdict] += 1;
    }
    return c;
  }, [cases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (cases ?? []).filter((cs) => {
      if (tier !== "All" && cs.expected_verdict !== tier) return false;
      if (!q) return true;
      return (
        cs.case_id.toLowerCase().includes(q) ||
        cs.name.toLowerCase().includes(q) ||
        cs.description.toLowerCase().includes(q)
      );
    });
  }, [cases, search, tier]);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-10 pt-7">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
          Midnight · {cases ? cases.length : "…"} {t("cases.count")}
        </div>
        <h1 className="mt-3 font-display text-[34px] font-extrabold tracking-[-0.03em] text-ink-900">
          {t("cases.title")}
        </h1>
        <p className="mt-2 max-w-[620px] text-[14.5px] leading-relaxed text-ink-500">
          {t("cases.subtitle")}
        </p>

        {/* live counts */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {VERDICTS.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-900/8 bg-white px-3 py-1 text-[12px] font-semibold text-ink-900"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background:
                    v === "MALICE"
                      ? "#BE123C"
                      : v === "SUSPICION"
                        ? "#B45309"
                        : v === "NOISE"
                          ? "#047857"
                          : "#475569",
                }}
              />
              {t(`verdict.${v}`)}
              <span className="rounded-full bg-ink-900/5 px-1.5 text-[11px] font-bold text-ink-500">
                {counts[v]}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="card-solid shadow-soft mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
        <div className="search-wrap relative min-w-[220px] flex-1 rounded-full border border-ink-900/12 bg-white">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("cases.search")}
            aria-label={t("cases.search")}
            className="w-full rounded-full bg-transparent py-2.5 pl-10 pr-9 text-[13.5px] text-ink-900 outline-none placeholder:text-ink-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-ink-900/5 text-[12px] text-ink-500 hover:bg-ink-900/10"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[10.5px] font-bold uppercase tracking-wide text-ink-400 sm:inline">
            {t("cases.filter")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["All", ...VERDICTS] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTier(v)}
                aria-pressed={tier === v}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${
                  tier === v
                    ? "brand-gradient text-white shadow-soft"
                    : "border border-ink-900/10 bg-white text-ink-700 hover:bg-ink-900/5"
                }`}
              >
                {v === "All" ? t("cases.all") : t(`verdict.${v}`)}
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-[10.5px] font-extrabold ${
                    tier === v ? "bg-white/20 text-white" : "bg-ink-900/5 text-ink-500"
                  }`}
                >
                  {counts[v]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-ink-900/10 bg-white p-0.5">
            <button
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              aria-label={t("cases.grid")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${
                view === "grid" ? "bg-ink-900/8 text-ink-900" : "text-ink-400"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("cases.grid")}</span>
            </button>
            <button
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
              aria-label={t("cases.table")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${
                view === "table" ? "bg-ink-900/8 text-ink-900" : "text-ink-400"
              }`}
            >
              <Rows3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("cases.table")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {error && (
        <div className="mt-8 rounded-2xl border border-verdict-malice/20 bg-verdict-maliceBg p-6 text-center text-[13.5px] font-semibold text-verdict-malice">
          {error}
        </div>
      )}

      {!cases && !error && (
        <div className="mt-8 flex items-center justify-center gap-2 py-16 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {cases && filtered.length === 0 && (
        <div className="card-solid mt-8 rounded-3xl p-12 text-center shadow-soft">
          <SearchX className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 text-[16px] font-bold text-ink-900">{t("cases.empty")}</p>
          <p className="mt-1 text-[13px] text-ink-500">{t("cases.emptyDesc")}</p>
          <button
            onClick={() => {
              setSearch("");
              setTier("All");
            }}
            className="btn-primary mt-5 rounded-full px-5 py-2.5 text-[13px] font-bold"
          >
            {t("cases.all")}
          </button>
        </div>
      )}

      {view === "grid" && filtered.length > 0 && (
        <div
          className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-live="polite"
        >
          {filtered.map((cs) => (
            <CaseCard key={cs.case_id} caseFile={cs} />
          ))}
        </div>
      )}

      {view === "table" && filtered.length > 0 && (
        <div className="card-solid mt-7 overflow-hidden rounded-3xl shadow-soft">
          <div className="table-scroll">
            <div className="table-inner">
              <div className="grid grid-cols-[0.7fr_1.4fr_0.8fr_0.5fr] gap-4 border-b border-ink-900/5 bg-ink-900/[0.02] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-400">
                <span>{t("cases.colId")}</span>
                <span>{t("cases.colCase")}</span>
                <span>{t("cases.colDetails")}</span>
                <span>{t("detail.verdict")}</span>
              </div>
              {filtered.map((cs) => (
                <a
                  key={cs.case_id}
                  href={`/cases/${cs.case_id}`}
                  className="grid grid-cols-[0.7fr_1.4fr_0.8fr_0.5fr] items-center gap-4 border-b border-ink-900/5 px-5 py-3.5 transition hover:bg-brand-indigo/5"
                >
                  <span className="font-mono text-[12px] font-bold text-ink-400">
                    {cs.case_id}
                  </span>
                  <span className="truncate text-[13px] font-bold text-ink-900">{cs.name}</span>
                  <span className="text-[12.5px] text-ink-500">
                    {cs.expected_corroboration_count}{" "}
                    {t(cs.expected_corroboration_count === 1 ? "cases.source" : "cases.sources")} ·{" "}
                    {cs.artifacts.length}{" "}
                    {t(cs.artifacts.length === 1 ? "cases.artifact" : "cases.artifacts")}
                  </span>
                  <VerdictBadge verdict={cs.expected_verdict} size="sm" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

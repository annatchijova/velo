"use client";

import Link from "next/link";
import { FileText, Layers, ArrowUpRight } from "lucide-react";
import type { CaseFile } from "@/lib/types";
import { VerdictBadge } from "@/components/VerdictBadge";
import { useI18n } from "@/lib/i18n";

export function CaseCard({ caseFile }: { caseFile: CaseFile }) {
  const { t } = useI18n();
  return (
    <Link
      href={`/cases/${caseFile.case_id}`}
      className="card-solid card-hover group flex flex-col rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-indigo"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[12px] font-bold tracking-wide text-ink-400">
          {caseFile.case_id}
        </span>
        <VerdictBadge verdict={caseFile.expected_verdict} size="sm" />
      </div>
      <h3 className="mt-2 font-display text-[19px] font-extrabold leading-tight tracking-tight text-ink-900">
        {caseFile.name}
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed text-ink-500">
        {caseFile.description}
      </p>
      <div className="mt-4 flex items-center gap-4 border-t border-ink-900/5 pt-3 text-[11.5px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-brand-indigo" />
          {caseFile.expected_corroboration_count} source
          {caseFile.expected_corroboration_count === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-brand-indigo" />
          {caseFile.artifacts.length} artifact
          {caseFile.artifacts.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-brand-deep transition group-hover:translate-x-0.5">
          {t("cases.open") ?? "Open"}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

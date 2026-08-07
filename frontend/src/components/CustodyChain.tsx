"use client";

import { Fingerprint, Link2 } from "lucide-react";
import { useI18n, localized } from "@/lib/i18n";
import type { CustodyEvent } from "@/lib/types";
import { shortHash, formatDate } from "@/lib/utils";

export function CustodyChain({
  events,
  tip,
  genesis,
}: {
  events: CustodyEvent[];
  tip?: string;
  genesis?: string;
}) {
  const { lang } = useI18n();

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-900/15 bg-ink-900/[0.02] p-5 text-center">
        <p className="text-[13px] font-bold text-ink-900">No chain of custody</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
          Without a custody chain the evidence is inadmissible — the engine abstains regardless
          of what the artifacts show.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {genesis && (
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <Fingerprint className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold uppercase tracking-wide">Genesis</span>
          <span className="font-mono">{shortHash(genesis, 12)}</span>
        </div>
      )}
      {events.map((e, i) => (
        <div key={i} className="relative flex items-start gap-3">
          {i < events.length - 1 && (
            <span className="absolute left-[11px] top-7 h-[calc(100%-12px)] w-px bg-ink-900/10" />
          )}
          <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-indigo/30 bg-white text-[10px] font-extrabold text-brand-indigo">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-indigo/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
                {e.eventType}
              </span>
              <span className="text-[11.5px] text-ink-400">{formatDate(e.timestamp)}</span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-700">{localized(lang, e.detail, e.detail_es)}</p>
          </div>
        </div>
      ))}
      {tip && (
        <div className="flex items-center gap-2 rounded-xl bg-ink-900/5 px-3 py-2 text-[11px] text-ink-500">
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold uppercase tracking-wide">Chain tip</span>
          <span className="font-mono">{shortHash(tip, 12)}</span>
          <span className="ml-auto hidden text-[10.5px] italic sm:inline">anti-truncation</span>
        </div>
      )}
    </div>
  );
}

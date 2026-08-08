"use client";

import { EyeOff, ScanSearch } from "lucide-react";
import { useI18n, localized } from "@/lib/i18n";
import type { CoverageGap } from "@/lib/types";

/**
 * What was NOT examined, shown next to the verdict.
 *
 * The engine distinguishes two things that "NOISE" used to say with one
 * word: "I looked everywhere and found nothing" (a true negative) and
 * "the source that would have settled this was never available" (an
 * unknown). Declaring a gap degrades a negative finding to ABSTAIN.
 *
 * This panel exists so a reader can see WHICH source was missing and
 * why, rather than being told a verdict changed for reasons kept
 * offscreen. The engine's own `reasoning` sentence is rendered verbatim,
 * in English, in both languages — deliberately. That exact string is
 * hashed into the analysis fingerprint, so a translated version would
 * show something other than what was sealed.
 */
export function CoverageGaps({ gaps, reasoning }: { gaps: CoverageGap[]; reasoning?: string }) {
  const { t, lang } = useI18n();
  const hasGaps = gaps.length > 0;

  return (
    <div className="card-solid rounded-3xl p-6 shadow-soft">
      <div className="flex items-center gap-2">
        {hasGaps ? (
          <EyeOff className="h-4 w-4 text-verdict-abstain" />
        ) : (
          <ScanSearch className="h-4 w-4 text-brand-indigo" />
        )}
        <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-ink-900">
          {t("detail.coverage")}
        </h2>
      </div>

      {hasGaps ? (
        <>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-500">{t("detail.coverageNote")}</p>
          <ul className="mt-3 space-y-2">
            {gaps.map((g, i) => (
              <li
                key={i}
                className="rounded-2xl border border-verdict-abstain/20 bg-verdict-abstainBg px-3.5 py-2.5"
              >
                <p className="text-[12.5px] font-bold text-ink-900">
                  {localized(lang, g.expected, g.expected_es)}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-700">
                  {localized(lang, g.reason, g.reason_es)}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-500">{t("detail.coverageFull")}</p>
      )}

      {reasoning && (
        <div className="mt-4 border-t border-ink-900/[0.07] pt-3">
          <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-400">
            {t("detail.reasoning")}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-700">{reasoning}</p>
          <p className="mt-1.5 text-[10.5px] italic leading-relaxed text-ink-400">
            {t("detail.reasoningSealed")}
          </p>
        </div>
      )}
    </div>
  );
}

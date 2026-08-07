import { Check, X } from "lucide-react";
import type { DetectorResult } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

const DETECTOR_KEYS = new Set(["temporal", "cross_source", "anti_forensic", "narrative", "process"]);

export function DetectorChips({ detectors }: { detectors: DetectorResult[] }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {detectors.map((d) => {
        const label = DETECTOR_KEYS.has(d.name) ? t(`detector.${d.name}` as never) : d.name;
        return (
          <div
            key={d.name}
            className={`card-solid flex items-center justify-between rounded-xl px-3.5 py-2.5 ${
              d.fired ? "border-verdict-malice/25" : ""
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  d.fired ? "bg-verdict-maliceBg text-verdict-malice" : "bg-ink-900/5 text-ink-400"
                }`}
              >
                {d.fired ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </span>
              <span className={`text-[12.5px] font-bold ${d.fired ? "text-ink-900" : "text-ink-400"}`}>
                {label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {d.fired && (
                <span className="hidden rounded-full bg-verdict-maliceBg px-2 py-0.5 text-[10px] font-bold text-verdict-malice md:inline">
                  {d.weight} · {d.fractures.length} fracture{d.fractures.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

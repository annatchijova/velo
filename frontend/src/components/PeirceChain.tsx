import { Triangle } from "lucide-react";
import type { PeirceChain as PeirceChainType } from "@/lib/types";

const STEPS = [
  { key: "firstness", label: "Firstness", hint: "what presents itself" },
  { key: "secondness", label: "Secondness", hint: "the resisting fact" },
  { key: "thirdness", label: "Thirdness", hint: "the interpreted rule" },
] as const;

export function PeirceChain({ chain }: { chain: PeirceChainType }) {
  return (
    <div className="space-y-3">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-extrabold text-white">
              {i + 1}
            </span>
            {i < STEPS.length - 1 && <span className="mt-1 h-full w-px bg-ink-900/10" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-extrabold uppercase tracking-wide text-ink-900">
                {s.label}
              </span>
              <span className="text-[11px] italic text-ink-400">{s.hint}</span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
              {chain[s.key]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

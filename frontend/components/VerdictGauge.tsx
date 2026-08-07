"use client";

import { useEffect, useState } from "react";
import type { Verdict } from "@/lib/types";
import { VERDICT_STYLE } from "@/components/VerdictBadge";
import { fractionToNumber } from "@/lib/utils";

export function VerdictGauge({
  score,
  verdict,
  label,
}: {
  score: string; // fraction "num/den" or decimal
  verdict: Verdict;
  label?: string;
}) {
  const value = fractionToNumber(score);
  const [progress, setProgress] = useState(0);
  const style = VERDICT_STYLE[verdict];
  const R = 80;
  const CIRC = 2 * Math.PI * R;

  useEffect(() => {
    const t = setTimeout(() => setProgress(Math.min(Math.max(value, 0), 1)), 60);
    return () => clearTimeout(t);
  }, [value]);

  const pct = Math.min(Math.max(progress, 0), 1);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[200px] w-[200px]">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(11,18,32,0.07)" strokeWidth="14" />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={style.dot}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct)}
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.23,1,0.32,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[34px] font-extrabold leading-none tracking-tight" style={{ color: style.dot }}>
            {(value * 100).toFixed(1)}
            <span className="text-[16px] font-bold">%</span>
          </span>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-400">
            {label ?? "score"}
          </span>
        </div>
      </div>
      <p className="mt-2 max-w-[220px] text-center text-[12px] leading-relaxed text-ink-500">
        Score <span className="font-mono font-semibold text-ink-700">{score}</span> · threshold{" "}
        <span className="font-mono font-semibold text-ink-700">33/100</span>
      </p>
    </div>
  );
}

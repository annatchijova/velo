import type { Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export const VERDICT_STYLE: Record<
  Verdict,
  { text: string; bg: string; dot: string; ring: string }
> = {
  MALICE: { text: "#BE123C", bg: "#FFF1F3", dot: "#BE123C", ring: "#BE123C" },
  SUSPICION: { text: "#B45309", bg: "#FFFBEB", dot: "#B45309", ring: "#B45309" },
  NOISE: { text: "#047857", bg: "#ECFDF5", dot: "#047857", ring: "#047857" },
  ABSTAIN: { text: "#475569", bg: "#F1F5F9", dot: "#475569", ring: "#475569" },
};

export function VerdictBadge({
  verdict,
  size = "md",
  className,
}: {
  verdict: Verdict;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const s = VERDICT_STYLE[verdict];
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold",
        size === "sm" && "px-2.5 py-0.5 text-[11px]",
        size === "md" && "px-3 py-1 text-[12.5px]",
        size === "lg" && "px-4 py-1.5 text-sm",
        className,
      )}
      style={{ background: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {t(`verdict.${verdict}`)}
    </span>
  );
}

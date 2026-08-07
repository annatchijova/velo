import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerdictBadge } from "./VerdictBadge";
import { I18nProvider } from "@/lib/i18n";

// English labels, matching dict.en in src/lib/i18n.tsx — VerdictBadge reads
// them via t(`verdict.${verdict}`) so both languages share one source of
// truth instead of a second hardcoded copy drifting out of sync (the same
// lesson as red team F5/F8 in the root project: two copies of one fact
// eventually disagree).
const EN_LABEL = { MALICE: "Malice", SUSPICION: "Suspicion", NOISE: "Noise", ABSTAIN: "Abstain" } as const;

function renderBadge(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("VerdictBadge", () => {
  it("renders the label for each verdict tier", () => {
    const verdicts = ["MALICE", "SUSPICION", "NOISE", "ABSTAIN"] as const;
    const { rerender } = renderBadge(<VerdictBadge verdict="MALICE" />);

    for (const v of verdicts) {
      rerender(<I18nProvider><VerdictBadge verdict={v} /></I18nProvider>);
      expect(screen.getByText(EN_LABEL[v])).toBeInTheDocument();
    }
  });

  it("applies size classes for sm, md, and lg", () => {
    const { rerender } = renderBadge(<VerdictBadge verdict="MALICE" size="sm" />);
    expect(screen.getByText(EN_LABEL.MALICE)).toHaveClass("text-[11px]");

    rerender(<I18nProvider><VerdictBadge verdict="MALICE" size="md" /></I18nProvider>);
    expect(screen.getByText(EN_LABEL.MALICE)).toHaveClass("text-[12.5px]");

    rerender(<I18nProvider><VerdictBadge verdict="MALICE" size="lg" /></I18nProvider>);
    expect(screen.getByText(EN_LABEL.MALICE)).toHaveClass("text-sm");
  });
});

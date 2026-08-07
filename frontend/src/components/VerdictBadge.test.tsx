import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerdictBadge, VERDICT_LABEL } from "./VerdictBadge";

describe("VerdictBadge", () => {
  it("renders the label for each verdict tier", () => {
    const verdicts = ["MALICE", "SUSPICION", "NOISE", "ABSTAIN"] as const;
    const { rerender } = render(<VerdictBadge verdict="MALICE" />);

    for (const v of verdicts) {
      rerender(<VerdictBadge verdict={v} />);
      expect(screen.getByText(VERDICT_LABEL[v])).toBeInTheDocument();
    }
  });

  it("applies size classes for sm, md, and lg", () => {
    const { rerender } = render(<VerdictBadge verdict="MALICE" size="sm" />);
    expect(screen.getByText(VERDICT_LABEL.MALICE)).toHaveClass("text-[11px]");

    rerender(<VerdictBadge verdict="MALICE" size="md" />);
    expect(screen.getByText(VERDICT_LABEL.MALICE)).toHaveClass("text-[12.5px]");

    rerender(<VerdictBadge verdict="MALICE" size="lg" />);
    expect(screen.getByText(VERDICT_LABEL.MALICE)).toHaveClass("text-sm");
  });
});

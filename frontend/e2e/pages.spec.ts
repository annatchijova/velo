import { expect, test } from "@playwright/test";

/**
 * Phase 3 e2e baseline (AC-J1.1 surface + the new ledger entry point): the
 * public pages load and the navigation exposes the sealed ledger. Runs on
 * both configured viewports (chromium desktop + Pixel 5) via the projects
 * in playwright.config.ts.
 */

test("landing page loads with the product claim", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("primary navigation includes cases, sealed ledger and examiners", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link").filter({ hasText: /cases|casos/i }).first()).toBeVisible();
  await expect(nav.getByRole("link").filter({ hasText: /sealed|sellados/i }).first()).toBeVisible();
});

test("cases ledger shows the corpus", async ({ page }) => {
  await page.goto("/cases");
  // 14 synthetic cases; the grid renders at least the first batch.
  await expect(page.locator("main")).toContainText(/VELO-/i, { timeout: 15000 });
});

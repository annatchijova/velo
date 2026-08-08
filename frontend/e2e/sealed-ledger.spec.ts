import { expect, test } from "@playwright/test";

/**
 * Phase 3 (AC-J2.3 degradation path): with no database configured the
 * sealed ledger API answers "nothing persisted" — an honest empty state,
 * never an error — and the page says exactly that.
 *
 * These specs run against the dev server WITHOUT DB_ADAPTER/DATABASE_URL
 * (the CI job for DB-backed flows is separate and gated on a provisioned
 * database).
 */

test("GET /api/sealed degrades to an empty, unconfigured ledger", async ({ request }) => {
  const res = await request.get("/api/sealed");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.configured).toBe(false);
  expect(body.sealed).toEqual([]);
  expect(body.total).toBe(0);
});

test("GET /api/sealed/:id answers 404 with configured:false when persistence is off", async ({ request }) => {
  const res = await request.get("/api/sealed/anything");
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.configured).toBe(false);
});

test("the /sealed page explains persistence is not configured", async ({ page }) => {
  await page.goto("/sealed");
  await expect(page.locator("main")).toContainText(/persistence is not configured|persistencia no está configurada/i, {
    timeout: 15000,
  });
});

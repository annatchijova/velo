import { expect, test } from "@playwright/test";

/**
 * Phase 3 (AC-J2.1, AC-J2.2, AC-J2.6): wallet connect establishes a server
 * session, and sealing with a connected-but-UNREGISTERED wallet degrades to
 * `persisted: false` (no database, no role-registry entry here).
 *
 * `window.midnight` is mocked with a fake Lace wallet; AUTH_SECRET is set in
 * playwright.config.ts so sessions are issuable. DB-backed persistence is a
 * separate, provisioned-database flow — not this spec.
 */

const MOCK_ADDRESS = "ab".repeat(32);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((address) => {
    const mockApi = {
      getConnectionStatus: async () => ({ status: "connected" }),
      getShieldedAddresses: async () => ({ shieldedAddress: address }),
    };
    (window as unknown as Record<string, unknown>).midnight = {
      mockLace: { name: "Lace", connect: async () => mockApi },
    };
  }, MOCK_ADDRESS);
});

test("connect establishes a server session and updates the navbar", async ({ page }) => {
  await page.goto("/login");
  const sessionResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/auth/session") && res.request().method() === "POST",
    { timeout: 8000 },
  );
  await page.getByRole("button", { name: /lace/i }).first().click();

  // The session chip lives in the header, beside (not inside) the primary nav.
  await expect(page.locator("header")).toContainText(/lace/i, { timeout: 10000 });

  const sessionResponse = await sessionResponsePromise;
  expect(sessionResponse.status()).toBe(200);
  const setCookies = await sessionResponse.headerValues("set-cookie");
  expect(setCookies.join(";")).toContain("velo_session=");
  // Unknown wallet → session exists but role is none (AC-J2.6).
  const body = await sessionResponse.json();
  expect(body.role).toBe("none");
});

test("seal with an unregistered connected wallet is not persisted (AC-J2.2)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /lace/i }).first().click();
  await expect(page.locator("header")).toContainText(/lace/i, { timeout: 10000 });

  // Pull a real case payload, then seal it through the page's request
  // context so the session cookie is attached.
  const caseRes = await page.request.get("/api/cases/VELO-004");
  expect(caseRes.ok()).toBeTruthy();
  const caseFile = await caseRes.json();

  const sealRes = await page.request.post("/api/seal", {
    data: {
      caseId: caseFile.case_id,
      artifacts: caseFile.artifacts,
      devilAdvocate: caseFile.devil_advocate,
      custodyEvents: caseFile.custodyEvents ?? [],
      coverageGaps: caseFile.coverageGaps ?? [],
      scenario: "seal",
    },
  });
  expect(sealRes.ok()).toBeTruthy();
  const seal = await sealRes.json();
  expect(seal.persisted).toBe(false);
  expect(seal.persistenceReason).toBeTruthy();
});

test("disconnect clears the session", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /lace/i }).first().click();
  await expect(page.locator("header")).toContainText(/lace/i, { timeout: 10000 });

  await page.getByRole("button", { name: /disconnect|desconectar/i }).click();
  await expect(page.getByRole("link", { name: /connect|conectar/i }).first()).toBeVisible({
    timeout: 8000,
  });
});

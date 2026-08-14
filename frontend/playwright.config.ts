import { defineConfig, devices } from "@playwright/test";

// Overridable so e2e can run next to an unrelated process that already
// holds 3000 (CI uses the default; locally: PLAYWRIGHT_PORT=3100).
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Sessions must be issuable under e2e — the wallet-connect specs assert
    // the full cookie flow, which requires AUTH_SECRET to be set.
    env: {
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-do-not-use-elsewhere",
    },
  },
});

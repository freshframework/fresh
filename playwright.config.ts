import { defineConfig, devices } from "@playwright/test";

// Real-browser end-to-end tests for the client runtime (island hydration,
// partial navigation, forms, history). They run against the `tests/fixture`
// Fresh app, which Playwright boots via Vite on a fixed port.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // On CI: GitHub annotations + an HTML report (uploaded as an artifact);
  // `open: "never"` so it doesn't try to launch a browser in CI.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:8765",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "pnpm --filter fresh-test-fixture run dev",
    url: "http://localhost:8765",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

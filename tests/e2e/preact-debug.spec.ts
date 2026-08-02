import { expect, test } from "@playwright/test";

// The dev server pulls in `preact/debug` from the client boot chunk, so
// Preact's development warnings and the devtools bridge are on without the
// app wiring up an `entry.client.ts`. (These tests run against `vite dev`.)
test("preact/debug is loaded on a page with islands in dev", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (req) => requested.push(req.url()));

  await page.goto("/islands");
  // Hydration finishing means the boot chunk evaluated — including its
  // top-level `await import("preact/debug")`.
  await expect(page.locator("#counter")).toHaveAttribute("data-hydrated", "true");

  expect(requested.some((url) => /preact[_/]debug/.test(url))).toBe(true);
});

import { expect, test } from "@playwright/test";

// Serialized event handlers attached to page-level elements (no island):
// the framework factories from `fresh/events` plus a custom factory handler.
test.beforeEach(async ({ page }) => {
  await page.goto("/serialize/page-reactivity");
  // boot strips `f-eh` once page-level handlers are wired.
  await expect(page.locator("[f-eh]")).toHaveCount(0);
});

test("setValue and add update a numeric signal", async ({ page }) => {
  await page.locator("#set5").click(); // setValue(count, 5)
  await expect(page.getByTestId("count-text")).toHaveText("5");
  await page.locator("#inc").click(); // add(count, 1)
  await expect(page.getByTestId("count-text")).toHaveText("6");
});

test("toggle flips a boolean signal", async ({ page }) => {
  // `open` starts false → the `not(open)` mirror is "true".
  await expect(page.getByTestId("not-open")).toHaveText("true");
  await page.locator("#toggle").click(); // toggle(open)
  await expect(page.getByTestId("not-open")).toHaveText("false");
});

test("a custom (factory-built) handler updates a signal", async ({ page }) => {
  await page.locator("#add10").click(); // addTo(count, 10)
  await expect(page.getByTestId("count-text")).toHaveText("10");
});

test("setFromProp writes an input's value back into the signal", async ({ page }) => {
  await page.locator("#text-input").fill("world");
  await expect(page.getByTestId("text-mirror")).toHaveText("world");
});

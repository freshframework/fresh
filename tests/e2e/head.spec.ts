import { expect, test } from "@playwright/test";

// `<Head>` hoists head-eligible elements into the document `<head>` from routes,
// layouts, and islands — with dedup — and stays reactive client-side.
test.describe("Head", () => {
  test("a route <Head> sets the title (overriding the shell) and adds meta + link", async ({
    page,
  }) => {
    await page.goto("/head");
    await expect(page).toHaveTitle("Head Home");
    // The shell's <title>fixture</title> was deduped away — exactly one remains.
    await expect(page.locator("head title")).toHaveCount(1);
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      "content",
      "home description",
    );
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://example.com/head",
    );
  });

  test("a layout <Head> contributes alongside the page's", async ({ page }) => {
    await page.goto("/head");
    await expect(page.locator('head meta[name="section"]')).toHaveAttribute(
      "content",
      "head-section",
    );
  });

  test("an island updates document.title reactively", async ({ page }) => {
    await page.goto("/head/reactive");
    await expect(page.locator("#title-inc")).toHaveAttribute("data-hydrated", "true");
    await expect(page).toHaveTitle("count 0");
    await page.locator("#title-inc").click();
    await expect(page).toHaveTitle("count 1");
    await page.locator("#title-inc").click();
    await expect(page).toHaveTitle("count 2");
  });

  test("a partial navigation syncs the <Head> delta", async ({ page }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await expect(page).toHaveTitle("Partials Home");

    await page.locator("#nav-about").click();
    await expect(page.getByTestId("panel-about")).toBeVisible();
    await expect(page).toHaveTitle("Partials About");
  });
});

import { expect, test } from "@playwright/test";

// Page-level signal reactivity (no island wrapper): signals as text nodes,
// signals bound to attributes, and serialized computeds that re-run on the
// client.
test.describe("page-level reactivity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/serialize/page-reactivity");
    // boot strips `f-eh` / `f-s` once page-level bindings are wired — a
    // deterministic "the runtime is ready" signal.
    await expect(page.locator("[f-eh]")).toHaveCount(0);
    await expect(page.locator("[f-s]")).toHaveCount(0);
  });

  test("a signal renders as a reactive text node", async ({ page }) => {
    await expect(page.getByTestId("count-text")).toHaveText("0");
    await page.locator("#inc").click();
    await expect(page.getByTestId("count-text")).toHaveText("1");
  });

  test("a makeComputed derivation stays reactive on the client", async ({ page }) => {
    await expect(page.getByTestId("doubled-text")).toHaveText("0");
    await page.locator("#inc").click();
    await expect(page.getByTestId("doubled-text")).toHaveText("2");
    await page.locator("#set5").click();
    await expect(page.getByTestId("doubled-text")).toHaveText("10");
  });

  test("a built-in computed (not) stays reactive on the client", async ({ page }) => {
    await expect(page.getByTestId("not-open")).toHaveText("true");
    await page.locator("#toggle").click();
    await expect(page.getByTestId("not-open")).toHaveText("false");
  });

  test("an attribute-bound signal pushes its value into the input", async ({ page }) => {
    await page.locator("#set-text").click(); // setValue(text, "preset")
    await expect(page.locator("#text-input")).toHaveValue("preset");
    await expect(page.getByTestId("text-mirror")).toHaveText("preset");
  });
});

// The remaining built-in computeds from `fresh/signals`. Each is a serialized
// factory whose derivation re-runs on the client and tracks its signal inputs.
test.describe("built-in computeds", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/serialize/computeds");
    await expect(page.locator("[f-eh]")).toHaveCount(0);
    await expect(page.locator("[f-s]")).toHaveCount(0);
  });

  test("equals() tracks strict equality", async ({ page }) => {
    await expect(page.getByTestId("is-five")).toHaveText("false");
    await page.locator("#set5").click();
    await expect(page.getByTestId("is-five")).toHaveText("true");
    await page.locator("#inc").click(); // 6
    await expect(page.getByTestId("is-five")).toHaveText("false");
  });

  test("test() matches a regexp against a signal", async ({ page }) => {
    await expect(page.getByTestId("is-alpha")).toHaveText("false");
    await page.locator("#text").fill("hello");
    await expect(page.getByTestId("is-alpha")).toHaveText("true");
    await page.locator("#text").fill("h3llo");
    await expect(page.getByTestId("is-alpha")).toHaveText("false");
  });

  test("and() is true only when every input is truthy", async ({ page }) => {
    await expect(page.getByTestId("both")).toHaveText("false");
    await page.locator("#toggle-a").click();
    await expect(page.getByTestId("both")).toHaveText("false");
    await page.locator("#toggle-b").click();
    await expect(page.getByTestId("both")).toHaveText("true");
  });

  test("or() is true when any input is truthy", async ({ page }) => {
    await expect(page.getByTestId("either")).toHaveText("false");
    await page.locator("#toggle-a").click();
    await expect(page.getByTestId("either")).toHaveText("true");
  });
});

// Signals bound to intrinsic DOM props at the page level. These exercise the
// client `setProperty` port that applies signal changes to real nodes.
test.describe("signal-bound DOM props", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/serialize/dom-props");
    await expect(page.locator("[f-eh]")).toHaveCount(0);
    await expect(page.locator("[f-s]")).toHaveCount(0);
  });

  test("a boolean property (disabled) is added and removed", async ({ page }) => {
    await expect(page.locator("#target")).toBeEnabled();
    await page.locator("#toggle-disabled").click();
    await expect(page.locator("#target")).toBeDisabled();
    await page.locator("#toggle-disabled").click();
    await expect(page.locator("#target")).toBeEnabled();
  });

  test("a string attribute (class) updates", async ({ page }) => {
    await expect(page.locator("#box")).toHaveClass("box red");
    await page.locator("#set-class").click();
    await expect(page.locator("#box")).toHaveClass("box blue");
  });

  test("a style-object prop diffs and applies", async ({ page }) => {
    await expect(page.locator("#styled")).toHaveCSS("color", "rgb(255, 0, 0)");
    await page.locator("#set-style").click();
    await expect(page.locator("#styled")).toHaveCSS("color", "rgb(0, 128, 0)");
  });

  test("an aria attribute keeps its false value rather than being removed", async ({ page }) => {
    await expect(page.locator("#aria")).toHaveAttribute("aria-pressed", "false");
    await page.locator("#toggle-pressed").click();
    await expect(page.locator("#aria")).toHaveAttribute("aria-pressed", "true");
  });
});

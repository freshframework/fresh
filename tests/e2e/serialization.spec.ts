import { expect, test } from "@playwright/test";

// How values cross the server→client wire as island props.
test.describe("island props", () => {
  // Signals, plain values, island-exported functions, factory-built functions,
  // and the preservation of a single identity across multiple holders.
  test.beforeEach(async ({ page }) => {
    await page.goto("/serialize/island-props");
    await expect(page.getByTestId("probe")).toHaveAttribute("data-hydrated", "true");
  });

  test("a serialized signal prop renders reactively in the island", async ({ page }) => {
    await expect(page.getByTestId("probe-count")).toHaveText("10");
    await expect(page.getByTestId("page-count")).toHaveText("10");
  });

  test("a serialized (island-exported) function prop is revived and callable", async ({ page }) => {
    // `fn={greet}` called as `props.fn("ada")` inside the island.
    await expect(page.getByTestId("probe-greet")).toHaveText("hi ada");
  });

  test("a factory-built function prop works on the client", async ({ page }) => {
    await page.locator("#probe-bump").click(); // onBump = addTo(count, 5)
    await expect(page.getByTestId("probe-count")).toHaveText("15");
  });

  test("an island receives multiple mixed-type props, all revived", async ({ page }) => {
    await expect(page.getByTestId("probe-count")).toHaveText("10"); // signal
    await expect(page.getByTestId("probe-step")).toHaveText("3"); // number
    await expect(page.getByTestId("probe-greet")).toHaveText("hi ada"); // fn + string
  });

  test("a signal keeps a single identity across the page and two islands", async ({ page }) => {
    // Mutate `count` via the factory handler inside the first island…
    await page.locator("#probe-bump").click();
    // …and every holder of that same revived signal reflects it.
    await expect(page.getByTestId("probe-count")).toHaveText("15");
    await expect(page.getByTestId("mirror-count")).toHaveText("15");
    await expect(page.getByTestId("page-count")).toHaveText("15");
  });
});

// Rich built-in value types must revive as their proper type (not a plain
// object) on the client. Each assertion is produced by an `instanceof` /
// `typeof` check inside the island, against the devalue-revived value.
test.describe("rich value props", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/serialize/values");
    await expect(page.getByTestId("values")).toHaveAttribute("data-hydrated", "true");
  });

  test("a Date prop revives as a Date", async ({ page }) => {
    await expect(page.getByTestId("v-date")).toHaveText("2026-01-02T03:04:05.000Z");
  });

  test("a Map prop revives as a Map", async ({ page }) => {
    await expect(page.getByTestId("v-map")).toHaveText("1"); // map.get("a")
  });

  test("a Set prop revives as a Set", async ({ page }) => {
    await expect(page.getByTestId("v-set")).toHaveText("1,2,3");
  });

  test("a BigInt prop revives as a bigint", async ({ page }) => {
    await expect(page.getByTestId("v-big")).toHaveText("12345678901234567890");
  });

  test("a RegExp prop revives as a RegExp", async ({ page }) => {
    // `source | flags | test("ABC")`
    await expect(page.getByTestId("v-re")).toHaveText("^[a-z]+$|i|true");
  });

  test("a cyclic reference is restored", async ({ page }) => {
    await expect(page.getByTestId("v-cyclic")).toHaveText("cycle-ok");
  });
});

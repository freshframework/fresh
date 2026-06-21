import { expect, test } from "@playwright/test";

test("an island hydrates and becomes interactive", async ({ page }) => {
  await page.goto("/islands");
  const counter = page.locator("#counter");
  await expect(counter).toHaveText("count:0");
  // `data-hydrated` flips once the island has mounted on the client.
  await expect(counter).toHaveAttribute("data-hydrated", "true");
  await counter.click();
  await expect(counter).toHaveText("count:1");
});

test("a co-located island in a (_islands) group folder hydrates and is interactive", async ({
  page,
}) => {
  await page.goto("/colocated");
  const local = page.locator("#local-counter");
  await expect(local).toHaveText("local:0");
  await expect(local).toHaveAttribute("data-hydrated", "true");
  await local.click();
  await expect(local).toHaveText("local:1");
});

test("an island that server-renders to null still hydrates and renders after mount", async ({
  page,
}) => {
  await page.goto("/null-island");
  // The content only appears once the island has hydrated and its effect ran —
  // its SSR output was empty (the component returned null on the server).
  const content = page.locator("#null-content");
  await expect(content).toHaveText("ready");
  await expect(content).toHaveAttribute("data-hydrated", "true");
});

test.describe("nested islands", () => {
  test("the outer island and the island nested inside it both hydrate and share state", async ({
    page,
  }) => {
    await page.goto("/nested");

    // The outer island hydrated…
    await expect(page.getByTestId("nested-outer")).toHaveAttribute("data-hydrated", "true");
    // …and so did the inner island, which the outer renders within its own tree
    // (the server sent it inline, with no markers or serialized props — note the
    // inner's `onInc` prop is a plain, non-serializable closure).
    await expect(page.locator("#inner-btn")).toHaveAttribute("data-hydrated", "true");

    await expect(page.getByTestId("nested-view")).toHaveText("value:0");
    await expect(page.locator("#inner-btn")).toHaveText("inner:0");

    // The outer's button and the inner island both drive the outer's signal —
    // proving the inner is live and shares the outer's state.
    await page.locator("#outer-btn").click();
    await expect(page.getByTestId("nested-view")).toHaveText("value:1");
    await expect(page.locator("#inner-btn")).toHaveText("inner:1");

    await page.locator("#inner-btn").click();
    await expect(page.getByTestId("nested-view")).toHaveText("value:2");
    await expect(page.locator("#inner-btn")).toHaveText("inner:2");
  });
});

import { expect, test } from "@playwright/test";

// JSX passed as island props ("slots"). The JSX is rendered to DOM on the
// server and grafted into the client island via a `<Slot>` — it is never
// structurally serialized.
test.describe("island slots (JSX props)", () => {
  test("a rendered slot survives hydration in place", async ({ page }) => {
    await page.goto("/slots");
    await expect(page.getByTestId("slot-host")).toHaveAttribute("data-hydrated", "true");

    // The `children` slot was rendered inline; after hydration the grafted DOM
    // is still there, in its place inside the island, markup intact.
    const child = page.getByTestId("children-content");
    await expect(child).toBeVisible();
    await expect(child).toContainText("hello from a slot");
    await expect(child.locator("strong")).toHaveText("slot");
    await expect(page.getByTestId("slot-children").getByTestId("children-content")).toBeVisible();
  });

  test("a rendered slot keeps the island's own siblings around it", async ({ page }) => {
    await page.goto("/slots");
    await expect(page.getByTestId("slot-host")).toHaveAttribute("data-hydrated", "true");

    // The island renders elements of its own on both sides of the slot, with
    // the same tag name the slot's content uses. Preact must hydrate those
    // against its own server-rendered DOM — if the slot's nodes are still
    // attached at hydration time it adopts one of them instead, overwriting the
    // slot content and dropping the island's own element as excess.
    await expect(page.getByTestId("before-slot")).toHaveText("before");
    await expect(page.getByTestId("after-slot")).toHaveText("after");
    await expect(page.getByTestId("children-content")).toContainText("hello from a slot");

    // …and in that order, with the slot between them.
    const order = await page
      .getByTestId("slot-children")
      .evaluate((el) => Array.from(el.children, (c) => c.getAttribute("data-testid")));
    expect(order).toEqual(["before-slot", "children-content", "after-slot"]);
  });

  test("an initially-unrendered slot is grafted from its template when the island renders it", async ({
    page,
  }) => {
    await page.goto("/slots");
    await expect(page.getByTestId("slot-host")).toHaveAttribute("data-hydrated", "true");

    // The `extra` slot isn't rendered initially — it lives in a <template>, so
    // its content isn't visible yet.
    await expect(page.getByTestId("extra-content")).toHaveCount(0);

    // Toggling makes the island render the prop: the <Slot> grafts the
    // template's DOM into place.
    await page.locator("#toggle-extra").click();
    await expect(page.getByTestId("extra-content")).toBeVisible();
    await expect(page.getByTestId("extra-content")).toHaveText("extra slot content");
    await expect(page.getByTestId("slot-extra").getByTestId("extra-content")).toBeVisible();
  });

  test("interactive slot content hydrates: inline signal, attribute signal, event handler, and an island", async ({
    page,
  }) => {
    await page.goto("/slots-rich");
    await expect(page.getByTestId("slot-host")).toHaveAttribute("data-hydrated", "true");

    // The island nested inside the slot hydrated independently.
    const island = page.locator("#slot-island");
    await expect(island).toHaveAttribute("data-hydrated", "true");

    // Initial server-rendered values from the shared page-level `count` signal.
    await expect(page.getByTestId("slot-count")).toHaveText("0");
    await expect(page.getByTestId("slot-attr")).toHaveAttribute("data-n", "0");

    // The serialized event handler drives the page-level signal, updating both
    // the inline text and the bound attribute — proving signal/handler hydration
    // inside the grafted slot, all wired to one signal.
    await page.locator("#slot-inc").click();
    await expect(page.getByTestId("slot-count")).toHaveText("1");
    await expect(page.getByTestId("slot-attr")).toHaveAttribute("data-n", "1");
    await page.locator("#slot-inc").click();
    await expect(page.getByTestId("slot-count")).toHaveText("2");
    await expect(page.getByTestId("slot-attr")).toHaveAttribute("data-n", "2");

    // The slot's island has its own independent state.
    await island.click();
    await expect(island).toHaveText("count:1");
    await expect(page.getByTestId("slot-count")).toHaveText("2"); // unaffected
  });

  test("a templated (initially-unrendered) slot hydrates interactively once grafted", async ({
    page,
  }) => {
    await page.goto("/slots-template");
    await expect(page.getByTestId("slot-host")).toHaveAttribute("data-hydrated", "true");

    // Not rendered at SSR → lives in a <template>, not visible yet.
    await expect(page.getByTestId("tpl-slot")).toHaveCount(0);

    // Toggling makes the island render the prop → the <Slot> grafts the
    // template's DOM and hydrates it: the island comes alive…
    await page.locator("#toggle-extra").click();
    await expect(page.getByTestId("tpl-slot")).toBeVisible();
    await expect(page.locator("#tpl-island")).toHaveAttribute("data-hydrated", "true");

    // …and so do the inline signal + serialized handler in the templated slot.
    await expect(page.getByTestId("tpl-count")).toHaveText("0");
    await page.locator("#tpl-inc").click();
    await expect(page.getByTestId("tpl-count")).toHaveText("1");

    await page.locator("#tpl-island").click();
    await expect(page.locator("#tpl-island")).toHaveText("count:1");
  });

  test("a slot whose render condition toggles on/off/on is grafted, removed, then re-grafted", async ({
    page,
  }) => {
    await page.goto("/slots-template");
    await expect(page.getByTestId("slot-host")).toHaveAttribute("data-hydrated", "true");

    // Initially unrendered (lives in a <template>).
    await expect(page.getByTestId("tpl-slot")).toHaveCount(0);

    // Condition true → the <Slot> grafts the template DOM in and hydrates it.
    await page.locator("#toggle-extra").click();
    await expect(page.getByTestId("tpl-slot")).toBeVisible();
    await expect(page.locator("#tpl-island")).toHaveAttribute("data-hydrated", "true");

    // Drive the inline signal so we have state to look for after a round-trip.
    await page.locator("#tpl-inc").click();
    await expect(page.getByTestId("tpl-count")).toHaveText("1");

    // Condition false → the island stops rendering the prop, so the <Slot>
    // unmounts and removes its grafted DOM from the page.
    await page.locator("#toggle-extra").click();
    await expect(page.getByTestId("tpl-slot")).toHaveCount(0);

    // Condition true again → the slot's DOM is grafted back in and is
    // interactive once more (the inline signal still drives, the island still
    // responds), proving a dynamically-changing condition re-grafts cleanly.
    await page.locator("#toggle-extra").click();
    await expect(page.getByTestId("tpl-slot")).toBeVisible();
    await expect(page.getByTestId("tpl-count")).toHaveText("1");

    await page.locator("#tpl-inc").click();
    await expect(page.getByTestId("tpl-count")).toHaveText("2");

    await page.locator("#tpl-island").click();
    await expect(page.locator("#tpl-island")).toHaveText("count:1");
  });
});

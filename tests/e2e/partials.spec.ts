import { expect, test } from "@playwright/test";
import { clickViaJs, documentSurvived, markDocument } from "./util.ts";

test.describe("navigation", () => {
  test("a link swaps the region without a full reload, preserving outside island state", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    // Bump the island that lives outside the partial.
    await page.locator("#outside-counter").click();
    await expect(page.locator("#outside-counter")).toHaveText("count:1");

    await page.locator("#nav-about").click();
    await expect(page.getByTestId("panel-about")).toBeVisible();
    await expect(page.getByTestId("panel-home")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/partials/about");

    // Same document (no reload) and the outside island kept its state.
    expect(await documentSurvived(page)).toBe(true);
    await expect(page.locator("#outside-counter")).toHaveText("count:1");
  });

  test("nested islands inside a swapped region both re-hydrate and share state", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-nested").click();

    // After the partial swap, `bootNodes` re-hydrates the region: the outer
    // island mounts and re-creates the inner island within it.
    await expect(page.getByTestId("nested-outer")).toHaveAttribute("data-hydrated", "true");
    await expect(page.locator("#inner-btn")).toHaveAttribute("data-hydrated", "true");

    await page.locator("#inner-btn").click();
    await expect(page.getByTestId("nested-view")).toHaveText("value:1");
    await expect(page.locator("#inner-btn")).toHaveText("inner:1");
    expect(await documentSurvived(page)).toBe(true);
  });

  test("an island inside the swapped region re-hydrates fresh", async ({ page }) => {
    await page.goto("/partials");
    const inside = page.locator("#inside-counter");
    await expect(inside).toHaveAttribute("data-hydrated", "true");
    await inside.click();
    await expect(inside).toHaveText("count:1");

    await page.locator("#nav-about").click();
    await expect(page.getByTestId("panel-about")).toBeVisible();
    await page.locator("#nav-home").click();
    await expect(page.getByTestId("panel-home")).toBeVisible();

    // A brand-new instance: reset to 0, re-hydrated, interactive again.
    await expect(inside).toHaveText("count:0");
    await expect(inside).toHaveAttribute("data-hydrated", "true");
    await inside.click();
    await expect(inside).toHaveText("count:1");
  });

  test("back/forward traversal restores regions via partial swaps", async ({ page }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-about").click();
    await expect(page.getByTestId("panel-about")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("panel-home")).toBeVisible();
    expect(await documentSurvived(page)).toBe(true);

    await page.goForward();
    await expect(page.getByTestId("panel-about")).toBeVisible();
    expect(await documentSurvived(page)).toBe(true);
  });

  test("traversing back across a full page load does a real reload, not a stale swap", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");

    // A full (non-partial) navigation to a fresh document.
    await page.locator("#nav-fullload").click();
    await page.waitForURL("**/partials/about");
    await expect(page.getByTestId("panel-about")).toBeVisible();

    // Going back crosses the full-load boundary: the target entry belongs to the
    // previous document (destination.sameDocument === false), so it must be a
    // real navigation — never a partial swap into the now-stale live DOM.
    await markDocument(page);
    await page.goBack();
    await expect(page.getByTestId("panel-home")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/partials");
    expect(await documentSurvived(page)).toBe(false);
  });

  test("f-client-nav={false} forces a full navigation", async ({ page }) => {
    // A genuine full navigation (not intercepted) — works on every browser.
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-fullload").click();
    await page.waitForURL("**/partials/about");
    await expect(page.getByTestId("panel-about")).toBeVisible();
    // Opted out → real navigation → new document.
    expect(await documentSurvived(page)).toBe(false);
  });

  test("the route handler runs for partial requests (ctx.isPartial, query echo)", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");

    await page.locator("#nav-data").click();
    await expect(page.getByTestId("panel-data")).toBeVisible();
    await expect(page.getByTestId("is-partial")).toHaveText("true");
    await expect(page.getByTestId("q")).toHaveText("alpha");
  });
});

test.describe("navigating signal", () => {
  test("flips true while a partial navigation is in flight, then back to idle", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    // No navigation in flight on a fresh load.
    await expect(page.getByTestId("nav-status")).toHaveText("idle");
    await markDocument(page);

    // The slow route holds its response ~600ms — long enough to observe the
    // in-flight state through the `navigating` signal.
    await page.locator("#nav-slow").click();
    await expect(page.getByTestId("nav-status")).toHaveText("navigating");

    // Once applied, the region swapped in and the signal settled back to idle.
    await expect(page.getByTestId("panel-slow")).toBeVisible();
    await expect(page.getByTestId("nav-status")).toHaveText("idle");
    expect(await documentSurvived(page)).toBe(true);
  });
});

test.describe("server redirect", () => {
  test("follows the redirect, swaps the target region, and corrects the committed URL", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-redirect").click();

    // The redirect target's region (the about panel) is swapped in…
    await expect(page.getByTestId("panel-about")).toBeVisible();
    await expect(page.getByTestId("panel-redirect")).toHaveCount(0);
    // …and the committed URL is the redirect target, not the requested
    // /partials/redirect (the redirect URL correction).
    expect(new URL(page.url()).pathname).toBe("/partials/about");
    // Same document — no full reload.
    expect(await documentSurvived(page)).toBe(true);
  });

  test("a later back/forward to the redirected entry restores it from the corrected URL", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-redirect").click();
    await expect(page.getByTestId("panel-about")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/partials/about");

    await page.goBack();
    await expect(page.getByTestId("panel-home")).toBeVisible();

    // Forward returns to the corrected URL and re-fetches its content (the about
    // panel), staying a partial swap.
    await page.goForward();
    await expect(page.getByTestId("panel-about")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/partials/about");
    expect(await documentSurvived(page)).toBe(true);
  });
});

test.describe("f-partial (fetch-URL override)", () => {
  test("fetches the partial from f-partial while the URL lands on href", async ({ page }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-fpartial").click();

    // The swapped region is the *data* panel (fetched from f-partial), proving
    // the request went to /partials/data?q=override…
    await expect(page.getByTestId("panel-data")).toBeVisible();
    await expect(page.getByTestId("q")).toHaveText("override");
    await expect(page.getByTestId("is-partial")).toHaveText("true");
    // …while the committed URL is the link's href, not the fetched URL.
    expect(new URL(page.url()).pathname).toBe("/partials/about");
    expect(new URL(page.url()).search).toBe("");
    expect(await documentSurvived(page)).toBe(true);
  });

  test("back/forward re-fetches the entry from its original f-partial URL", async ({ page }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-fpartial").click();
    await expect(page.getByTestId("panel-data")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("panel-home")).toBeVisible();

    // Forward again must restore the f-partial content (data panel), not the
    // committed /partials/about page — i.e. the override was remembered.
    await page.goForward();
    await expect(page.getByTestId("panel-data")).toBeVisible();
    await expect(page.getByTestId("q")).toHaveText("override");
    expect(new URL(page.url()).pathname).toBe("/partials/about");
    expect(await documentSurvived(page)).toBe(true);
  });

  test("a redirect of the f-partial fetch updates the region but does NOT move the URL", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    // f-partial → /partials/redirect?to=/partials/data, which 303s to the data
    // panel. The region updates from the redirect target…
    await page.locator("#nav-fpartial-redirect").click();
    await expect(page.getByTestId("panel-data")).toBeVisible();
    // …but the committed URL stays at the link's href — NOT the redirect target
    // (/partials/data) and NOT the f-partial URL (/partials/redirect). Unlike a
    // plain navigation, f-partial does not apply redirect URL correction.
    expect(new URL(page.url()).pathname).toBe("/partials/about");
    expect(await documentSurvived(page)).toBe(true);
  });
});

test.describe("forms", () => {
  test("a GET form submits as a partial (fields in the URL)", async ({ page }) => {
    await page.goto("/partials/form");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.fill('input[name="q"]', "hello");
    await page.locator("#get-submit").click();

    await expect(page.getByTestId("search-result")).toHaveText("searched:hello");
    expect(new URL(page.url()).search).toContain("q=hello");
    expect(await documentSurvived(page)).toBe(true);
  });

  test("a POST form submits as a partial (body forwarded)", async ({ page }) => {
    await page.goto("/partials/form");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.fill('input[name="name"]', "ada");
    await page.locator("#post-submit").click();

    await expect(page.getByTestId("greet-result")).toHaveText("hi ada");
    expect(await documentSurvived(page)).toBe(true);
  });

  test("an external submitter inherits the form's f-client-nav region", async ({ page }) => {
    await page.goto("/forms");
    await expect(page.locator("#ready")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    // #ext-submit is OUTSIDE its form (and outside every f-client-nav element);
    // it only submits as a partial because the opt-in resolves via the form.
    await page.fill("#ext input", "ada");
    await page.locator("#ext-submit").click();

    await expect(page.getByTestId("result")).toHaveText("default:ada");
    // The decisive check: a partial swap, not a full-page POST reload (the
    // server renders the same result on a full load, so only this distinguishes).
    expect(await documentSurvived(page)).toBe(true);
  });

  test("formaction + formmethod override the submitted action URL and method", async ({ page }) => {
    await page.goto("/forms");
    await expect(page.locator("#ready")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    // The #fa form posts to /forms; this submitter's `formaction` redirects the
    // POST to /forms?mode=fa.
    await page.fill("#fa input", "bob");
    await page.locator("#fa-submit").click();

    // `fa:` proves the submitter's formaction URL (incl. its query) was used
    // instead of the form's action; `bob` proves the body was forwarded.
    await expect(page.getByTestId("result")).toHaveText("fa:bob");
    expect(await documentSurvived(page)).toBe(true);
  });
});

test.describe("scroll, fallback & fragments", () => {
  test("a forward partial navigation resets scroll to the top", async ({ page }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    // Scroll down the (tall, spacer-padded) page, then navigate. We click via JS
    // rather than Playwright's `.click()` so it doesn't scroll the top nav link
    // into view (resetting scroll to 0) before the navigation fires.
    await page.evaluate(() => window.scrollTo(0, 800));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await clickViaJs(page, "nav-about");
    await expect(page.getByTestId("panel-about")).toBeVisible();
    // The Navigation API intercept resets scroll after the transition; the
    // spacer keeps the page tall enough that a non-reset would stay > 0.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // It was a partial swap (same document), not a full reload — so the reset
    // came from the intercept, not a navigation to a fresh document.
    expect(await documentSurvived(page)).toBe(true);
  });

  test("traversing back restores the previous scroll position", async ({ page }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.evaluate(() => window.scrollTo(0, 600));
    await clickViaJs(page, "nav-about");
    await expect(page.getByTestId("panel-about")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.goBack();
    await expect(page.getByTestId("panel-home")).toBeVisible();
    // Same-document entries aren't scroll-restored by the browser; the runtime
    // records the outgoing scroll and restores it on traverse — back to ≈600,
    // not reset to the top.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    expect(await documentSurvived(page)).toBe(true);
  });

  test("a partial navigation to a 500 falls back to a full-page load of the error", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-boom").click();
    await page.waitForURL("**/partials/boom");
    // The partial fetch returned a 500, so the client fell back to a real
    // navigation that rendered the error document.
    await expect(page.getByTestId("error-page")).toBeVisible();
    await expect(page.getByTestId("error-status")).toHaveText("500");
    expect(await documentSurvived(page)).toBe(false);
  });

  test("an in-page hash link scrolls natively without a partial swap or reload", async ({
    page,
  }) => {
    await page.goto("/partials");
    await expect(page.locator("#outside-counter")).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    await page.locator("#nav-hash").click();
    // The URL gains the fragment…
    await expect.poll(() => new URL(page.url()).hash).toBe("#bottom-section");
    // …the swappable region is untouched (no partial fetch happened)…
    await expect(page.getByTestId("panel-home")).toBeVisible();
    // …the browser scrolled to the target, and the document never reloaded.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await documentSurvived(page)).toBe(true);
  });
});

test.describe("keyed island survival", () => {
  test("a keyed island keeps its state and rewrites only its changed props across a partial swap", async ({
    page,
  }) => {
    await page.goto("/partials/keyed");
    const kept = page.locator("#kept-counter");
    const freshA = page.locator("#fresh-counter");

    // The two A-panel islands are both hydrated and interactive.
    await expect(kept).toHaveAttribute("data-hydrated", "true");
    await expect(freshA).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    // Drive state on both. The keyed one is what we expect to survive; the
    // unkeyed one is the control that must reset on swap.
    await kept.click();
    await kept.click();
    await kept.click();
    await expect(kept).toHaveText("A:3");
    await freshA.click();
    await expect(freshA).toHaveText("fresh:1");

    // Swap to the B panel. The keyed marker matches, so the partial runtime
    // splices the live nodes into the response in place of the new keyed
    // marker pair and re-renders the same Preact root with `label="B"`.
    await page.locator("#nav-keyed-2").click();
    await expect(page.getByTestId("panel-keyed-2")).toBeVisible();
    await expect(page.getByTestId("panel-keyed")).toHaveCount(0);

    // The count survives (state preserved) and the label updates in place.
    await expect(kept).toHaveText("B:3");
    await expect(kept).toHaveAttribute("data-label", "B");
    // The hydrated flag survives too — it's the same component instance, the
    // mount-once effect never re-ran.
    await expect(kept).toHaveAttribute("data-hydrated", "true");
    // No full document reload.
    expect(await documentSurvived(page)).toBe(true);

    // The control island is gone (different id on B) and a brand-new one is
    // mounted with id="fresh-counter-b" at count:0.
    await expect(page.locator("#fresh-counter")).toHaveCount(0);
    const freshB = page.locator("#fresh-counter-b");
    await expect(freshB).toHaveText("fresh-b:0");

    // The kept island is still interactive after the in-place re-render.
    await kept.click();
    await expect(kept).toHaveText("B:4");

    // Round-trip: navigating back keeps the state once more and rolls the
    // label back to "A".
    await page.locator("#nav-keyed").click();
    await expect(page.getByTestId("panel-keyed")).toBeVisible();
    await expect(kept).toHaveText("A:4");
    await expect(kept).toHaveAttribute("data-label", "A");
    expect(await documentSurvived(page)).toBe(true);
  });

  test("a keyed island whose key isn't in the response is destroyed like any other", async ({
    page,
  }) => {
    await page.goto("/partials/keyed");
    const kept = page.locator("#kept-counter");
    await expect(kept).toHaveAttribute("data-hydrated", "true");
    await markDocument(page);

    // Give the kept counter some state.
    await kept.click();
    await kept.click();
    await expect(kept).toHaveText("A:2");

    // Swap to a panel with no matching key. The partial runtime falls back to
    // a normal swap: live nodes (including the kept island) are removed, and
    // whatever the new panel exports mounts fresh.
    await page.locator("#nav-about").click();
    await expect(page.getByTestId("panel-about")).toBeVisible();
    await expect(page.locator("#kept-counter")).toHaveCount(0);
    expect(await documentSurvived(page)).toBe(true);

    // Going back to the keyed page mounts a brand-new island (count:0); the
    // bookkeeping for `key="kept"` was dropped on the about swap.
    await page.locator("#nav-keyed").click();
    await expect(page.getByTestId("panel-keyed")).toBeVisible();
    await expect(kept).toHaveText("A:0");
  });
});

test.describe("modes", () => {
  test("replace / append / prepend modes apply correctly across navigations", async ({ page }) => {
    // The modes page has no islands — the navigation runtime loads via the
    // island-less `f-client-nav` boot loader. By the `load` event (which goto
    // awaits) its module script has executed, so the first click is intercepted.
    await page.goto("/modes?v=1");
    await markDocument(page);
    await expect(page.getByTestId("rep")).toHaveText("1");

    await page.locator("#v2").click();
    await expect(page.getByTestId("rep")).toHaveText("2");
    // If this were a full reload the document sentinel would be gone.
    expect(await documentSurvived(page)).toBe(true);

    await page.locator("#v3").click();
    await expect(page.getByTestId("rep")).toHaveText("3");

    // replace keeps only the latest; append accumulates in order; prepend reverses.
    await expect(page.getByTestId("app")).toHaveText("123");
    await expect(page.getByTestId("pre")).toHaveText("321");
    expect(await documentSurvived(page)).toBe(true);
  });
});

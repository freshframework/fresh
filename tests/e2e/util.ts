import type { Page } from "@playwright/test";

// Tag the current document instance. After a navigation, `documentSurvived`
// tells us whether it's still the same document (a partial swap) or a new one
// (a full page load) — the clearest signal that a navigation did/didn't reload.
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (globalThis as unknown as { __doc?: boolean }).__doc = true;
  });
}

export function documentSurvived(page: Page): Promise<boolean> {
  return page.evaluate(() => (globalThis as unknown as { __doc?: boolean }).__doc === true);
}

// Click an element by id from inside the page, instead of Playwright's `.click()`
// which first scrolls the target into view — that scroll would reset the page to
// the top before a navigation fires, defeating scroll-position assertions.
export async function clickViaJs(page: Page, id: string): Promise<void> {
  await page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (el === null) throw new Error(`clickViaJs: #${elId} not found`);
    el.click();
  }, id);
}

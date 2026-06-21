---
description: |
  Partials let you replace sub-sections of a page during navigation without
  reloading the whole document. Click a link, swap a region, keep the rest of
  the page intact.
---

Partials let you update a sub-section of the page during navigation. When the user clicks a link or submits a form, Fresh fetches the destination, picks out the relevant region, and swaps it into the live page. The rest of the page stays mounted. Island state survives. The browser does not reload the document.

This makes the application feel more app-like. Only the parts of the page that need to change actually change.

Partial navigation is still browser navigation. The address bar updates, the back and forward buttons work, the browser's loading indicator runs while the request is in flight, and the stop button cancels it. None of that has to be reimplemented in JavaScript. Fresh hooks into the browser's [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API), so the page swap is just another history entry from the browser's point of view.

## Enabling partials

Partials are enabled by adding an `f-client-nav` attribute to an HTML element and wrapping one or more areas of the page in a `<Partial name="...">` component from `fresh/runtime`.

The quickest way to get started is to enable partials for every page in `routes/_app.tsx`.

```diff routes/_app.tsx
  import { app } from "./$_app.ts";
+ import { Partial } from "fresh/runtime";

  export default app(({ children }) => (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My Fresh app</title>
      </head>
-     <body>
+     <body f-client-nav>
+       <Partial name="body">
          {children}
+       </Partial>
      </body>
    </html>
  ));
```

The `f-client-nav` attribute opts every element beneath the `<body>` tag into client-driven navigation. Each `<Partial>` marks a region that can be replaced. Every partial needs a unique `name`.

Behind the scenes, when the user clicks an `<a>` tag, Fresh fetches the new page and pulls out the regions that match a `<Partial>` on the current page. The matching live regions are updated in place.

The destination route renders a `<Partial>` with the same name. Its content replaces the live region.

```tsx routes/recipes/lemonade.tsx
import { page } from "./$lemonade.ts";
import { Partial } from "fresh/runtime";

export default page(() => (
  <Partial name="body">
    <h2>Lemonade</h2>
    <ul>
      <li>9 lemons</li>
      <li>1 cup sugar</li>
    </ul>
  </Partial>
));
```

When the request is a partial navigation, Fresh renders only the `<Partial>` regions in the response. No document shell, no other markup. The response is small.

> [info]: The `name` prop of `<Partial>` is expected to be unique among partials on a page. That's how Fresh knows which area of the response goes where.

> [info]: Setting `f-client-nav={false}` on an element disables client-side navigation for that element and everything below it.

## Optimizing partial requests

By default Fresh fetches the full next page and picks the relevant regions out of the response. The handler still runs, so the work is roughly the same as a normal navigation, even though only the partials are sent back.

To do less work on the server, branch on [`ctx.isPartial`](/docs/concepts/context) in the handler. Skip data the swapped region does not use, or short-circuit to render just the changing parts.

```tsx routes/docs/[id].tsx
import { handler, page } from "./$[id].ts";
import { Partial } from "fresh/runtime";

export const handlers = handler({
  async GET(ctx) {
    if (ctx.isPartial) {
      // Skip the sidebar data, it isn't part of the swapped region.
      const content = await loadContent(ctx.params.id);
      return { data: { content, links: [] } };
    }
    const [content, links] = await Promise.all([loadContent(ctx.params.id), loadSidebarLinks()]);
    return { data: { content, links } };
  },
});

export default page((props) => (
  <div>
    <aside>
      {props.data.links.map((l) => (
        <a key={l.href} href={l.href}>
          {l.title}
        </a>
      ))}
    </aside>
    <Partial name="docs-content">{props.data.content}</Partial>
  </div>
));
```

If you want a link to fetch its content from a different URL than the one it navigates to, add the `f-partial` attribute. Fresh navigates to the `href` URL but fetches the partial response from `f-partial`. This is useful when the same page has a fast partial-only route alongside the full one.

```diff routes/docs/[id].tsx
  <aside>
-   <a href="/docs/page1">Page 1</a>
-   <a href="/docs/page2">Page 2</a>
+   <a href="/docs/page1" f-partial="/partials/docs/page1">Page 1</a>
+   <a href="/docs/page2" f-partial="/partials/docs/page2">Page 2</a>
  </aside>
```

> [info]: `f-partial` works on `<a>`, `<form>`, and submit buttons.

## Sending multiple partials at the same time

A response can return as many partials as you want. Each one is matched by name against the live page and applied. This is useful for swapping two unrelated parts of the page in one round trip, for example a shopping cart.

```tsx routes/partials/cart.tsx
import { page } from "./$cart.ts";
import { Partial } from "fresh/runtime";

export default page(() => (
  <>
    <Partial name="cart-items" mode="append">
      {/* Render the new cart item here. */}
    </Partial>
    <Partial name="total-price">
      <p>Total: 12.50 €</p>
    </Partial>
  </>
));
```

Both partials are applied to the current page.

## Replacement modes

By default the content inside a partial is replaced. There are also modes for inserting new content before or after the existing content. Set the `mode` prop on the `<Partial>` to pick.

| Mode      | Behavior                                                |
| --------- | ------------------------------------------------------- |
| `replace` | Swap out the content of the existing partial (default). |
| `prepend` | Insert the new content before the existing content.     |
| `append`  | Insert the new content after the existing content.      |

`append` is useful for UI that displays a growing list, like log lines or a chat transcript.

```tsx routes/log.tsx
import { page } from "./$log.ts";
import { Partial } from "fresh/runtime";

export default page(() => {
  const lines = getNewLogLines();
  return (
    <Partial name="logs-list" mode="append">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </Partial>
  );
});
```

> [info]: When picking `prepend` or `append`, make sure to add a `key` to the new elements.

## Keeping island state intact across partial navigations

By default a swap replaces the islands inside the partial. Each new island mounts from scratch. Its hooks, refs, signals, and `useEffect` mount-once side effects all start over.

Give an island a Preact `key` to keep it across navigations. When the response carries an island with the same key, Fresh reuses the one that is already on the page. The component instance stays the same. Its signals, refs, and hook state stay. Props from the new response are applied to it in place.

Take a dashboard whose URL controls the time range, with a `<Chart>` island showing the data. Wrapping the chart in a `<Partial>` and giving it a key keeps the same chart instance across range switches, so its animations, zoom level, and any other hook state continue uninterrupted while only the `series` prop updates.

```tsx routes/dashboard/[range].tsx
import { handler, page } from "./$[range].ts";
import { Partial } from "fresh/runtime";
import { Chart } from "../../islands/Chart.tsx";

export const handlers = handler({
  async GET(ctx) {
    return { data: { series: await loadSeries(ctx.params.range) } };
  },
});

export default page(({ data, params }) => (
  <div f-client-nav>
    <nav>
      <a href="/dashboard/day">Day</a>
      <a href="/dashboard/week">Week</a>
      <a href="/dashboard/month">Month</a>
    </nav>
    <Partial name="dashboard">
      <h1>{params.range}</h1>
      <Chart key="main-chart" series={data.series} />
    </Partial>
  </div>
));
```

Clicking a link runs a partial swap of the `dashboard` partial. The `<Chart>` carries the same key on every render of this route, so it survives the swap and just sees a new `series` prop.

A few things to keep in mind:

- A key only keeps an island across `replace` swaps. `append` and `prepend` do not remove anything, so there is nothing to keep.
- The Component on both sides should be the same. Pointing the same key at a different island is not supported.
- A keyed island on the current page that does not appear in the response is removed along with the rest of the swap.
- A key is only meaningful within a single `<Partial>`. Two islands with the same key inside the same partial response are not supported.

## Bypassing or disabling partials

To exempt a particular element from triggering a partial request, set `f-client-nav={false}` on the element or on one of its ancestors.

```tsx
<body f-client-nav>
  {/* This causes a partial navigation. */}
  <a href="/docs/page1">With partials</a>

  {/* This does NOT cause a partial navigation. */}
  <a href="/docs/page1" f-client-nav={false}>
    No partials
  </a>

  {/* No element below this div causes a partial navigation. */}
  <div f-client-nav={false}>
    <div>
      <a href="/docs/page1">No partials</a>
    </div>
  </div>
</body>
```

When an element is clicked, Fresh walks up the DOM looking for an `f-client-nav` attribute. If the nearest one is `true`, a partial navigation is triggered. If it is `false`, or if no ancestor sets the attribute, the browser performs a normal navigation.

## How it works

Partial navigation is built on the browser's [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API). One listener handles link clicks, form submissions, and back/forward traversal. For each, Fresh:

1. Walks up from the source element looking for `f-client-nav`. If there is no enabling ancestor, the browser navigates normally.
2. Fetches the destination with a `Fresh-Partial` header. The handler can branch on [`ctx.isPartial`](/docs/concepts/context).
3. Swaps each returned region into the matching live `<Partial>`, syncs the [`<Head>`](/docs/advanced/head), and hydrates any islands that landed in the swapped DOM.

On a browser without the Navigation API, or on a fetch error, Fresh falls back to a full page load.

## Loading indicator

The `navigating` signal from `fresh/runtime` is `true` while a partial navigation is in flight. Drive a spinner, progress bar, or any other indicator off it.

```tsx islands/Spinner.tsx
import { navigating } from "fresh/runtime";

export function Spinner() {
  return navigating.value ? <div class="spinner" /> : null;
}
```

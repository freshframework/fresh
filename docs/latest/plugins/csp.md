---
description: "Set Content-Security-Policy (CSP) HTTP headers with the csp middleware"
---

The `csp()` middleware can be used to add
[Content-Security-Policy headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
to HTTP requests. These restrict which resources a document is allowed to load.

```ts main.ts
import { csp } from "fresh";

const app = new App()
  .use(csp({
    // If true, sets Content-Security-Policy-Report-Only header instead
    // of Content-Security-Policy
    reportOnly: true,
    // If set, adds Reporting-Endpoints, report-to, and report-uri
    // directive.
    reportTo: "/api/csp-reports",
    // Additional CSP directives to add or override the defaults
    csp: [
      "script-src 'self' 'unsafe-inline' 'https://example.com'",
    ],
  }))
  .get("/", () => new Response("hello"));
```

## Nonce-based CSP

For stricter security, you can use nonce-based CSP instead of `'unsafe-inline'`.
This ensures only inline `<script>` and `<style>` tags rendered by Fresh are
allowed to execute.

```ts main.ts
import { csp } from "fresh";

const app = new App()
  .use(csp({ useNonce: true }))
  .get("/", (ctx) => {
    return ctx.render(
      <html>
        <head>
          <style>{"body { color: red; }"}</style>
        </head>
        <body>
          <h1>Hello</h1>
        </body>
      </html>,
    );
  });
```

When `useNonce` is enabled:

- Fresh automatically injects a unique `nonce` attribute onto every inline
  `<script>` and `<style>` tag during server rendering.
- The CSP header **appends** `'nonce-{value}'` to `script-src`, `style-src`,
  `default-src`, `script-src-elem`, `style-src-elem`, and `style-src-attr`
  directives. Any `'unsafe-inline'` you (or the defaults) wrote is preserved
  alongside the nonce — modern browsers prefer the nonce and ignore
  `'unsafe-inline'` when both are present, while older browsers fall back to
  `'unsafe-inline'`. This matches the
  [strict-CSP fallback pattern recommended
  by web.dev](https://web.dev/articles/strict-csp#fallbacks).
- Each request gets a fresh nonce, so the value cannot be predicted by an
  attacker.
- Non-rendered responses (e.g. API routes returning JSON) fall back to
  `'unsafe-inline'` since there is no rendering step to generate a nonce.

> [warn]: If you set an explicit `nonce` attribute on a tag, it will be
> preserved in the HTML, but the CSP header will only contain the
> Fresh-generated nonce. The browser will block the tag unless its nonce matches
> the one in the CSP header. To avoid this, let Fresh manage nonces
> automatically.

## Options

See the [API docs](https://jsr.io/@fresh/core/doc/~/csp) for a list of all
supported options.

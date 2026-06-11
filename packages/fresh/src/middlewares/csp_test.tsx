import { expect } from "@std/expect/expect";
import { App } from "../app.ts";
import { csp } from "./csp.ts";
import { FakeServer } from "../test_utils.ts";
import { NONCE_SYMBOL } from "./csp.ts";

Deno.test("CSP - GET default", async () => {
  const handler = new App()
    .use(csp())
    .get("/", () => new Response("ok"))
    .handler();
  const res = await handler(new Request("https://localhost/"));
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Security-Policy")).toBeDefined();
  expect(res.headers.get("Content-Security-Policy")).toContain(
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  );
});

Deno.test("CSP - GET with override options", async () => {
  const handler = new App()
    .use(csp({
      reportTo: "/api/csp-reports",
      csp: [
        "font-src 'self' 'https://fonts.gstatic.com'",
        "style-src 'self' 'https://fonts.googleapis.com'",
      ],
    }))
    .get("/", () => new Response("ok"))
    .handler();

  const res = await handler(new Request("https://localhost/"));
  const header = res.headers.get("Content-Security-Policy")!;

  expect(res.status).toBe(200);
  expect(header).toContain(
    "font-src 'self' 'https://fonts.gstatic.com'",
  );
  expect(header).toContain(
    "style-src 'self' 'https://fonts.googleapis.com'",
  );
  expect(header).toContain("report-uri /api/csp-reports");
  expect(res.headers.get("Reporting-Endpoints")).toBe(
    'csp-endpoint="/api/csp-reports"',
  );

  // Overrides should replace defaults, not duplicate them
  const fontSrcCount = header.split("font-src").length - 1;
  expect(fontSrcCount).toBe(1);
  const styleSrcCount = header.split("style-src").length - 1;
  expect(styleSrcCount).toBe(1);
});

Deno.test("CSP - user directives override defaults", async () => {
  const handler = new App()
    .use(csp({
      csp: [
        "img-src 'self' https://example.com data:",
      ],
    }))
    .get("/", () => new Response("ok"))
    .handler();

  const res = await handler(new Request("https://localhost/"));
  const header = res.headers.get("Content-Security-Policy")!;

  // Should contain the user's img-src, not the default
  expect(header).toContain("img-src 'self' https://example.com data:");

  // Should not duplicate img-src
  const imgSrcCount = header.split("img-src").length - 1;
  expect(imgSrcCount).toBe(1);
});

Deno.test("CSP - GET report only", async () => {
  const handler = new App()
    .use(csp({
      reportOnly: true,
    }))
    .get("/", () => new Response("ok"))
    .handler();

  const res = await handler(new Request("https://localhost/"));
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Security-Policy-Report-Only")).toBeDefined();
  expect(res.headers.get("Content-Security-Policy-Report-Only")).toContain(
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  );
});

Deno.test("CSP - useNonce appends nonce alongside unsafe-inline", async () => {
  const app = new App()
    .use(csp({ useNonce: true }))
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head>
            <style>{"body { color: red; }"}</style>
          </head>
          <body>
            <h1>hello</h1>
          </body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  const html = await res.text();
  const cspHeader = res.headers.get("Content-Security-Policy")!;

  // Should contain both unsafe-inline and nonce
  expect(cspHeader).toContain("'unsafe-inline'");
  expect(cspHeader).toMatch(
    /script-src 'self' 'unsafe-inline' 'nonce-[a-f0-9]+'/,
  );
  expect(cspHeader).toMatch(
    /style-src 'self' 'unsafe-inline' 'nonce-[a-f0-9]+'/,
  );

  // Nonce should not leak as a response header
  expect(res.headers.get("X-Fresh-Nonce")).toBeNull();

  // HTML should contain nonce on the style tag
  const nonceMatch = cspHeader.match(/nonce-([a-f0-9]+)/);
  expect(nonceMatch).not.toBeNull();
  const nonce = nonceMatch![1];
  expect(html).toContain(`nonce="${nonce}"`);
});

Deno.test("CSP - useNonce injects nonce on inline script tags", async () => {
  const app = new App()
    .use(csp({ useNonce: true }))
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head />
          <body>
            <script>console.log('hello')</script>
          </body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  const html = await res.text();
  const cspHeader = res.headers.get("Content-Security-Policy")!;

  const nonceMatch = cspHeader.match(/nonce-([a-f0-9]+)/);
  expect(nonceMatch).not.toBeNull();
  const nonce = nonceMatch![1];

  // Inline script should have the nonce
  expect(html).toContain(`nonce="${nonce}"`);
});

Deno.test("CSP - useNonce with non-rendered response falls back to unsafe-inline", async () => {
  const app = new App()
    .use(csp({ useNonce: true }))
    .get("/api", () => new Response(JSON.stringify({ ok: true })));

  const server = new FakeServer(app.handler());
  const res = await server.get("/api");
  await res.body?.cancel();
  const cspHeader = res.headers.get("Content-Security-Policy")!;

  // Non-rendered response has no nonce, so unsafe-inline stays
  expect(cspHeader).toContain("'unsafe-inline'");
});

Deno.test("CSP - useNonce generates unique nonce per request", async () => {
  const app = new App()
    .use(csp({ useNonce: true }))
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head />
          <body>hello</body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res1 = await server.get("/");
  await res1.body?.cancel();
  const res2 = await server.get("/");
  await res2.body?.cancel();

  const nonce1 = res1.headers.get("Content-Security-Policy")!.match(
    /nonce-([a-f0-9]+)/,
  )![1];
  const nonce2 = res2.headers.get("Content-Security-Policy")!.match(
    /nonce-([a-f0-9]+)/,
  )![1];

  expect(nonce1).not.toEqual(nonce2);
});

Deno.test("CSP - existing nonce on tag is preserved", async () => {
  const app = new App()
    .use(csp({ useNonce: true }))
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head>
            <script nonce="custom-nonce">alert(1)</script>
          </head>
          <body>hello</body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  const html = await res.text();

  // The explicit nonce should be preserved, not overwritten
  expect(html).toContain('nonce="custom-nonce"');
});

Deno.test("CSP - nonce does not leak as header without CSP middleware", async () => {
  const app = new App()
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head />
          <body>hello</body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  await res.body?.cancel();

  // No CSP middleware — nonce must not appear as a response header
  expect(res.headers.get("X-Fresh-Nonce")).toBeNull();
  // But it should still be available via the symbol for middleware that needs it
  // deno-lint-ignore no-explicit-any
  expect((res as any)[NONCE_SYMBOL]).toBeDefined();
});

Deno.test("CSP - useNonce appends nonce alongside unsafe-inline in default-src", async () => {
  const app = new App()
    .use(csp({
      useNonce: true,
      csp: ["default-src 'self' 'unsafe-inline'"],
    }))
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head />
          <body>hello</body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  await res.body?.cancel();
  const cspHeader = res.headers.get("Content-Security-Policy")!;

  // default-src should contain both unsafe-inline and nonce
  expect(cspHeader).toMatch(
    /default-src 'self' 'unsafe-inline' 'nonce-[a-f0-9]+'/,
  );
});

Deno.test("CSP - nonce only added when unsafe-inline is present in directive", async () => {
  const app = new App()
    .use(csp({
      useNonce: true,
      csp: ["script-src 'self'"],
    }))
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head />
          <body>hello</body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  await res.body?.cancel();
  const cspHeader = res.headers.get("Content-Security-Policy")!;

  // script-src (user override, no 'unsafe-inline'): no nonce, no unsafe-inline
  const scriptSrc = cspHeader.split("; ").find((d) =>
    d.startsWith("script-src")
  )!;
  expect(scriptSrc).toEqual("script-src 'self'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toMatch(/'nonce-/);

  // style-src (default, has 'unsafe-inline'): nonce appended alongside
  const styleSrc = cspHeader.split("; ").find((d) =>
    d.startsWith("style-src")
  )!;
  expect(styleSrc).toContain("'unsafe-inline'");
  expect(styleSrc).toMatch(/'nonce-[a-f0-9]+'/);
});

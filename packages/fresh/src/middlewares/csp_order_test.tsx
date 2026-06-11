import { expect } from "@std/expect/expect";
import { App } from "../app.ts";
import { csp } from "./csp.ts";
import { FakeServer } from "../test_utils.ts";

Deno.test("CSP - useNonce after route still sets header", async () => {
  // Reproduces #3844: middleware registered AFTER route
  const app = new App()
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head><style>{"body { color: red; }"}</style></head>
          <body><h1>hello</h1></body>
        </html>,
      );
    })
    .use(csp({ useNonce: true }));

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  const cspHeader = res.headers.get("Content-Security-Policy");

  // The header should be set and should contain the nonce
  expect(cspHeader).toBeDefined();
  expect(cspHeader).not.toBeNull();
  expect(cspHeader!).toMatch(/'nonce-[a-f0-9]+'/);
});

Deno.test("CSP - useNonce before route still sets header", async () => {
  // Control: middleware registered BEFORE route (the normal case)
  const app = new App()
    .use(csp({ useNonce: true }))
    .get("/", (ctx) => {
      return ctx.render(
        <html>
          <head><style>{"body { color: red; }"}</style></head>
          <body><h1>hello</h1></body>
        </html>,
      );
    });

  const server = new FakeServer(app.handler());
  const res = await server.get("/");
  const cspHeader = res.headers.get("Content-Security-Policy")!;

  expect(cspHeader).toMatch(/'nonce-[a-f0-9]+'/);
});

---
description: |
  You can write HTTP tests for your Fresh project by creating an application handler.
---

You can write tests for your Fresh project by creating an application handler
through
[`createHandler()`](https://deno.land/x/fresh/server.ts?doc=&s=createHandler).

## 1. Create your routes

```tsx routes/index.tsx
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async POST(req) {
    const form = await req.formData();

    // Processing something

    return new Response(null, {
      status: 303,
      headers: { location: "/" },
    });
  },
};

export default function HomePage() {
  return <div>Hello Deno!</div>;
}
```

```tsx routes/foo.tsx
export default function FooPage() {
  return <div>Hello Foo!</div>;
}
```

## 2. Write your tests

```ts tests/main_test.ts
import { createHandler, ServeHandlerInfo } from "$fresh/server.ts";
import manifest from "../fresh.gen.ts";
import config from "../fresh.config.ts";
import { assert, assertEquals } from "$std/testing/asserts.ts";

const CONN_INFO: ServeHandlerInfo = {
  remoteAddr: { hostname: "127.0.0.1", port: 53496, transport: "tcp" },
};

Deno.test("HTTP assert test.", async (t) => {
  const handler = await createHandler(manifest, config);

  await t.step("#1 GET /", async () => {
    const resp = await handler(new Request("http://127.0.0.1/"), CONN_INFO);
    assertEquals(resp.status, 200);
  });

  await t.step("#2 POST /", async () => {
    const formData = new FormData();
    formData.append("text", "Deno!");
    const req = new Request("http://127.0.0.1/", {
      method: "POST",
      body: formData,
    });
    const resp = await handler(req, CONN_INFO);
    assertEquals(resp.status, 303);
  });

  await t.step("#3 GET /foo", async () => {
    const resp = await handler(new Request("http://127.0.0.1/foo"), CONN_INFO);
    const text = await resp.text();
    assert(text.includes("<div>Hello Foo!</div>"));
  });
});
```

## 3. Run the tests

```sh Terminal
$ deno test --allow-read --allow-env --allow-net
running 1 test from ./tests/main_test.ts
HTTP assert test. ...
  #1 GET / ... ok (31ms)
  #2 POST / ... ok (35ms)
  #3 GET /foo ... ok (12ms)
HTTP assert test. ... ok (118ms)

ok | 1 passed (3 steps) | 0 failed (236ms)
```

## createHandler in detail

This function is typed as follows:

```ts fresh 🍋
export async function createHandler(
  manifest: Manifest,
  config: FreshConfig = {},
): Promise<
  (req: Request, connInfo?: ServeHandlerInfo) => Promise<Response>
```

When you're using it, you'll likely be importing the manifest from your project.
You can of course import the config (`fresh.config.ts`) as well, but you're also
free to provide your own bag of options.
[`FreshConfig`](https://deno.land/x/fresh/server.ts?s=FreshConfig) is declared
as follows:

```ts fresh 🍋
export interface FreshConfig {
  build?: {
    outDir?: string;
    target?: string | string[];
  };
  render?: RenderFunction;
  plugins?: Plugin[];
  staticDir?: string;
  router?: RouterOptions;
  server?: Partial<Deno.ServeTlsOptions>;
}
```

For more on how these work, see the page about
[server configuration](/docs/1.x/concepts/server-configuration).

---
description: "Set CORS HTTP headers with the cors middleware"
---

The `cors()` middleware can be used to add
[Cross-Origin-Resource-Sharing headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
to HTTP requests. These allow the server to indicate which origins (domains,
scheme or port) other than its own is permitted to load resources from.

```ts main.ts
import { cors } from "fresh";

const app = new App()
  .use(
    cors({
      origin: "http://example.com",
      allowHeaders: ["X-Custom-Header", "Upgrade-Insecure-Requests"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      exposeHeaders: ["Content-Length", "X-Kuma-Revision"],
      maxAge: 600,
      credentials: true,
    }),
  )
  .get("/", () => new Response("hello"));
```

## Options

See the [API docs](https://jsr.io/@fresh/core/doc/~/cors) for a list of all
supported options

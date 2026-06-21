---
description: |
  How to manage a session using cookies.
---

A _session_ allows you to keep track of per-user state such as authentication or
shopping cart contents. Cookies are the most common mechanism for session
management. Since [Deno](https://deno.com) uses standard web APIs like `Request`
and `Response`, working with cookies is straightforward.

## Setup

Add the `@std/http` package from the standard library:

```sh
deno add jsr:@std/http
```

## Solution

Use a middleware to assign each visitor a session ID stored in a cookie. The
middleware reads the existing cookie from the request, or generates a new one,
and makes it available to downstream routes via `ctx.state`.

```ts main.ts
import { getCookies, setCookie } from "@std/http";

interface SessionState {
  session: string;
}

app.use(async (ctx: Context<SessionState>) => {
  const cookies = getCookies(ctx.req.headers);
  const session = cookies["session"];
  ctx.state.session = session ?? crypto.randomUUID();

  const response = await ctx.next();

  // Set the cookie for new sessions
  if (!session) {
    setCookie(response.headers, {
      name: "session",
      value: ctx.state.session,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });
  }

  return response;
});

app.get("/", (ctx: Context<SessionState>) => {
  return new Response(`Your session ID is: ${ctx.state.session}`);
});
```

> [info]: This is a basic implementation. In production you would typically
> store session data in a database keyed by the session ID, and add a
> `secure: true` attribute when serving over HTTPS.

For more background, see the
[MDN guide on HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies).

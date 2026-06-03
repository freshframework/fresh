---
description: |
  Learn how to implement the PKCE authentication flow using Supabase.
---

Fresh is a great tool for quickly building lightweight, server-side rendered web
apps and Supabase provides an easy way to add authentication (and/or a
PostgreSQL database backend) to your app.

In this example, we'll create a small app that implements the PKCE
authentication flow using Supabase.

The PKCE authentication flow is designed specifically for applications that
cannot store a client secret, such as native mobile apps or server-side rendered
web apps. You can read up on the specifics of PKCE
[here](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)
or have a look at
[its specification](https://datatracker.ietf.org/doc/html/rfc7636). Our example
is based on the information you can piece together from the
[Supabase documentation](https://supabase.com/docs/guides/auth/server-side/oauth-with-pkce-flow-for-ssr)
on the topic.

The purpose of the example app we're building here is to showcase the basic
building blocks of an implementation. As such, it is limited in functionality
and purposefully leaves out things like
[password resets](https://supabase.com/docs/guides/auth/server-side/email-based-auth-with-pkce-flow-for-ssr),
[proper error handling](https://usefresh.dev/docs/1.x/concepts/error-pages) as
well as validating input form data. You can find the
[full code here](https://github.com/morlinbrot/supa-fresh-pkce), where the
missing functionality is implemented.

## Supabase

First of all, we need a Supabase account
[which can be created for free here](https://supabase.com/). A handy way to
supply the credentials to our app is via `.env` file (never check in `.env`
files to version control).

```txt .env.example
SUPABASE_URL=https://<projectName>.supabase.co
SUPABASE_ANON_KEY=<api_key>
```

Update the imports section of your `deno.json` file to include the following:

```json deno.json
"imports": {
  "supabase": "npm:@supabase/supabase-js@2",
  "supabase/ssr": "npm:@supabase/ssr",
}
```

Since Deno 1.38, we reading .env files is built-in and can be enabled with the
`--env` flag. Here's the complete command to run our app:

```shell
deno run --unstable-kv --allow-env --allow-read --allow-write --allow-run --allow-net --watch=static/,routes/ dev.ts
```

### `@supabase/ssr`

Supabase provides the `@supabase/ssr` package for working with its API in an SSR
context. It exposes the `createServerClient` method that we can use on the
server side. Set it up like so:

```ts lib/supabase.ts
import { deleteCookie, getCookies, setCookie } from "$std/http/cookie.ts";
import { assert } from "$std/assert/assert.ts";
import { type CookieOptions, createServerClient } from "supabase/ssr";

export function createSupabaseClient(
  req: Request,
  // Keep this optional parameter in mind, we'll get back to it.
  resHeaders = new Headers(),
) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  assert(
    SUPABASE_URL && SUPABASE_ANON_KEY,
    "SUPABASE URL and SUPABASE_ANON_KEY environment variables must be set.",
  );

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: "pkce" },
    cookies: {
      get(name: string) {
        return decodeURIComponent(getCookies(req.headers)[name]);
      },
      set(name: string, value: string, options: CookieOptions) {
        setCookie(resHeaders, {
          name,
          value: encodeURIComponent(value),
          ...options,
        });
      },
      remove(name: string, options: CookieOptions) {
        deleteCookie(resHeaders, name, options);
      },
    },
  });
}
```

Note: We are specifying the `flowType` to be `pkce` and that we're using
[`encodeURIComponent()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
to serialize and store the session object as a cookie.

Crucially, _we need to create a new instance of this client for each request!_

## Sign Up

In our endpoints, we can now use this client to talk to the Supabase API. Here's
the `/api/sign-up` handler:

```ts routes/api/sign-up.ts
import { FreshContext, Handlers } from "$fresh/server.ts";
import { createSupabaseClient } from "lib/supabase.ts";

export const handler: Handlers = {
  async POST(req: Request, _ctx: FreshContext) {
    const form = await req.formData();
    const email = form.get("email");
    const password = form.get("password");

    const headers = new Headers();
    headers.set("location", "/sign-in"); // Redirect to /sign-in on success.

    const supabase = createSupabaseClient(req);
    const { error } = await supabase.auth.signUp({
      email: String(email),
      password: String(password),
    });

    if (error) throw error; // Have a look at the full app for proper error handling.

    return new Response(null, { status: 303, headers });
  },
};
```

Create a form to call our API endpoint and render it at `/sign-up`:

```tsx routes/sign-up.tsx
export default function SignUpPage() {
  return (
    <form action="/api/sign-up" method="post">
      <input autofocus type="email" name="email" />
      <input type="password" name="password" />
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Confirmation

To complete the sign-up process, we need a `/confirm` route to intercept
successful email confirmations:

```ts routes/api/confirm.ts
import { Handlers } from "$fresh/server.ts";
import { createSupabaseClient } from "lib/supabase.ts";

export const handler: Handlers = {
  async GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    const next = searchParams.get("next") ?? "/welcome";

    const redirectTo = new URL(req.url);
    redirectTo.pathname = next;

    if (token_hash && type) {
      const supabase = createSupabaseClient(req);
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (error) throw error; // Have a look at the full app for proper error handling.
    }

    redirectTo.searchParams.delete("next");
    return Response.redirect(redirectTo);
  },
};
```

Have a look at the Supabase docs on the
[details on how to configure email templates and other endpoints](https://supabase.com/docs/guides/auth/server-side/email-based-auth-with-pkce-flow-for-ssr)
like `/password-reset` you would need for a full implementation.

## Sign In

The `/api/sign-in` route is pretty straight-forward, too:

```ts routes/api/sign-in.ts
import { Handlers } from "$fresh/server.ts";
import { createSupabaseClient } from "lib/supabase.ts";

export const handler: Handlers = {
  async POST(req) {
    const form = await req.formData();
    const email = form.get("email")!;
    const password = form.get("password")!;

    const headers = new Headers();
    headers.set("location", "/");

    const supabase = createSupabaseClient(req, headers);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error; // Have a look at the full app for proper error handling.

    return new Response(null, { status: 303, headers });
  },
};
```

Note: We're passing `headers` this time. The Supabase client will set the
session as a cookie for us, which we will want to pick up in the middleware that
we are writing next.

## Middleware

We can now write a middleware that will check the auth status of any request,
guarding any protected routes. You can read up on middlewares and where to put
them [in the docs](https://usefresh.dev/docs/1.x/concepts/middleware).

```ts routes/_middleware.ts
import { FreshContext } from "$fresh/server.ts";
import { createSupabaseClient } from "lib/supabase.ts";

export const handler = [
  async function authMiddleware(req: Request, ctx: FreshContext) {
    const url = new URL(req.url);
    const headers = new Headers();
    headers.set("location", "/");

    const supabase = createSupabaseClient(req, headers);
    // Note: Always use `getUser` instead of `getSession` as this calls the Supabase API and revalidates the token.
    const { error, data: { user } } = await supabase.auth.getUser();

    const isProtectedRoute = url.pathname.includes("secret");

    // Don't mind 401 as it just means no credentials were provided. E.g. There was no session cookie.
    if (error && error.status !== 401) throw error; // Have a look at the full app for proper error handling.

    if (isProtectedRoute && !user) {
      return new Response(null, { status: 303, headers });
    }

    ctx.state.user = user;

    return ctx.next();
  },
];
```

That's it! These are the building blocks for implementing the PKCE
authentication flow in a Fresh app using Supabase. Again, have a look at the
[full code here](https://github.com/morlinbrot/supa-fresh-pkce) for a fully
featured version of the app.

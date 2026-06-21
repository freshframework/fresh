---
description: |
  Robustly handle user inputs using HTML `<form>` elements client side, and form
  submission handlers server side.
---

For stronger resiliency and user experience, Fresh relies on native browser
support for form submissions with the HTML `<form>` element.

In the browser, a `<form>` submit will send an HTML action (usually `GET` or
`POST`) to the server, which responds with a new page to render.

## POST request with `application/x-www-form-urlencoded`

Forms typically submit as a `GET` request with data encoded in the URL's search
parameters, or as a `POST` request with either an
`application/x-www-form-urlencoded` or `multipart/form-data` body.

This example demonstrates how to handle `application/x-www-form-urlencoded`
`<form>` submissions:

```tsx routes/subscribe.tsx
import { Handlers } from "$fresh/server.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    return await ctx.render();
  },
  async POST(req, ctx) {
    const form = await req.formData();
    const email = form.get("email")?.toString();

    // Add email to list.

    // Redirect user to thank you page.
    const headers = new Headers();
    headers.set("location", "/thanks-for-subscribing");
    return new Response(null, {
      status: 303, // See Other
      headers,
    });
  },
};

export default function Subscribe() {
  return (
    <>
      <form method="post">
        <input type="email" name="email" value="" />
        <button type="submit">Subscribe</button>
      </form>
    </>
  );
}
```

When the user submits the form, Deno will retrieve the `email` value using the
request's `formData()` method, add the email to a list, and redirect the user to
a thank you page.

## Handling file uploads

File uploads can be handled in a very similar manner to the example above. Note
that this time, we have to explicitly declare the form's encoding to be
`multipart/form-data`.

```tsx routes/subscribe.tsx
import { Handlers, type PageProps } from "$fresh/server.ts";

interface Props {
  message: string | null;
}

export const handler: Handlers<Props> = {
  async GET(req, ctx) {
    return await ctx.render({
      message: null,
    });
  },
  async POST(req, ctx) {
    const form = await req.formData();
    const file = form.get("my-file") as File;

    if (!file) {
      return ctx.render({
        message: `Please try again`,
      });
    }

    const name = file.name;
    const contents = await file.text();

    console.log(contents);

    return ctx.render({
      message: `${name} uploaded!`,
    });
  },
};

export default function Upload(props: PageProps<Props>) {
  const { message } = props.data;
  return (
    <>
      <form method="post" encType="multipart/form-data">
        <input type="file" name="my-file" />
        <button type="submit">Upload</button>
      </form>
      {message ? <p>{message}</p> : null}
    </>
  );
}
```

## A note of caution

These examples are simplified to demonstrate how Deno and Fresh handle HTTP
requests. In the Real World™, you'll want to validate your data (_especially the
file type_) and protect against cross-site request forgery. Consider yourself
warned.

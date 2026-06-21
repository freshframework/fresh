---
description: |
  Fresh is a full stack modern web framework for JavaScript and TypeScript
  developers, designed to build high-quality, performant,
  and personalized web applications.
---

Fresh is a full stack modern web framework for JavaScript and TypeScript
developers. It's designed for building high-quality, performant, and
personalized web applications. You can use it to create your home page, a blog,
an e-commerce shop, a large web application like GitHub or Twitter and more.

At its core, Fresh is a combination of a routing framework and templating engine
that renders pages on demand on the server. These server rendered pages can
contain areas that are made interactive on the client (also known as the
[Island Architecture](https://jasonformat.com/islands-architecture)). Fresh uses
[Preact][preact] as the JSX rendering engine.

Fresh projects can be deployed manually to any platform with [Deno][deno], but
it is intended to be deployed to an edge runtime like [Deno Deploy][deno-deploy]
for the best experience.

Some stand out features:

- Zero config necessary
- Tiny & fast (no client JS is required by the framework)
- Optional client side hydration of individual components
- Highly resilient because of progressive enhancement and use of native browser
  features
- TypeScript out of the box
- File-system routing à la Next.js

[preact]: https://preactjs.com
[deno]: https://deno.com
[deno-deploy]: https://deno.com/deploy

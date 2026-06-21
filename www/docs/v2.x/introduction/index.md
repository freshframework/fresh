---
description: |
  Fresh is a full stack modern web framework for JavaScript and TypeScript
  developers, designed to build high-quality, performant,
  and personalized web applications.
---

Fresh is a small, fast and extensible full stack web framework built on Web
Standards. It's designed for building high-quality, performant, and personalized
web applications.

```tsx main.ts
import { App } from "fresh";

const app = new App()
  .get("/", () => new Response("hello world"))
  .get("/jsx", (ctx) => ctx.render(<h1>render JSX!</h1>));

app.listen();
```

## Quick Start

Create a new Fresh app by running:

```sh Terminal
deno run -Ar jsr:@fresh/init
```

## Features

The core idea powering Fresh is to render server generated HTML pages and only
ship JavaScript for areas in the page that need to be interactive. This is often
referred to as the
[Island Architecture](https://jasonformat.com/islands-architecture).

- **Fast** 🚀 - Rendering is super fast thanks to [Preact][preact] and Deno's
  [`precompile` transform](https://docs.deno.com/runtime/reference/jsx/#jsx-precompile-transform)
- **Lightweight** 🏎️ - Only ship the JavaScript you need
- **Extensible** 🧩 - Nearly every aspect can be customized
- **Powerful & small API** 🤗 - Familiar APIs make you productive quickly
- **Built-in [OpenTelemetry](/docs/advanced/opentelemetry)** 📈 - Built-in
  support for OpenTelemetry

## When to use Fresh

Fresh is ideal for sites and apps that are primarily server rendered, like a
home page, an e-commerce shop or something like GitHub or Bluesky.

- Web APIs
- E-Commerce shops
- Portfolio sites
- Landing pages & Documentation
- CRUD apps

Fresh's small API surface and
[file-based conventions](/docs/concepts/file-routing) also make it a great fit
for AI-assisted development. Agents can scaffold routes, add
[middleware](/docs/concepts/middleware), and build features with minimal context
because the framework is simple and predictable.

That said, if you want to build a Single-Page-App (=SPA), then Fresh is not the
right framework.

## Who is using Fresh?

Fresh powers [deno.com](https://deno.com) and [Deno Deploy][deno-deploy] among
many other projects at Deno. It's also used by [deco.cx](https://deco.cx/) for
e-commerce projects.

## Hosting

Fresh runs anywhere [Deno][deno] runs. Deploy with a single click on
[Deno Deploy][deno-deploy], or package your app in a Docker container for any
cloud provider or self-hosted infrastructure.

[preact]: https://preactjs.com
[deno]: https://deno.com
[deno-deploy]: https://deno.com/deploy

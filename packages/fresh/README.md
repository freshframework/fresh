# Fresh

Fresh is a small, fast and extensible full stack web framework built on Web
Standards. It’s designed for building high-quality, performant, and personalized
web applications.

[Learn more about Fresh](https://usefresh.dev/)

## Usage

Generate a new Fresh project with `@fresh/init`:

```sh
deno run -Ar jsr:@fresh/init
```

Add middleware, routes, & endpoints as needed via the `routes/` folder or
directly on the `App` instance.

```tsx
import { App } from "fresh";

const app = new App()
  .get("/", () => new Response("hello world"))
  .get("/jsx", (ctx) => ctx.render(<h1>render JSX!</h1>));

app.listen();
```

For more information on getting started with Fresh, head on over to the
[documentation](https://usefresh.dev/docs/introduction).

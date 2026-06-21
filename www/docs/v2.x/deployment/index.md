---
description: "Create a production build of your app"
---

When shipping an app to production, we can run a build step that optimizes
assets for consumption in the browser. First, make sure dependencies are
installed:

```sh Terminal
deno install --allow-scripts
```

Then run the build:

```sh Terminal
deno task build
```

> [info]: This runs [vite](/docs/advanced/vite) build under the hood. If you're
> migrating from Fresh 1.x and still have a `dev.ts` file, see the
> [migration guide](/docs/migration-guide) for updating your tasks.

Once completed, it will have created a `_fresh` folder in the project directory
which contains the optimized assets.

> [info]: The `_fresh` folder should not be committed to git. Exclude it via
> `.gitignore`.
>
> ```gitignore .gitignore
> # Ignore fresh build directory
> _fresh/
> ```

## Running a production build

To run Fresh in production mode, run the `start` task:

```sh Terminal
deno task start
```

This runs `deno serve -A _fresh/server.js`, which serves the built assets
directly. Fresh will automatically pick up the optimized assets in the `_fresh`
directory.

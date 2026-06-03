---
description: |
  Guidelines and resources for contributing to Fresh.
---

# Contributing

Fresh is organized as a monorepo with multiple packages:

- **`packages/fresh/`** - Core Fresh framework (`@fresh/core`)
- **`packages/plugin-vite/`** - Vite integration plugin (`@fresh/plugin-vite`)
- **`packages/plugin-tailwindcss/`** - Tailwind CSS v4 plugin
- **`packages/plugin-tailwindcss-v3/`** - Tailwind CSS v3 plugin
- **`packages/init/`** - Project scaffolding tool
- **`packages/update/`** - Fresh update utilities
- **`www/`** - Documentation website (usefresh.dev)

## Getting Started

Prerequisites: [Deno](https://deno.com/) (latest version) and Git.

```sh Terminal
git clone https://github.com/denoland/fresh.git
cd fresh
deno task ok
```

`deno task ok` runs formatting, linting, type checking, and the full test suite.
Run it before submitting any pull request.

The repository uses Deno
[workspaces](https://docs.deno.com/runtime/fundamentals/workspaces/) so all
packages in `packages/` are automatically available to each other using their
published names (`@fresh/core`, `@fresh/plugin-vite`, etc.).

## Development

The `www/` directory and the Vite plugin demo both use local Fresh packages,
making them good integration tests:

```sh Terminal
deno task www           # docs site dev server
deno task build-www     # docs site production build

deno task demo          # vite demo dev server
deno task demo:build    # vite demo production build
deno task demo:start    # serve vite demo production build
```

### Testing in External Projects

To use your local Fresh checkout in a separate project, add
[`links`](https://docs.deno.com/runtime/fundamentals/configuration/#links) to
the project's `deno.json`:

```json deno.json
{
  "imports": {
    "@fresh/core": "jsr:@fresh/core@^2.0.0",
    "@fresh/plugin-vite": "jsr:@fresh/plugin-vite@^1.0.0"
  },
  "links": [
    "../path/to/fresh/packages/fresh",
    "../path/to/fresh/packages/plugin-vite"
  ]
}
```

This overrides the JSR packages with your local versions. Changes are reflected
immediately without rebuilding.

## Testing

```sh Terminal
# All tests (parallel)
deno task test

# A specific test file
deno test -A packages/fresh/src/app_test.ts

# Filter by test name
deno test -A --filter "test name pattern"

# Update snapshots after intentional output changes
deno test -A --update-snapshots path/to/test.ts
```

Tests use `@std/expect` for assertions, follow the `*_test.ts` naming
convention, and require the `-A` flag. Snapshot tests are stored in
`__snapshots__/` directories.

Some tests may fail locally but pass in CI (`Could not find server address`,
`Text file busy (os error 26)`) - these can be safely ignored.

## Pull Requests

- Run `deno task ok` before submitting to catch formatting, lint, and type
  errors early
- Keep PRs focused - one feature or fix per PR
- Add or update tests for any behavior changes
- Follow existing code style - the repository uses `deno fmt` for formatting and
  `deno lint` for linting

---
description: "Generate a self contained executable with deno compile."
---

You can create a self-contained executable out of your app with the
[`deno compile` command](https://docs.deno.com/runtime/reference/cli/compile/).
It will include all assets and dependencies. This executable can run on any
platform without requiring Deno to be installed.

## Building the executable

```sh Terminal
# Build your app first
deno task build
# Generate self-contained executable
deno compile --output my-app --include _fresh -A _fresh/compiled-entry.js
```

The `--include _fresh` flag ensures that all built assets (JavaScript bundles,
CSS, static files) are embedded in the binary.

## Configuration

The compiled entry supports two environment variables out of the box:

- `PORT` to set the port number (`PORT=4000 ./my-app`)
- `HOSTNAME` to set the host name (`HOSTNAME=0.0.0.0 ./my-app`)

## Cross-compilation

You can compile for a different platform using the `--target` flag:

```sh Terminal
deno compile --target x86_64-unknown-linux-gnu --output my-app --include _fresh -A _fresh/compiled-entry.js
```

See the
[`deno compile` documentation](https://docs.deno.com/runtime/reference/cli/compile/)
for a full list of supported targets.

## Limitations

- The executable size includes the Deno runtime (~50-130 MB depending on
  platform)
- Dynamic imports that aren't statically analyzable may not be included
- Native npm packages with platform-specific binaries need to match the target
  platform

---
description: "Deploy Fresh on Deno Deploy"
---

The recommended way to deploy Fresh is by using
[Deno Deploy](https://deno.com/deploy). It will automatically create branch
previews for pull requests, collect request and HTTP metrics, as well as collect
[traces](/docs/advanced/opentelemetry) for you out of the box.

## Setup

1. Log in to [Deno Deploy](https://deno.com/deploy)
1. Create a new app
1. Link your GitHub repository
1. Pick the "Fresh" preset if it's not already detected automatically

Every time you merge into the `main` branch a new production deployment will be
created.

## Build step

Deno Deploy runs `deno task build` automatically during deployment when the
Fresh preset is selected. Make sure your `deno.json` has the correct build task:

```json deno.json
{
  "tasks": {
    "build": "vite build",
    "start": "deno serve -A _fresh/server.js"
  }
}
```

## Environment variables

You can set environment variables in the Deno Deploy dashboard under your
project's **Settings > Environment Variables** section. These are available at
runtime via `Deno.env.get()`.

For variables that need to be available in [island](/docs/concepts/islands) code
(client-side), prefix them with `FRESH_PUBLIC_` - see
[Environment Variables](/docs/advanced/environment-variables).

## Custom domains

Custom domains can be configured in the Deno Deploy dashboard under your
project's **Settings > Domains** section. Deno Deploy automatically provisions
TLS certificates for your domains.

## Troubleshooting

If your deployment fails to start:

1. Ensure `deno task build` has been run (check that the Fresh preset is
   selected)
2. Verify your entry point is `_fresh/server.js`, not `main.ts` - Fresh 2
   generates the server entry during the build step
3. Check the deployment logs in the Deno Deploy dashboard for specific errors

See the [Deno Deploy documentation](https://docs.deno.com/deploy/manual/) for
more details.

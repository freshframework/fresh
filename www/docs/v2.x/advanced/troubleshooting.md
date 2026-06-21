---
description: |
  Troubleshooting Fresh applications.
---

This site contains some tips to troubleshoot your app in case something doesn't
work as expected.

## Update Deno

The Node compatibility layer in Deno is constantly receiving new improvements
and bug fixes with every Deno version. Chances are that the issue you're running
into has already been fixed. To rule that out, install the latest Deno version.

```sh Terminal
deno upgrade
```

## Install or re-install dependencies

When run for the first time, you might see Deno complaining about missing
packages. Install them with:

```sh Terminal
deno install --allow-scripts
```

If you run into dependency trouble later and suspect that Deno might be caching
an outdated package, you can force a clean reinstall by adding `-r` to the above
command.

## Update Fresh

The easiest way to resolve most issues is to ensure that you're on the
[latest version](https://jsr.io/@fresh/core/versions) of Fresh. We continuously
work on Fresh and there is a good chance that the issue you're running into has
already been resolved in the latest version of Fresh.

## Don't use esm.sh

Fresh 1.x heavily relied on [esm.sh](https://esm.sh/) to be able to use npm
packages with Fresh. This continued a bit through the early alpha versions of
Fresh 2. With the move to [`vite`](/docs/advanced/vite) this is not necessary
anymore and you should use the relevant npm package directly from npm.

```diff deno.json
  {
    "imports": {
-     "cowsay": "https://esm.sh/cowsay"
+     "cowsay": "npm:cowsay@^1.6.0"
    }
  }
```

> [info]: Not using `esm.sh` solves many issues and footguns with duplicate
> Preact versions in your app. If you're seeing strange JavaScript errors in the
> browser in your app then this is likely the cause.

## Attach a debugger

To attach a debugger to vite with Deno run this command:

```sh Terminal
deno run -A --inspect npm:vite
# or
deno run -A --inspect-brk npm:vite
```

## Debug vite resolution

To debug vite resolution issues run vite with the `--debug` flag. This will
print lots of debugging information to the terminal.

## Debug vite transformations

To debug vite plugin transformations, use
[`vite-plugin-inspect`](https://github.com/antfu-collective/vite-plugin-inspect).
This gives you a UI that shows all transformations of all plugins for every
file.

## My deployment won't start

If your deployment doesn't boot, check the following things:

1. Make sure that you ran `deno task build`.
2. Make sure that your entry points to the generated `_fresh/server.js` file
   instead of `main.ts`. The latter won't work with Fresh 2.

Error messages like `ISOLATE_INTERNAL_FAILURE` may indicate above issues, but
can also be caused by other problems in your deployment configuration.

## VS Code does not find packages and/or types

If you see errors in VS Code like `Cannot find module 'fresh/runtime'` or see a
lot of TypeScript errors, you likely have not installed the Deno extension. You
can easily find it inside VS Code's extension browser (identifier:
`denoland.vscode-deno`).

Once installed and enabled, the currently installed Deno version should appear
in the bottom status bar. If this does not happen automatically, you can enable
the Deno extension via the command palette (Cmd+Shift+P on macOS, Ctrl+Shift+P
on Windows/Linux) and run `Deno: Enable`.

For detailed instructions, see the official
[Deno VS Code documentation](https://docs.deno.com/runtime/reference/vscode/).

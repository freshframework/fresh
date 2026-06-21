---
description: |
  New versions of Fresh are regularly released. This page explains how to update your project.
---

Fresh consists of multiple pieces which are independently versioned and
released.

- Fresh (https://deno.land/x/fresh)
- Preact (https://esm.sh/preact)
- preact-render-to-string (https://esm.sh/preact-render-to-string)

Some plugins also have their own dependencies that can be updated independently.

- Twind (https://esm.sh/twind) (for the twind plugin)

For the most part these pieces can be updated independently. Certain versions of
Fresh may require a minimum version of a given dependency. This is documented
below.

| Fresh version | Preact            | preact-render-to-string | Deno      |
| ------------- | ----------------- | ----------------------- | --------- |
| 1.0.0-1.0.2   | >=10.8.1 <11.0.0  | >=5.2.0 <6.0.0          | >= 1.23.0 |
| 1.1.0-1.1.5   | >=10.8.1 <11.0.0  | >=5.2.0 <6.0.0          | >= 1.25.0 |
| 1.2.0         | >=10.15.0 <11.0.0 | >=6.1.0                 | >= 1.25.0 |

## Updating dependencies

To update your dependencies, you have two options:

- Run the Fresh updater to update your project dependencies.
- Manually update the dependency versions in your `deno.json` file.

### Auto updater

The auto updater is a command line tool that will update your project's
`deno.json` file to the latest versions of Fresh and its dependencies. It may
also contain code mods for your project that will update your code to the latest
recommended patterns for Fresh projects.

To run the auto updater, run the following command from the root of your
project:

```sh Terminal
$ deno run -A -r https://usefresh.dev/update
```

You will be prompted to confirm the changes that will be made to your project.

### Manual update

To manually update your project's dependencies, you can edit the `deno.json`
file in the root of your projects directory. Dependency versions are encoded
into the URLs in this file. For example, here is how to update a project from
Fresh 1.0.2 to 1.1.3, and update Preact to the latest version:

```diff deno.json
  {
    "imports": {
-     "$fresh/": "https://deno.land/x/fresh@1.0.2/",
+     "$fresh/": "https://deno.land/x/fresh@1.1.5/",

-     "preact": "https://esm.sh/preact@10.8.1",
-     "preact/": "https://esm.sh/preact@10.8.1/",
+     "preact": "https://esm.sh/preact@10.11.0",
+     "preact/": "https://esm.sh/preact@10.11.0/",

-     "preact-render-to-string": "https://esm.sh/*preact-render-to-string@5.2.0",
+     "preact-render-to-string": "https://esm.sh/*preact-render-to-string@6.1.0",

      "twind": "https://esm.sh/twind@0.16.17",
      "twind/": "https://esm.sh/twind@0.16.17/"
    }
  }
```

## Automatic update checks

Fresh will periodically check if a new Fresh version is available if it's
running outside of CI. This happens once per day and can be disabled by setting
the `FRESH_NO_UPDATE_CHECK=true` environment variable.

## Code mods

Code mods are small scripts that can be run to update your project's code to
match the latest recommended patterns for Fresh projects. Code mods can be run
through the auto updater. Sometimes the code mod can not cover all cases, so you
may need to manually update some code. This section explains the code mods
currently available.

### Classical JSX -> Automatic JSX

> This code mod is only available in Fresh 1.1.0 and above.

The classical JSX transform that relies on a `/** @jsx h */` pragma is no longer
the recommended way to use JSX in Fresh projects. Instead, starting with version
1.1.0, Fresh projects should use the automatic JSX transform that requires no
JSX pragma or preact import.

```diff routes/hello-world.tsx
- /** @jsx h */
- import { h } from "preact";

  export default function Page() {
    return <div>Hello world!</div>;
  }
```

This code mod will update your deno.json file to include the relevant compiler
options to enable the automatic JSX transform. It will then go through your
project and remove any `/** @jsx h */` pragmas and `import { h } from "preact"`
statements.

### Classic twind -> Twind plugin

> This code mod is only available in Fresh 1.1.0 and above.

Fresh version 1.1.0 introduced a new plugin for using twind with Fresh. This
plugin is much nicer to use than the raw twind integration that was previously
available.

This code mod will update your project to use the new twind plugin. It will
update your `main.ts` file to import the twind plugin and add it to the plugins
array. It will also update your files to remove many unnecessary uses of the
`tw` function, and remove unnecessary twind imports. While the code mod can
handle most cases, you may need to manually update some code. Additionally you
will need to manually update your `twind.config.ts` if you use a custom
configuration.

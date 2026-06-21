---
description: |
  For cases where the latest release doesn't fit your needs.
---

Pretend you have a use case where you need to modify your project to use a
canary version of Fresh. Or you want to use a slightly different initialization
script. This page has you covered.

## Canary Fresh in `deno.json`

### Latest alpha version

The easiest way to use Fresh 2 canary is with the update command:

```sh Terminal
deno run -A -r jsr:@fresh/update@2.0.0-alpha.35 .
```

This will automatically update your `deno.json` to use the specified canary
version.

### Specific commit

If you need a particular commit (for testing specific fixes or features):

```diff deno.json
   "tasks": {
     "update": "deno run -A -r jsr:@fresh/update ."
   },
   "imports": {
-    "$fresh/": "jsr:@fresh/core@^2.0.0",
+    "$fresh/": "https://raw.githubusercontent.com/denoland/fresh/your-commit-hash/",
     "preact": "npm:preact@^10.26.9",
     "@preact/signals": "npm:@preact/signals@^2.2.0"
   }
```

Replace `your-commit-hash` with your desired commit hash.

### Forked Fresh

For testing your own fork or PR:

```diff deno.json
   "tasks": {
     "update": "deno run -A -r jsr:@fresh/update ."
   },
   "imports": {
-    "$fresh/": "https://deno.land/x/fresh@1.7.3/",
+    "$fresh/": "https://raw.githubusercontent.com/your-username/fresh/your-branch/",
     "preact": "https://esm.sh/preact@10.26.9",
     "preact/": "https://esm.sh/preact@10.22.0/",
   }
```

## Creating a new project

### Using JSR

```sh Terminal
deno run -A -r jsr:@fresh/init@2.0.0-alpha.35
```

### From local source

If you're developing Fresh itself:

```sh Terminal
deno run -A -r ./init/src/init.ts
```

### Recommended reading

- [Fresh v2 blog](https://deno.com/blog/fresh-2)
- [Migration guide](../../migration-guide.md)

# @frsh/create-app

Scaffold a new [Fresh](https://github.com/freshframework/fresh) app.

```sh
# npm
npm create @frsh/app@latest

# pnpm
pnpm create @frsh/app

# yarn
yarn create @frsh/app

# deno
deno run -A npm:@frsh/create-app
```

You can also pass the target directory directly:

```sh
npm create @frsh/app my-app
```

The CLI is interactive — it will prompt for a directory, let you pick optional features (currently: Tailwind CSS), ask whether to install dependencies, and offer to initialize a git repository. It detects which package manager you invoked it with and tailors the install and next-step commands accordingly.

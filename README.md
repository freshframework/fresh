# Fresh

**Fresh** is a next-generation web framework, built for speed, reliability, and simplicity. Fresh 3 is a complete reimagining built on [Vite](https://vitejs.dev/) and [Nitro](https://nitro.build/), with a focus on performance and developer experience.

Some stand-out features:

- File-system based routing, with dynamic routes and nested layouts.
- Island architecture for maximum interactivity, only shipping JavaScript for interactive parts of the page.
- Built on Vite for a great development experience, with TypeScript support and the full Vite plugin ecosystem.
- Runs on Deno, Node, Cloudflare Workers, and more — no custom runtime required.
- Small API surface for easy learning and AI-assisted development.

## 📖 Documentation

The documentation lives in [`www/docs/latest/`](./www/docs/latest) in the repo — it isn't published to a website yet.

## 🚀 Getting started

Scaffold a new project with `@frsh/create-app`. It prompts for a directory, lets you toggle optional features (such as Tailwind CSS), and can install dependencies and initialize a git repo for you.

```sh
npm create @frsh/app@latest
```

```sh
pnpm create @frsh/app
```

```sh
yarn create @frsh/app
```

```sh
deno run -A npm:@frsh/create-app
```

Then navigate to the newly created project folder and start the development server:

```sh
cd my-app
npm run dev
```

Now open http://localhost:5173 in your browser. Edits to the project source are reflected immediately.

For a more in-depth walkthrough, see the [Getting Started](./www/docs/latest/getting-started/index.md) docs page.

## Contributing

We appreciate your help! To contribute, please read our [contributing guideline](./.github/CONTRIBUTING.md).

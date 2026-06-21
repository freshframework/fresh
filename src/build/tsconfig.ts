// Generates `<root>/.fresh/tsconfig.json`. The example's own tsconfig.json
// extends this so that `rootDirs` virtually merges the auto-generated
// `.fresh/types/` tree alongside the user's source tree — e.g. a route at
// `routes/blog/[slug].tsx` can `import { define } from "./$[slug].ts"` and
// TypeScript resolves it against `.fresh/types/routes/blog/$[slug].ts`.

export function freshTsconfigPath(): string {
  return ".fresh/tsconfig.json";
}

export function freshTsconfigContent(): string {
  const config = {
    compilerOptions: {
      // Both paths are relative to `.fresh/tsconfig.json`:
      //   ".."     → the project root (the user's source tree)
      //   "./types" → the auto-generated typings tree (.fresh/types)
      rootDirs: ["..", "./types"],
      jsx: "react-jsx",
      jsxImportSource: "preact",
      // Vite-style module resolution: this is the only shape that lets the
      // generated `$<file>.ts` siblings resolve route source files via
      // relative `./<file>.tsx` specifiers without an extension dance.
      module: "esnext",
      moduleResolution: "bundler",
      target: "esnext",
      lib: ["esnext", "dom", "dom.iterable"],
      allowImportingTsExtensions: true,
      noEmit: true,
      // Nitro/h3/crossws/etc. drag in transitive `.d.ts` files that
      // reference optional peer types (`bun`, `cloudflare:workers`,
      // `@vercel/nft`, `aws-lambda`, …) we don't install. None of them
      // affect the user's code, so we skip lib-checking by default. Users
      // can override in their own tsconfig.
      skipLibCheck: true,
      strict: true,
      esModuleInterop: true,
      isolatedModules: true,
      resolveJsonModule: true,
      // `vite/client` is opt-in (added by the user's tsconfig); we don't
      // assume a Vite-runtime types dep here.
    },
  };
  return JSON.stringify(config, null, 2) + "\n";
}

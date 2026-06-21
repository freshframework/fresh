import { defineConfig } from "vite";
import { fresh } from "fresh/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [fresh(), tailwindcss()],
  // Docs markdown is pulled in via `import.meta.glob("/docs/**/*.md", { query:
  // "?raw" })`. Treat `.md` as an asset so Vite's SSR CSS-collection doesn't try
  // to parse the markdown as JS for import analysis (the `?raw` import still
  // yields the file's text).
  assetsInclude: ["**/*.md"],
});

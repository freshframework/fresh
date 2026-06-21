import { defineConfig } from "vite";
import { fresh } from "fresh/vite";

// Fixed port so the Playwright `webServer` config can wait on a known URL.
export default defineConfig({
  plugins: [fresh()],
  server: { port: 8765, strictPort: true },
});

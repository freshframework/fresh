import { defineConfig } from "vitest/config";

// Two projects:
//   * unit        — fast, in-isolation tests of build + server functions.
//   * integration — boots the Fresh server in-process (Vite SSR) and drives it
//                    over `fetch`, exercising routing → middleware → handler →
//                    render → partial responses without a browser.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});

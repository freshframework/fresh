import { expect } from "@std/expect";
import { fresh } from "../src/mod.ts";
import type { Plugin } from "vite";

Deno.test("fresh plugin - sets server.watch.ignored patterns", () => {
  const plugins = fresh() as Plugin[];
  const freshPlugin = plugins.find((p) => p.name === "fresh");
  expect(freshPlugin).toBeDefined();

  // Call the config hook as Vite would during dev
  // deno-lint-ignore no-explicit-any
  const configFn = freshPlugin!.config as any;
  const result = configFn({}, { command: "serve" });

  const ignored = result?.server?.watch?.ignored;
  expect(ignored).toBeDefined();
  expect(Array.isArray(ignored)).toBe(true);

  // Should ignore temp files, editor swap files, and Vite timestamp files
  expect(ignored).toContain("**/*.tmp.*");
  expect(ignored).toContain("**/*.timestamp-*");
  expect(ignored).toContain("**/*.swp");
  expect(ignored).toContain("**/*.swo");
  expect(ignored).toContain("**/*~");
  expect(ignored).toContain("**/.#*");
});

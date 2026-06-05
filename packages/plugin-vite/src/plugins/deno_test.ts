import { expect } from "@std/expect/expect";
import { identitySourceMap, rewriteLoadedSourceMap } from "./deno.ts";

Deno.test("identitySourceMap - single line", () => {
  const map = identitySourceMap("jsr:@fresh/core/src/render.ts", "foo();");
  expect(map.version).toBe(3);
  expect(map.sources).toEqual(["jsr:@fresh/core/src/render.ts"]);
  expect(map.sourcesContent).toEqual(["foo();"]);
  expect(map.sourceRoot).toBe("");
  // Single line => single segment, no `;` separators.
  expect(map.mappings).toBe("AAAA");
});

Deno.test("identitySourceMap - multi line", () => {
  const code = "a;\nb;\nc;";
  const map = identitySourceMap("https://example.com/mod.js", code);
  // Three lines => `AAAA` + `;AACA` per additional line.
  expect(map.mappings).toBe("AAAA;AACA;AACA");
  expect(map.sources).toEqual(["https://example.com/mod.js"]);
  expect(map.sourceRoot).toBe("");
});

Deno.test("identitySourceMap - keeps full URL in sources to avoid doubled cwd paths", () => {
  // Regression test for the caveat from denoland/fresh#3464: Vite resolves
  // source-map `sources` entries relative to the (virtual) module location
  // and falls back to concatenating the cwd. Using absolute URLs/paths in
  // `sources` together with `sourceRoot: ""` prevents the doubling.
  const map = identitySourceMap(
    "file:///abs/path/to/segments.ts",
    "export const x = 1;",
  );
  expect(map.sources[0]).toBe("file:///abs/path/to/segments.ts");
  expect(map.sourceRoot).toBe("");
});

Deno.test("rewriteLoadedSourceMap - rewrites inline map sources to absolute", () => {
  const inputMap = {
    version: 3,
    sources: ["packages/foo/src/bar.ts"],
    sourcesContent: ["original;"],
    names: [],
    mappings: "AAAA",
  };
  const inlined = btoa(JSON.stringify(inputMap));
  const body = "transformed;";
  const code =
    `${body}\n//# sourceMappingURL=data:application/json;base64,${inlined}`;

  const result = rewriteLoadedSourceMap(
    code,
    "https://jsr.io/@fresh/core/2.1.0/src/render.ts",
  );

  // The returned map (also embedded inline) has `sources` rewritten.
  expect(result.map.sources).toEqual([
    "https://jsr.io/@fresh/core/2.1.0/src/render.ts",
  ]);
  expect(result.map.sourceRoot).toBe("");
  expect(result.map.mappings).toBe("AAAA");

  // The inline `//# sourceMappingURL=` comment is preserved (rewritten) so
  // V8 can apply it natively for stack-trace translation.
  const m = result.code.match(
    /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/,
  );
  expect(m).not.toBeNull();
  const reparsed = JSON.parse(atob(m![1]));
  expect(reparsed.sources).toEqual([
    "https://jsr.io/@fresh/core/2.1.0/src/render.ts",
  ]);
  expect(reparsed.sourceRoot).toBe("");
  // The original transformed code is preserved before the comment.
  expect(result.code.startsWith(body)).toBe(true);
});

Deno.test("rewriteLoadedSourceMap - appends identity map when no inline map", () => {
  const result = rewriteLoadedSourceMap(
    "foo();\nbar();",
    "jsr:@fresh/core/src/render.ts",
  );
  expect(result.map.sources).toEqual(["jsr:@fresh/core/src/render.ts"]);
  expect(result.map.sourceRoot).toBe("");
  expect(result.map.mappings).toBe("AAAA;AACA");
  // The original code is preserved and an inline source map is appended.
  expect(result.code.startsWith("foo();\nbar();")).toBe(true);
  expect(result.code).toContain(
    "//# sourceMappingURL=data:application/json;base64,",
  );
});

Deno.test("rewriteLoadedSourceMap - falls back to identity on malformed inline map", () => {
  const code = "foo();\n//# sourceMappingURL=data:application/json;base64,!!!";
  const result = rewriteLoadedSourceMap(code, "file:///abs.ts");
  expect(result.map.sources).toEqual(["file:///abs.ts"]);
});

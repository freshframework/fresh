import { expect } from "@std/expect";
import {
  IS_PATTERN,
  mergePath,
  pathToPattern,
  patternToSegments,
  UrlPatternRouter,
} from "./router.ts";

Deno.test("IS_PATTERN", () => {
  expect(IS_PATTERN.test("/foo")).toEqual(false);
  expect(IS_PATTERN.test("/foo/bar/baz.jpg")).toEqual(false);
  expect(IS_PATTERN.test("/foo/:path")).toEqual(true);
  expect(IS_PATTERN.test("/foo/*")).toEqual(true);
  expect(IS_PATTERN.test("/foo{/bar}?")).toEqual(true);
  expect(IS_PATTERN.test("/foo/(\\d+)")).toEqual(true);
  expect(IS_PATTERN.test("/foo/(a)")).toEqual(true);
});

Deno.test("UrlPatternRouter - GET extract params", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/:foo/:bar/c", A);

  let res = router.match("GET", new URL("/a/b/c", "http://localhost"));
  expect(res).toEqual({
    params: { foo: "a", bar: "b" },
    item: A,
    methodMatch: true,
    pattern: "/:foo/:bar/c",
  });

  // Decode params
  res = router.match("GET", new URL("/a%20a/b/c", "http://localhost"));
  expect(res).toEqual({
    params: { foo: "a a", bar: "b" },
    item: A,
    methodMatch: true,
    pattern: "/:foo/:bar/c",
  });
});

Deno.test("UrlPatternRouter - Wrong method match", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/foo", A);

  const res = router.match("POST", new URL("/foo", "http://localhost"));
  expect(res).toEqual({
    params: Object.create(null),
    item: null,
    methodMatch: false,
    pattern: "/foo",
  });
});

Deno.test("UrlPatternRouter - wrong + correct method", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  const B = () => {};
  router.add("GET", "/foo", A);
  router.add("POST", "/foo", B);

  const res = router.match("POST", new URL("/foo", "http://localhost"));
  expect(res).toEqual({
    params: Object.create(null),
    item: B,
    methodMatch: true,
    pattern: "/foo",
  });
});

Deno.test("UrlPatternRouter - trailing slash matches route without slash", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/wissen", A);

  const res = router.match("GET", new URL("/wissen/", "http://localhost"));
  expect(res).toEqual({
    params: Object.create(null),
    item: A,
    methodMatch: true,
    pattern: "/wissen",
  });
});

Deno.test("UrlPatternRouter - no trailing slash matches route with slash", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/wissen/", A);

  const res = router.match("GET", new URL("/wissen", "http://localhost"));
  expect(res).toEqual({
    params: Object.create(null),
    item: A,
    methodMatch: true,
    pattern: "/wissen/",
  });
});

Deno.test("UrlPatternRouter - exact match takes priority over trailing slash fallback", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  const B = () => {};
  router.add("GET", "/wissen", A);
  router.add("GET", "/wissen/", B);

  const withSlash = router.match(
    "GET",
    new URL("/wissen/", "http://localhost"),
  );
  expect(withSlash).toEqual({
    params: Object.create(null),
    item: B,
    methodMatch: true,
    pattern: "/wissen/",
  });

  const withoutSlash = router.match(
    "GET",
    new URL("/wissen", "http://localhost"),
  );
  expect(withoutSlash).toEqual({
    params: Object.create(null),
    item: A,
    methodMatch: true,
    pattern: "/wissen",
  });
});

Deno.test("UrlPatternRouter - root trailing slash does not double-match", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/", A);

  const res = router.match("GET", new URL("/", "http://localhost"));
  expect(res).toEqual({
    params: Object.create(null),
    item: A,
    methodMatch: true,
    pattern: "/",
  });
});

Deno.test("UrlPatternRouter - convert patterns automatically", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/books/:id", A);

  const res = router.match("GET", new URL("/books/foo", "http://localhost"));
  expect(res).toEqual({
    params: {
      id: "foo",
    },
    item: A,
    methodMatch: true,
    pattern: "/books/:id",
  });
});

Deno.test("pathToPattern", async (t) => {
  await t.step("creates pattern", () => {
    expect(pathToPattern("foo/bar")).toEqual("/foo/bar");
  });

  await t.step("parses index routes", () => {
    expect(pathToPattern("foo/index")).toEqual("/foo");
  });

  await t.step("parses parameters", () => {
    expect(pathToPattern("foo/[name]")).toEqual("/foo/:name");
    expect(pathToPattern("foo/[name]/bar/[bob]")).toEqual(
      "/foo/:name/bar/:bob",
    );
  });

  await t.step("parses catchall", () => {
    expect(pathToPattern("foo/[...name]")).toEqual("/foo/:name*");
  });

  await t.step("parses multiple params in same part", () => {
    expect(pathToPattern("foo/[mod]@[version]")).toEqual("/foo/:mod@:version");
    expect(pathToPattern("foo/[bar].json")).toEqual("/foo/:bar.json");
    expect(pathToPattern("foo/foo[bar]")).toEqual("/foo/foo:bar");
  });

  await t.step("parses optional params", () => {
    expect(pathToPattern("foo/[[name]]")).toEqual("/foo{/:name}?");
    expect(pathToPattern("foo/[name]/[[bob]]")).toEqual("/foo/:name{/:bob}?");
    expect(pathToPattern("foo/[[name]]/bar")).toEqual("/foo{/:name}?/bar");
    expect(
      pathToPattern("foo/[[name]]/bar/[[bob]]"),
    ).toEqual(
      "/foo{/:name}?/bar{/:bob}?",
    );
    expect(
      pathToPattern("(group)/[[name]]/(group2)/index"),
    ).toEqual(
      "/{:name}?",
    );
  });

  await t.step("throws on invalid patterns", () => {
    expect(() => pathToPattern("foo/[foo][bar]")).toThrow();
    expect(() => pathToPattern("foo/foo]")).toThrow();
    expect(() => pathToPattern("foo/[foo]]")).toThrow();
    expect(() => pathToPattern("foo/foo-[[name]]-bar/baz")).toThrow();
    expect(() => pathToPattern("foo/[[name]]-bar/baz")).toThrow();
    expect(() => pathToPattern("foo/foo-[[name]]/baz")).toThrow();
    expect(() => pathToPattern("foo/foo-[[name]]")).toThrow();
    expect(() => pathToPattern("foo/[[name]]-bar")).toThrow();
  });

  await t.step("keep groups", () => {
    expect(pathToPattern("foo/(foo)/bar", { keepGroups: true })).toEqual(
      "/foo/(foo)/bar",
    );
  });
});

Deno.test("patternToSegments", () => {
  expect(patternToSegments("/", "")).toEqual([""]);
  expect(patternToSegments("/foo", "")).toEqual([""]);
  expect(patternToSegments("/foo/bar", "")).toEqual(["", "foo"]);

  expect(patternToSegments("/:foo", "")).toEqual([""]);
  expect(patternToSegments("/:foo/:bar", "")).toEqual(["", ":foo"]);
  expect(patternToSegments("/:foo-:bar/foo", "")).toEqual(["", ":foo-:bar"]);
  expect(patternToSegments("/foo/", "")).toEqual(["", "foo"]);

  expect(patternToSegments("/foo/bar", "", true)).toEqual(["", "foo", "bar"]);

  // Optional params with {/...}? syntax should not split on / inside braces
  expect(patternToSegments("/api{/:opt}?/endpoint", "")).toEqual(["", "api"]);
  expect(patternToSegments("/api{/:opt}?/endpoint", "", true)).toEqual([
    "",
    "api",
    "endpoint",
  ]);
});

Deno.test("mergePath", () => {
  expect(mergePath("", "/foo", false)).toEqual("/foo");
  expect(mergePath("/", "/foo", false)).toEqual("/foo");
  expect(mergePath("/foo/bar", "/", false)).toEqual("/foo/bar");
  expect(mergePath("/foo/bar", "/baz", false)).toEqual("/foo/bar/baz");
  expect(mergePath("*", "/baz", false)).toEqual("/baz");
  expect(mergePath("/*", "/baz", false)).toEqual("/baz");
  expect(mergePath("/foo", "*", false)).toEqual("/foo/*");
  expect(mergePath("/foo", "/*", false)).toEqual("/foo/*");

  // mounting
  expect(mergePath("", "/foo", true)).toEqual("/foo");
  expect(mergePath("/", "/foo", true)).toEqual("/foo");
  expect(mergePath("/foo/bar", "/", true)).toEqual("/foo/bar");
  expect(mergePath("/foo/bar", "/baz", true)).toEqual("/foo/bar/baz");
  expect(mergePath("*", "/baz", true)).toEqual("/baz");
  expect(mergePath("/*", "/baz", true)).toEqual("/baz");
  expect(mergePath("/foo", "*", true)).toEqual("/foo");
  expect(mergePath("/foo", "/*", true)).toEqual("/foo/*");
});

Deno.test("UrlPatternRouter - first registered route wins on duplicate", () => {
  const router = new UrlPatternRouter<() => string>();
  const first = () => "first";
  const second = () => "second";

  router.add("GET", "/foo", first);
  router.add("GET", "/foo", second);

  const res = router.match("GET", new URL("/foo", "http://localhost"));
  expect(res.item).toBe(first);
});

Deno.test("UrlPatternRouter - duplicate registration different methods", () => {
  const router = new UrlPatternRouter<() => string>();
  const getHandler = () => "get";
  const postHandler = () => "post";

  router.add("GET", "/foo", getHandler);
  router.add("POST", "/foo", postHandler);

  const getRes = router.match("GET", new URL("/foo", "http://localhost"));
  expect(getRes.item).toBe(getHandler);

  const postRes = router.match("POST", new URL("/foo", "http://localhost"));
  expect(postRes.item).toBe(postHandler);
});

Deno.test("UrlPatternRouter - non-standard method on static route", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/foo", A);

  // Methods outside the seven known verbs (here PROPFIND, common from
  // WebDAV scanners) must surface as `methodMatch: false` with a `null`
  // item rather than returning `undefined` and crashing the handler.
  // deno-lint-ignore no-explicit-any
  const res = router.match("PROPFIND" as any, new URL("/foo", "http://x"));
  expect(res).toEqual({
    params: Object.create(null),
    item: null,
    methodMatch: false,
    pattern: "/foo",
  });
});

Deno.test("UrlPatternRouter - non-standard method on dynamic route", () => {
  const router = new UrlPatternRouter();
  const A = () => {};
  router.add("GET", "/books/:id", A);

  // deno-lint-ignore no-explicit-any
  const res = router.match("PROPFIND" as any, new URL("/books/1", "http://x"));
  expect(res).toEqual({
    params: Object.create(null),
    item: null,
    methodMatch: false,
    pattern: "/books/:id",
  });
});

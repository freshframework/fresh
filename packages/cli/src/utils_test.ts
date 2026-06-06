import { expect } from "@std/expect";
import { computeUtilsImport, toPascalCase } from "./utils.ts";

Deno.test("toPascalCase - simple name", () => {
  expect(toPascalCase("about")).toBe("About");
});

Deno.test("toPascalCase - kebab-case", () => {
  expect(toPascalCase("user-profile")).toBe("UserProfile");
});

Deno.test("toPascalCase - snake_case", () => {
  expect(toPascalCase("user_profile")).toBe("UserProfile");
});

Deno.test("toPascalCase - dynamic param [id]", () => {
  expect(toPascalCase("[id]")).toBe("Id");
});

Deno.test("toPascalCase - catch-all [...slug]", () => {
  expect(toPascalCase("[...slug]")).toBe("Slug");
});

Deno.test("toPascalCase - nested path", () => {
  expect(toPascalCase("search-bar")).toBe("SearchBar");
});

Deno.test("computeUtilsImport - top-level route", () => {
  expect(computeUtilsImport("routes/about.tsx")).toBe("../utils.ts");
});

Deno.test("computeUtilsImport - nested route", () => {
  expect(computeUtilsImport("routes/admin/users.tsx")).toBe(
    "../../utils.ts",
  );
});

Deno.test("computeUtilsImport - deeply nested", () => {
  expect(computeUtilsImport("routes/api/v1/users.ts")).toBe(
    "../../../utils.ts",
  );
});

Deno.test("computeUtilsImport - island", () => {
  expect(computeUtilsImport("islands/Counter.tsx")).toBe("../utils.ts");
});

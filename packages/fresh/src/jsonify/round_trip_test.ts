import { expect } from "@std/expect";
import { parse } from "./parse.ts";
import { assertSnapshot } from "@std/testing/snapshot";
import { inspect } from "node:util";
import { stringify } from "./stringify.ts";

const inner = { foo: 123 };
const references = { a: inner, b: [inner, inner] };

const circular = { a: 1, b: null as unknown };
circular.b = circular;

const TESTS = [
  undefined,
  null,
  1,
  2,
  -2,
  Infinity,
  -Infinity,
  0,
  -0,
  NaN,
  1.2 -
  1.2,
  true,
  false,
  "abc",
  1n,
  -1n,
  [1, 2, 3],
  [null, undefined, -2],
  { a: 1, b: null, c: -2 },
  new Uint8Array([1, 2, 3]),
  new URL("https://usefresh.dev"),
  new Date("1990-05-31"),
  new Date("Invalid Date"),
  new Map([[1, null], [undefined, -2]]),
  new Set([1, 2, null, -2, NaN]),
  [1, , 3],
  /foo["]/,
  Temporal.Instant.from("2020-01-01T12:34:56.789101112Z"),
  Temporal.ZonedDateTime.from("2020-01-01T12:34:56.789101112Z[UTC]"),
  Temporal.PlainDate.from("2020-01-01"),
  Temporal.PlainTime.from("12:34:56.789101112"),
  Temporal.PlainDateTime.from("2020-01-01T12:34:56.789101112"),
  Temporal.PlainYearMonth.from("2020-01"),
  Temporal.PlainMonthDay.from("2020-01-01"),
  Temporal.Duration.from("P1Y2M3W4DT5H6M7.00800901S"),
  references,
  circular,
];

for (const value of TESTS) {
  Deno.test(`round trip - ${inspect(value)}`, async (t) => {
    const str = stringify(value);
    await assertSnapshot(t, str);
    const parsed = parse(str);
    expect(parsed).toEqual(value);
  });
}

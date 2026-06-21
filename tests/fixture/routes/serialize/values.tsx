import { page } from "./$values.ts";

import { Values } from "../../islands/probe.tsx";

// A cyclic object: `self` points back at the object itself.
const cyclic: { name: string; self?: unknown } = { name: "root" };
cyclic.self = cyclic;

// Pass each rich value type as an island prop so the client revival can be
// asserted. Values are fixed (no `Date.now()`) so the test is deterministic.
export default page(function ValuesPage() {
  return (
    <main>
      <Values
        date={new Date("2026-01-02T03:04:05.000Z")}
        map={
          new Map([
            ["a", 1],
            ["b", 2],
          ])
        }
        set={new Set([1, 2, 3])}
        big={12345678901234567890n}
        re={/^[a-z]+$/i}
        cyclic={cyclic}
      />
    </main>
  );
});

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

// A demo of keyed island survival across partial swaps.
//
// When this island is rendered with a Preact `key`, Fresh writes that key into
// the SSR start marker (`<!--fresh-island:N:key-->`). On a partial swap the
// client matches the live and incoming markers by key, leaves the live DOM in
// place, and pushes the new props through Preact's normal diff. Hooks, refs,
// signals, and even `useEffect` mount-once side effects all survive — only
// props that actually changed apply.
//
// This component surfaces all three signals so it's easy to see:
//   * `count` — the user-driven state we want to preserve.
//   * `mounts` — a counter incremented by `useEffect(..., [])`. If the
//     island had been remounted, this would tick up; on a kept swap it stays
//     at 1.
//   * `label` — the prop that changes between the two demo routes; visible
//     proof that Preact diffed the new vnode into the surviving root.
export function KeptCounter({ label }: { label: string }) {
  const count = useSignal(0);
  const mounts = useRef(0);
  const mountTick = useSignal(0);
  useEffect(() => {
    mounts.current += 1;
    mountTick.value = mounts.current;
  }, []);
  return (
    <div class="kept-counter">
      <p>
        Label (a prop): <strong>{label}</strong>
      </p>
      <p>
        Count (signal state):{" "}
        <button id="kept-inc" type="button" onClick={() => count.value++}>
          {count}
        </button>
      </p>
      <p>
        Mount count (`useEffect(..., [])` runs): <strong>{mountTick}</strong>
        {" — should stay at 1 across swaps if the island was kept alive."}
      </p>
    </div>
  );
}

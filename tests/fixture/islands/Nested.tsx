import { type Signal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// Two islands where the outer renders the inner directly in its own markup —
// the supported "nested islands" shape. The server renders the inner island
// inline (NO markers, NO serialized props); on the client the outer island
// re-creates it during its own render. The inner deliberately takes a plain
// closure prop (`onInc`) — which is NOT serializable — so this only works
// because nested-island props are never serialized.

/** Inner island — driven entirely by props the outer island hands it. */
export function NestedInner({ value, onInc }: { value: Signal<number>; onInc: () => void }) {
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  return (
    <button id="inner-btn" type="button" data-hydrated={hydrated} onClick={onInc}>
      inner:{value}
    </button>
  );
}

/** Outer island — owns the signal and renders the inner island within itself. */
export function NestedOuter() {
  const count = useSignal(0);
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  return (
    <div data-testid="nested-outer" data-hydrated={hydrated}>
      <span data-testid="nested-view">value:{count}</span>
      <button id="outer-btn" type="button" onClick={() => count.value++}>
        outer+
      </button>
      <NestedInner value={count} onInc={() => count.value++} />
    </div>
  );
}

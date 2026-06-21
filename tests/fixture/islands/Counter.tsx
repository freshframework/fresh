import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// A self-contained counter used across the fixture to assert hydration and
// state preservation. `id` lets tests target a specific instance; the
// `data-hydrated` attribute flips to "true" once the island has mounted on the
// client, giving tests a deterministic "is this interactive yet" signal.
export function Counter({ id, label }: { id: string; label?: string }) {
  const count = useSignal(0);
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  const prefix = label ?? "count";
  return (
    <button
      id={id}
      type="button"
      data-hydrated={hydrated}
      data-label={prefix}
      onClick={() => {
        count.value++;
      }}
    >
      {prefix}:{count}
    </button>
  );
}

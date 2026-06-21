import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// A co-located island living in the route-group folder `(_islands)` (Fresh 2
// parity). It must be detected, transformed, bundled, and hydrated exactly like
// a root `islands/` island — `data-hydrated` flips once it mounts client-side.
export function Local({ id }: { id: string }) {
  const count = useSignal(0);
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  return (
    <button
      id={id}
      type="button"
      data-hydrated={hydrated}
      onClick={() => {
        count.value++;
      }}
    >
      local:{count}
    </button>
  );
}

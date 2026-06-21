import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// SSRs to nothing (returns `null`), then renders content once mounted. Proves
// an island whose *server* output is empty still gets a marker pair, hydrates,
// and runs effects — the content below can only appear on the client.
export function NullThenContent({ id }: { id: string }) {
  const ready = useSignal(false);
  useEffect(() => {
    ready.value = true;
  }, []);
  if (!ready.value) return null;
  return (
    <p id={id} data-hydrated="true">
      ready
    </p>
  );
}

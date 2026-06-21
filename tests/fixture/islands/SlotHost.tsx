import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";

// Receives JSX as props ("slots"). `children` is rendered inline (so the server
// brackets its DOM with slot markers); `extra` is rendered only after the toggle
// (so the server emits it into a <template>, and the client grafts it in when
// the island finally renders the prop). Proves both slot paths.
export function SlotHost(props: { children?: ComponentChildren; extra?: ComponentChildren }) {
  const open = useSignal(false);
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  return (
    <div data-testid="slot-host" data-hydrated={hydrated}>
      <div data-testid="slot-children">{props.children}</div>
      <button
        id="toggle-extra"
        type="button"
        onClick={() => {
          open.value = !open.value;
        }}
      >
        toggle
      </button>
      <div data-testid="slot-extra">{open.value ? props.extra : null}</div>
    </div>
  );
}

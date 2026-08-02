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
      {/* The slot is rendered with siblings on both sides, and they're `<p>`s —
          the same tag the slot's own content uses. Hydration matches by tag
          name, so these have to be matched against the island's own DOM; if the
          slot's nodes are still in the tree, preact adopts one of them here. */}
      <div data-testid="slot-children">
        <p data-testid="before-slot">before</p>
        {props.children}
        <p data-testid="after-slot">after</p>
      </div>
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

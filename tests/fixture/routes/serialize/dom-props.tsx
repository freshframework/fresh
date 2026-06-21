import { useSignal } from "@preact/signals";
import { setValue, toggle } from "fresh/events";
import { page } from "./$dom-props.ts";

// Page-level intrinsic elements with signal-bound DOM props (no island). These
// exercise the client `setProperty` port: a boolean property, a plain
// `setAttribute` (class), a style-object diff, and the aria carve-out (where
// `false` stays as an attribute rather than being removed).
export default page(function DomProps() {
  const disabled = useSignal(false);
  const cls = useSignal("box red");
  const style = useSignal<Record<string, string>>({ color: "rgb(255, 0, 0)" });
  const pressed = useSignal(false);

  return (
    <main>
      <button id="target" type="button" disabled={disabled}>
        target
      </button>
      <div id="box" class={cls}>
        box
      </div>
      <div id="styled" style={style}>
        styled
      </div>
      <div id="aria" role="button" aria-pressed={pressed}>
        aria
      </div>

      <button id="toggle-disabled" type="button" onClick={toggle(disabled)}>
        td
      </button>
      <button id="set-class" type="button" onClick={setValue(cls, "box blue")}>
        sc
      </button>
      <button id="set-style" type="button" onClick={setValue(style, { color: "rgb(0, 128, 0)" })}>
        ss
      </button>
      <button id="toggle-pressed" type="button" onClick={toggle(pressed)}>
        tp
      </button>
    </main>
  );
});

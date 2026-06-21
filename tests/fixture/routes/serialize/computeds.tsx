import { useSignal } from "@preact/signals";
import { add, setFromProp, setValue, toggle } from "fresh/events";
import { and, equals, or, test as regexTest } from "fresh/signals";
import { page } from "./$computeds.ts";

// The built-in computeds from `fresh/signals`, each driven by page-level
// signals and rendered as a reactive boolean text node.
export default page(function Computeds() {
  const count = useSignal(0);
  const text = useSignal("");
  const a = useSignal(false);
  const b = useSignal(false);

  const isFive = equals(count, 5);
  const isAlpha = regexTest(text, /^[a-z]+$/);
  const both = and(a, b);
  const either = or(a, b);

  return (
    <main>
      <button id="inc" type="button" onClick={add(count, 1)}>
        +1
      </button>
      <button id="set5" type="button" onClick={setValue(count, 5)}>
        set 5
      </button>
      <p data-testid="is-five">{isFive}</p>

      <input id="text" value={text} onInput={setFromProp(text, "value")} />
      <p data-testid="is-alpha">{isAlpha}</p>

      <button id="toggle-a" type="button" onClick={toggle(a)}>
        a
      </button>
      <button id="toggle-b" type="button" onClick={toggle(b)}>
        b
      </button>
      <p data-testid="both">{both}</p>
      <p data-testid="either">{either}</p>
    </main>
  );
});

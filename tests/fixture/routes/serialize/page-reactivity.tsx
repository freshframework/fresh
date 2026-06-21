import { useSignal } from "@preact/signals";
import { add, setFromProp, setValue, toggle } from "fresh/events";
import { useNot } from "fresh/signals";
import { page } from "./$page-reactivity.ts";

import { addTo, useDouble } from "../../islands/probe.tsx";

// Page-level reactivity with NO island wrapper: signals as text nodes, a signal
// bound to an input's attribute, serialized event handlers (framework + a
// custom factory), and serialized computeds (a `makeComputed` and a built-in).
export default page(function PageReactivity() {
  const count = useSignal(0);
  const text = useSignal("");
  const open = useSignal(false);
  const doubled = useDouble(count); // makeComputed — re-runs on the client
  const negated = useNot(open); // built-in computed

  return (
    <main>
      <p data-testid="count-text">{count}</p>
      <p data-testid="doubled-text">{doubled}</p>
      <p data-testid="not-open">{negated}</p>

      {/* Framework event handlers (fresh/events). */}
      <button id="inc" type="button" onClick={add(count, 1)}>
        +1
      </button>
      <button id="set5" type="button" onClick={setValue(count, 5)}>
        set 5
      </button>
      <button id="toggle" type="button" onClick={toggle(open)}>
        toggle
      </button>
      {/* A custom serialized (factory) handler. */}
      <button id="add10" type="button" onClick={addTo(count, 10)}>
        +10
      </button>

      {/* Attribute signal binding + two-way `setFromProp`. */}
      <input id="text-input" value={text} onInput={setFromProp(text, "value")} />
      <button id="set-text" type="button" onClick={setValue(text, "preset")}>
        preset
      </button>
      <p data-testid="text-mirror">{text}</p>
    </main>
  );
});

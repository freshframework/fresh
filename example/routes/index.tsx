import { setValue, setFromProp } from "fresh/events";
import { useSignal } from "@preact/signals";

import { createAlert, useDouble } from "../islands/double.tsx";

import { page } from "./$index.ts";

export default page(function Page() {
  const counter = useSignal(0);
  const doubled = useDouble(counter);
  const text = useSignal("hello");
  const hovering = useSignal(false);

  return (
    <div>
      <input type="number" value={counter} onInput={setFromProp(counter, "value")} />
      <p>The doubled value is: {doubled}</p>
      <input type="text" value={text} onInput={setFromProp(text, "value")} />
      <p>Text: {text}</p>
      <button
        disabled={hovering}
        onMouseEnter={setValue(hovering, true)}
        onMouseLeave={setValue(hovering, false)}
        onClick={createAlert("Hello from a button!")}
      >
        Hover me
      </button>
    </div>
  );
});

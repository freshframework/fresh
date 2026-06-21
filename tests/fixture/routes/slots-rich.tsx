import { useSignal } from "@preact/signals";
import { add } from "fresh/events";
import { page } from "./$slots-rich.ts";

import { SlotHost } from "../islands/SlotHost.tsx";
import { Counter } from "../islands/Counter.tsx";

// Rich, interactive content passed as an island slot: an inline signal, a
// signal-bound attribute, a serialized event handler, and a nested island —
// all driven page-level even though they render inside the host island. The
// inline text, the attribute, and the button share one page-level `count`
// signal; the island has its own independent state.
export default page(function SlotsRich() {
  const count = useSignal(0);
  return (
    <div>
      <SlotHost>
        <div data-testid="rich-slot">
          <span data-testid="slot-count">{count}</span>
          <span data-testid="slot-attr" data-n={count}>
            n
          </span>
          <button id="slot-inc" type="button" onClick={add(count, 1)}>
            inc
          </button>
          <Counter id="slot-island" />
        </div>
      </SlotHost>
    </div>
  );
});

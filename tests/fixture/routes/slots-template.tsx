import { useSignal } from "@preact/signals";
import { add } from "fresh/events";
import { page } from "./$slots-template.ts";

import { SlotHost } from "../islands/SlotHost.tsx";
import { Counter } from "../islands/Counter.tsx";

// The `extra` slot isn't rendered at SSR (SlotHost renders it only after the
// toggle), so it's emitted into a <template>. Its content is interactive — an
// inline signal, a serialized handler, and an island — to prove templated slots
// hydrate when grafted, not just inline ones.
export default page(function SlotsTemplate() {
  const n = useSignal(0);
  return (
    <div>
      <SlotHost
        extra={
          <div data-testid="tpl-slot">
            <span data-testid="tpl-count">{n}</span>
            <button id="tpl-inc" type="button" onClick={add(n, 1)}>
              inc
            </button>
            <Counter id="tpl-island" />
          </div>
        }
      >
        <p data-testid="children-content">children</p>
      </SlotHost>
    </div>
  );
});

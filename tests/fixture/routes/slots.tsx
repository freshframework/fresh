import { page } from "./$slots.ts";
import { SlotHost } from "../islands/SlotHost.tsx";

// Passes JSX to an island as props. The JSX isn't structurally serializable —
// it rides across as server-rendered DOM the island grafts in via a slot.
export default page(function SlotsRoute() {
  return (
    <div>
      <SlotHost extra={<p data-testid="extra-content">extra slot content</p>}>
        <p data-testid="children-content">
          hello from a <strong>slot</strong>
        </p>
      </SlotHost>
    </div>
  );
});

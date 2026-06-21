import { navigating } from "fresh/runtime";

// Renders the live partial-navigation state. Placed OUTSIDE the `<Partial>` so
// it survives swaps and can be observed flipping to "navigating" while a slow
// partial request is in flight, then back to "idle".
export function NavStatus() {
  const busy = navigating.use();
  return <p data-testid="nav-status">{busy.value ? "navigating" : "idle"}</p>;
}

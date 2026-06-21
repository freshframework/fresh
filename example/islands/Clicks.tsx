import { useSignal } from "@preact/signals";

// A self-contained island used in the partials demo. It lives *outside* the
// `<Partial>` region, so partial navigations never touch it — its click count
// survives every panel swap, proving the page wasn't fully reloaded.
export function Clicks() {
  const count = useSignal(0);
  return (
    <button type="button" class="clicks" onClick={() => count.value++}>
      Island clicks: {count}
    </button>
  );
}

import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Head } from "fresh/runtime";

// An island that drives the document <title> reactively from a signal. After
// hydration, clicking the button must update the real `document.title` — the
// client-side `<Head>` hook re-applying to `document.head`. `data-hydrated`
// flips once mounted so the test can wait for interactivity.
export function TitleIsland() {
  const count = useSignal(0);
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);
  return (
    <div>
      <Head>
        <title>count {count}</title>
      </Head>
      <button id="title-inc" type="button" data-hydrated={hydrated} onClick={() => count.value++}>
        inc
      </button>
    </div>
  );
}

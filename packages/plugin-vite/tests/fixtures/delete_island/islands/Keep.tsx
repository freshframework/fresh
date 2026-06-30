import { useSignal } from "@preact/signals";

export default function Keep() {
  const s = useSignal(0);
  return (
    <button type="button" class="keep" onClick={() => s.value++}>
      keep {s.value}
    </button>
  );
}

import { useSignal } from "@preact/signals";

export default function Extra() {
  const s = useSignal(0);
  return (
    <button type="button" class="extra" onClick={() => s.value++}>
      extra {s.value}
    </button>
  );
}

import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export const clientOnly = true;

export default function ClientOnlyIsland(
  props: { id?: string; label?: string },
) {
  const active = useSignal(false);
  useEffect(() => {
    active.value = true;
  }, []);

  return (
    <div
      id={props.id}
      class={active.value ? "client-only ready" : "client-only"}
    >
      <p class="label">{props.label ?? "rendered on client"}</p>
      <p class="check">
        {typeof document !== "undefined" ? "has-document" : "no-document"}
      </p>
    </div>
  );
}

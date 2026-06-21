import { useSignal } from "@preact/signals";
import * as Icons from "../components/Icons.tsx";
import type { JSX } from "preact";

interface CounterProps {
  start: number;
}

export default function Counter(props: CounterProps) {
  const count = useSignal(props.start);

  return (
    <div>
      <h3 class="text-2xl font-bold">Interactive island</h3>
      <p>The server supplied the initial value of 3.</p>
      <div class="flex justify-between items-center mt-4 mx-auto" style="max-width: 20rem">
        <RoundedButton title="Subtract 1" onClick={() => (count.value -= 1)}>
          <Icons.IconMinus />
        </RoundedButton>
        <div class="text-6xl tabular-nums font-bold">{count}</div>

        <RoundedButton title="Add 1" onClick={() => (count.value += 1)}>
          <Icons.IconPlus />
        </RoundedButton>
      </div>
    </div>
  );
}

function RoundedButton(props: JSX.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      style={{
        touchAction: "manipulation",
      }}
      {...props}
      class="p-3 rounded-full border-2 border-current bg-white/20 hover:bg-white/50 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-200 disabled:cursor-default"
    />
  );
}

import { useSignal } from "@preact/signals";
import { Button } from "../components/Button.tsx";

export function Counter({ start }: { start: number }) {
  const count = useSignal(start);
  return (
    <div>
      <p>Count: {count}</p>
      <Button onClick={() => count.value++}>Click me</Button>
    </div>
  );
}

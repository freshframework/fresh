import { Signal } from "@preact/signals";
import { Button } from "../components/Button";
import { Head } from "fresh/runtime";

export function Counter({ counter }: { counter: Signal<number> }) {
  console.log("Counter rendered");
  return (
    <div>
      <p>
        Count: <span id="count-value">{counter}</span>
      </p>
      <Head>
        <title>Count {counter}</title>
      </Head>
      <Button id="inc" onClick={() => counter.value++}>
        Click me
      </Button>
    </div>
  );
}

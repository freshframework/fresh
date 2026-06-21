import { Head } from "fresh/runtime";
import { handler, page } from "./$about.ts";
import { Wrapper } from "../islands/Wrapper.tsx";
import { Counter } from "../islands/Counter.tsx";
import { useSignal } from "@preact/signals";
import { add } from "fresh/events";
import { useDouble } from "../islands/double.tsx";

export const handlers = handler(() => {
  return { data: "about page" };
});

export default page(function Page(props) {
  const counter = useSignal(0);
  const doubleSignal = useDouble(counter);
  return (
    <div>
      <Head>
        <title>About — Fresh 3 example</title>
        <meta name="description" content="The about page." />
        <link rel="canonical" href="https://example.com/about" />
      </Head>
      <h1 class="red">About</h1>
      <p>Data: {props.data}</p>
      <Wrapper>
        <div>
          {counter} (Double: {doubleSignal})<button onClick={add(counter, 1)}>Increment</button>
          <Counter counter={counter} />
        </div>
      </Wrapper>
    </div>
  );
});

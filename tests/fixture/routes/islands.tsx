import { page } from "./$islands.ts";

import { Counter } from "../islands/Counter.tsx";

export default page(function Islands() {
  return (
    <main>
      <h1>islands</h1>
      <Counter id="counter" />
    </main>
  );
});

import { page } from "./$index.ts";
import { Counter } from "../islands/Counter.tsx";

export default page(function Home() {
  return (
    <main>
      <h1>Welcome to Fresh</h1>
      <p>
        Edit <code>routes/index.tsx</code> and save to see changes.
      </p>
      <Counter start={0} />
    </main>
  );
});

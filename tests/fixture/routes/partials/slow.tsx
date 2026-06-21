import { handler, page } from "./$slow.ts";

// Deliberately slow handler so the `navigating` signal is observably true for
// long enough that an e2e assertion can catch the in-flight state.
export const handlers = handler(async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { data: {} };
});

export default page(function Slow() {
  return (
    <section data-testid="panel-slow">
      <h2>Slow</h2>
    </section>
  );
});

import { handler, page } from "./$data.ts";

// Exposes `ctx.isPartial` and a query echo so tests can confirm the handler
// runs for partial requests and reads the URL.
export const handlers = handler((ctx) => {
  return { data: { isPartial: ctx.isPartial, q: ctx.url.searchParams.get("q") ?? "" } };
});

export default page(function Data(props) {
  return (
    <section data-testid="panel-data">
      <p data-testid="is-partial">{String(props.data.isPartial)}</p>
      <p data-testid="q">{props.data.q}</p>
    </section>
  );
});

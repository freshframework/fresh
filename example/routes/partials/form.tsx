import { handler, page } from "./$form.ts";

// Both forms below submit inside the `f-client-nav` region, so the client
// intercepts them as partial navigations:
//   * the GET form's fields are encoded into the URL (the handler reads
//     `ctx.url.searchParams`);
//   * the POST form's fields arrive as the request body (the handler reads
//     `ctx.req.formData()`), which the client forwarded from the submission.
// Either way only the `content` partial is swapped — no full page load.
export const handlers = handler({
  GET(ctx) {
    const q = ctx.url.searchParams.get("q") ?? "";
    return { data: { q, greeting: null as string | null } };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = String(form.get("name") ?? "").trim();
    return { data: { q: "", greeting: name ? `Hello, ${name}!` : null } };
  },
});

export default page(function Form(props) {
  const { q, greeting } = props.data;
  return (
    <div class="panel">
      <h3>Forms</h3>

      <form method="get" action="/partials/form">
        <input type="search" name="q" value={q} placeholder="Search…" />
        <button type="submit">Search (GET)</button>
      </form>
      {q !== "" && (
        <p>
          You searched for: <strong>{q}</strong>
        </p>
      )}

      <form method="post" action="/partials/form">
        <input type="text" name="name" placeholder="Your name" />
        <button type="submit">Greet (POST)</button>
      </form>
      {greeting !== null && <p>{greeting}</p>}
    </div>
  );
});

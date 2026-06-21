import { handler, page } from "./$form.ts";

export const handlers = handler({
  GET(ctx) {
    return { data: { q: ctx.url.searchParams.get("q") ?? "", greeting: null as string | null } };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = String(form.get("name") ?? "").trim();
    return { data: { q: "", greeting: name ? `hi ${name}` : null } };
  },
});

export default page(function Form(props) {
  const { q, greeting } = props.data;
  return (
    <section data-testid="panel-form">
      <form method="get" action="/partials/form">
        <input name="q" />
        <button id="get-submit" type="submit">
          get
        </button>
      </form>
      {q !== "" && <p data-testid="search-result">searched:{q}</p>}

      <form method="post" action="/partials/form">
        <input name="name" />
        <button id="post-submit" type="submit">
          post
        </button>
      </form>
      {greeting !== null && <p data-testid="greet-result">{greeting}</p>}
    </section>
  );
});

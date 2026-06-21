import { handler, page } from "./$forms.ts";
import { Partial } from "fresh/runtime";

import { Counter } from "../islands/Counter.tsx";

// Exercises "richer" form submissions: an EXTERNAL submitter (a `<button
// form="…">` placed outside its form, and outside any `f-client-nav` element)
// and a per-submitter `formaction` override. Lives at the top level (no shared
// `f-client-nav` wrapper) so the external button is genuinely outside every
// client-nav region — the partial swap must come from resolving the opt-in via
// the form, not the button's ancestors.
export const handlers = handler({
  GET() {
    return { data: { result: null as string | null } };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = String(form.get("name") ?? "").trim();
    const mode = ctx.url.searchParams.get("mode") ?? "default";
    return { data: { result: `${mode}:${name}` } };
  },
});

export default page(function Forms(props) {
  return (
    <div>
      {/* An island purely as a "runtime ready" signal: once it reports
          data-hydrated the boot chunk has run, so the partial-navigation runtime
          is installed and clicks below will be intercepted. */}
      <Counter id="ready" />

      {/* Case 1 — external submitter. `f-client-nav` is on the FORM; the submit
          button is a sibling outside it, associated via `form="ext"`. */}
      <form id="ext" method="post" action="/forms" f-client-nav>
        <input name="name" />
      </form>
      <button id="ext-submit" type="submit" form="ext">
        external submit
      </button>

      {/* Case 2 — `formaction` override: the form posts to /forms, but this
          submitter redirects the POST to /forms?mode=fa. */}
      <div f-client-nav>
        <form id="fa" method="post" action="/forms">
          <input name="name" />
          <button id="fa-submit" type="submit" formaction="/forms?mode=fa">
            via formaction
          </button>
        </form>
      </div>

      <Partial name="result">
        {props.data.result !== null && <p data-testid="result">{props.data.result}</p>}
      </Partial>
    </div>
  );
});

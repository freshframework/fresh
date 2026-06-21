import { handler } from "./$[slug].ts";

export const handlers = handler({
  GET(ctx) {
    return new Response(`admin post ${ctx.params.slug}`);
  },
});

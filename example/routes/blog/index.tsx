import { handler } from "./$index.ts";

export const handlers = handler({
  GET(_ctx) {
    return new Response("blog");
  },
});

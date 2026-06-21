import { handler } from "./$posts.ts";

export const handlers = handler({
  GET(_ctx) {
    return new Response("admin posts");
  },
});

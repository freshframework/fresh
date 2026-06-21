import { handler } from "./$users.ts";

export const handlers = handler({
  GET(_ctx) {
    return new Response("admin users");
  },
});

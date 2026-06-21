import { handler } from "./$update.ts";
import VERSIONS from "../versions.json" with { type: "json" };

export const handlers = handler({
  GET(ctx) {
    const accept = ctx.req.headers.get("accept");
    let path = "/docs/concepts/updating";
    if (accept && !accept.includes("text/html")) {
      path = `https://deno.land/x/fresh@${VERSIONS[0]}/update.ts`;
    }
    return ctx.redirect(path, 307);
  },
});

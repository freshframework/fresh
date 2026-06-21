import { handler } from "./$single.ts";

// Single-function handler (not a method map): matches every method. Returns a
// Response verbatim, echoing the request method.
export const handlers = handler((ctx) => {
  return Response.json({ method: ctx.req.method });
});

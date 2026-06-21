import { handler } from "./$methods.ts";

// Method-map handler exposing only GET + POST. A HEAD falls back to GET; any
// other method throws `MethodNotAllowedError` → renders through `_error` as 405.
export const handlers = handler({
  GET() {
    return Response.json({ method: "GET" });
  },
  POST() {
    return Response.json({ method: "POST" });
  },
});

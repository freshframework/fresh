import { handler } from "./$json.ts";

// No page export + a render-result → the framework serves `data` as JSON.
export const handlers = handler({
  GET() {
    return { data: { shape: "json", n: 1 } };
  },
});

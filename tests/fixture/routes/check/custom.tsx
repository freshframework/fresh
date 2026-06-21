import { handler, page } from "./$custom.ts";

// Render-result with an explicit status + custom headers — the page still
// renders (text/html), but the status and extra header ride through.
export const handlers = handler({
  GET() {
    return { data: { ok: true }, status: 418, headers: { "x-custom": "teapot" } };
  },
});

export default page(function Custom(props) {
  return <p data-testid="custom">custom:{String(props.data.ok)}</p>;
});

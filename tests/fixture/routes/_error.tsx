import { handler, page } from "./$_error.ts";
import { HttpError } from "fresh/errors";

// Catch-all error page. Reached for 404 (NotFoundError), 405
// (MethodNotAllowedError), an explicit `throw new HttpError(status)`, or any
// other thrown value (→ 500). `HttpError` subclasses carry their own status —
// `instanceof HttpError` is reliable here because the class is shared through
// the `fresh/errors` module instance. (`instanceof Error` is NOT reliable
// across the dev SSR module boundary, so we read `.message` structurally.)
export const handlers = handler({
  GET(ctx) {
    const status = ctx.error instanceof HttpError ? ctx.error.status : 500;
    return { data: { status }, status };
  },
});

export default page(function Error(props) {
  const { status } = props.data;
  const err = props.error as { message?: unknown } | null | undefined;
  const message = typeof err?.message === "string" ? err.message : "Something went wrong";
  return (
    <main data-testid="error-page">
      <h1 data-testid="error-status">{status}</h1>
      <p data-testid="error-message">{message}</p>
    </main>
  );
});

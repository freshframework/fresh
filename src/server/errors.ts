// HTTP error hierarchy used by the framework for error-page routing.
//
// `HttpError` carries a numeric `status` so the `_error` route can choose
// behavior by status (or by `instanceof` check). User code can throw these
// from a route handler / middleware to trigger the error page with the
// chosen status:
//
//   if (!user) throw new NotFoundError("User not found");
//   if (!auth) throw new HttpError(401, "Sign in required");
//
// The framework itself throws `NotFoundError` when no route matches and
// `MethodNotAllowedError` when a matched route's method-map rejects the
// request method.

/** Base class for HTTP-status-bearing errors handled by the `_error` route. */
export class HttpError extends Error {
  override name = "HttpError";
  status: number;

  constructor(status: number, message?: string) {
    super(message ?? defaultMessage(status));
    this.status = status;
  }
}

/**
 * 404 — no route matched the request URL. Thrown automatically by the server
 * entrypoint, but user code may throw it too (e.g. when a record lookup
 * fails).
 */
export class NotFoundError extends HttpError {
  override name = "NotFoundError";
  constructor(message?: string) {
    super(404, message);
  }
}

/**
 * 405 — a route matched but its method-map has no entry for the request's
 * method. Carries the allowed methods so the error page can populate an
 * `Allow` header.
 */
export class MethodNotAllowedError extends HttpError {
  override name = "MethodNotAllowedError";
  /** Methods the matched route does support, sorted alphabetically. */
  allowed: ReadonlyArray<string>;

  constructor(allowed: ReadonlyArray<string>, message?: string) {
    super(405, message);
    this.allowed = allowed;
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 405:
      return "Method Not Allowed";
    case 500:
      return "Internal Server Error";
    default:
      return `HTTP ${status}`;
  }
}

// Runtime error classes thrown by the framework and re-thrown by user code
// to trigger the `_error` route. Kept in their own entrypoint so
// `fresh/types` remains type-only (no runtime cost on import).

export { HttpError, MethodNotAllowedError, NotFoundError } from "../server/errors.ts";

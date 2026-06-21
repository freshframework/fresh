import { handler } from "./$teapot.ts";
import { HttpError } from "fresh/errors";

// Throwing an `HttpError` carries its status through to the `_error` page.
export const handlers = handler({
  GET() {
    throw new HttpError(418, "i am a teapot");
  },
});

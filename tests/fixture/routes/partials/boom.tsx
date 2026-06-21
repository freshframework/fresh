import { handler } from "./$boom.ts";

// Always throws — a partial fetch here returns a 500, which the client treats as
// non-applicable and falls back to a full-page load of the error document.
export const handlers = handler({
  GET() {
    throw new Error("partial boom");
  },
});

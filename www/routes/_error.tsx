import { handler, page } from "./$_error.ts";
import LemonDrop from "../islands/LemonDrop.tsx";

/**
 * Read an HTTP status off a thrown error structurally. `instanceof` is
 * unreliable on the error page (the error crosses the SSR realm boundary), so
 * we duck-type the `status` field rather than checking `instanceof HttpError`.
 */
function httpStatus(error: unknown): number | null {
  if (
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return null;
}

export function ServerCodePage(props: { serverCode: number; codeDescription: string }) {
  return (
    <>
      <section>
        <div class="w-full flex justify-center items-center flex-col bg-green-300 mt-0 pt-8 !mb-0 bg-gradient-to-br from-blue-100 via-green-200 to-yellow-100">
          <LemonDrop />
        </div>
        <div class="text-center">
          <h1 class="text-6xl md:text-9xl font-extrabold">{props.serverCode}</h1>

          <p class="p-4 text-2xl md:text-3xl">{props.codeDescription}</p>

          <p class="p-4">
            <a href="/" class="hover:underline">
              Back to the Homepage
            </a>
          </p>
        </div>
      </section>
    </>
  );
}

export const handlers = handler({
  GET(ctx) {
    const status = httpStatus(ctx.error) ?? 500;
    return { data: { status }, status };
  },
});

export default page(function ErrorPage(props) {
  const error = props.error;
  if (httpStatus(error) === 404) {
    return ServerCodePage({
      serverCode: 404,
      codeDescription: "Couldn’t find what you’re looking for.",
    });
  }

  // deno-lint-ignore no-console
  console.error(error);

  return ServerCodePage({
    serverCode: 500,
    codeDescription: "Oops! Something went wrong.",
  });
});

import { middleware } from "./$_middleware.ts";
import type { Event } from "../utils/ga4.ts";
import { GA4Report, isDocument, isServerError } from "../utils/ga4.ts";

const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID;

let showedMissingEnvWarning = false;

function ga4(request: Request, response: Response, error?: unknown) {
  if (GA4_MEASUREMENT_ID === undefined) {
    if (!showedMissingEnvWarning) {
      showedMissingEnvWarning = true;
      // deno-lint-ignore no-console
      console.warn(
        "GA4_MEASUREMENT_ID environment variable not set. Google Analytics reporting disabled.",
      );
    }
    return;
  }

  Promise.resolve()
    .then(async () => {
      // We're tracking page views and file downloads. These are the only two
      // HTTP methods that _might_ be used.
      if (!/^(GET|POST)$/.test(request.method)) {
        return;
      }

      // If the visitor is using a web browser, only create events when we serve
      // a top level documents or download; skip assets like css, images, fonts.
      if (!isDocument(request, response) && error == null) {
        return;
      }

      let event: Event | null = null;
      const contentType = response.headers.get("content-type");
      if (contentType && /text\/html/.test(contentType)) {
        event = { name: "page_view", params: {} }; // Probably an old browser.
      }

      if (event == null && error == null) {
        return;
      }

      // If an exception was thrown, build a separate event to report it.
      const exceptionEvent =
        error != null
          ? {
              name: "exception",
              params: {
                description: String(error),
                fatal: isServerError(response),
              },
            }
          : undefined;

      const report = new GA4Report({
        measurementId: GA4_MEASUREMENT_ID,
        request,
        response,
        conn: {},
      });

      // Override the default (page_view) event.
      report.event = event;

      // Add the exception event, if any.
      if (exceptionEvent != null) {
        report.events.push(exceptionEvent);
      }

      await report.send();
    })
    .catch((err) => {
      // deno-lint-ignore no-console
      console.error(err);
    });
}

export default middleware(async (ctx) => {
  let err: unknown;
  let res: Response;
  try {
    res = await ctx.next();
    return res;
  } catch (e) {
    res = new Response("Internal Server Error", { status: 500 });
    err = e;
    throw e;
  } finally {
    ga4(ctx.req, res!, err);
  }
});

import { handler, page } from "./$_error";
import { HttpError } from "fresh/errors";

export const handlers = handler({
  GET(ctx) {
    const status = ctx.error instanceof HttpError ? ctx.error.status : 500;
    return { data: { status }, status };
  },
});

export default page(({ data, error, url }) => {
  const status = data.status;
  const message = error instanceof Error ? error.message : "Something went wrong";
  const stack = error instanceof Error ? error.stack : null;
  return (
    <div class="error">
      <h1>{status}</h1>
      <p>{message}</p>
      {stack && <pre>{stack}</pre>}
      <p>
        <code>{url.pathname}</code>
      </p>
      <p>
        <a href="/">Back home</a>
      </p>
    </div>
  );
});

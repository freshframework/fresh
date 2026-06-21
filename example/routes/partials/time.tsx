import { handler, page } from "./$time.ts";

// A handler runs on every partial navigation, so the time refreshes each time
// you click "Server time". `ctx.isPartial` is `true` when the request came in
// as a partial fetch.
export const handlers = handler(async (ctx) => {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate some latency
  return {
    data: {
      now: new Date().toLocaleTimeString("en-US", { hour12: false }),
      isPartial: ctx.isPartial,
    },
  };
});

export default page(function Time(props) {
  return (
    <div class="panel">
      <h3>Server time</h3>
      <p>
        Rendered at <strong>{props.data.now}</strong>
      </p>
      <p>
        Served as a partial: <code>{String(props.data.isPartial)}</code>
      </p>
    </div>
  );
});

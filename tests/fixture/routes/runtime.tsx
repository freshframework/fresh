import { handler } from "./$runtime.ts";

// Echoes the deployment-target-specific request context that Fresh surfaces as
// `ctx.runtime` (srvx's normalized per-target context). Under `vite dev` the
// host is Node, so `runtime.name` is `"node"` and `waitUntil` is callable.
export const handlers = handler({
  GET(ctx) {
    let waitUntilThrew = false;
    try {
      ctx.waitUntil(Promise.resolve());
    } catch {
      waitUntilThrew = true;
    }
    return Response.json({
      runtimeName: ctx.runtime?.name ?? null,
      hasRuntime: ctx.runtime !== undefined,
      waitUntilCallable: !waitUntilThrew,
    });
  },
});

import { middleware } from "./$_middleware.ts";

const REDIRECTS: Record<string, string> = {
  "/docs/getting-started/fetching-data": "/docs/getting-started/custom-handlers",
};

export default middleware((ctx) => {
  const { pathname } = ctx.url;

  // Redirect /docs/canary/... to /docs/... since canary docs
  // have been merged into latest
  if (pathname.startsWith("/docs/canary/")) {
    const rest = pathname.slice("/docs/canary".length);
    return ctx.redirect(`/docs${rest}`, 301);
  }

  // Redirect from old doc URLs to new ones
  const redirect = REDIRECTS[pathname];
  if (redirect) {
    return ctx.redirect(redirect, 307);
  }

  return ctx.next();
});

Deno.serve({ port: 0, hostname: "127.0.0.1" }, (req) => {
  const url = new URL(req.url);
  return Response.json({
    proxyReceived: true,
    pathname: url.pathname,
  });
});

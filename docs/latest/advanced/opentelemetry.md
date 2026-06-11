---
description: |
  Fresh has built-in OpenTelemetry instrumentation for tracing requests through middleware, handlers, and rendering.
---

Fresh automatically instruments key operations with
[OpenTelemetry](https://opentelemetry.io/) spans, giving you visibility into how
requests flow through your application. No code changes are needed - just
configure an exporter.

## What's instrumented

Fresh creates spans for:

- **[Middleware](/docs/concepts/middleware) execution** - each middleware in the
  chain
- **Route handler execution** - handler function calls
- **Rendering** - server-side page rendering, including async components
- **[Static file](/docs/concepts/static-files) serving** - file lookups,
  caching, and responses
- **Lazy route loading** - dynamic imports of route modules on first access

All spans are created under the `fresh` tracer (named with the current Fresh
version). The root span for each request includes `http.route` with the matched
route pattern (e.g. `GET /blog/:slug`), making it easy to group traces by route.

## Enabling tracing

Fresh uses the `@opentelemetry/api` package (the vendor-neutral API). Spans are
created automatically - you just need to provide an OpenTelemetry SDK and
exporter to collect them.

If no exporter is configured, the spans are silently discarded with no
performance overhead.

### With Deno's built-in OpenTelemetry

Deno has
[built-in OpenTelemetry support](https://docs.deno.com/runtime/fundamentals/open_telemetry/).
Enable it with the `OTEL_DENO` environment variable:

```sh Terminal
OTEL_DENO=true deno task start
```

This exports traces to an OTLP-compatible collector. Configure the endpoint:

```sh Terminal
OTEL_DENO=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
deno task start
```

### With Deno Deploy

[Deno Deploy](/docs/deployment/deno-deploy) collects Fresh traces automatically
when using the Fresh preset - no configuration needed. Traces appear in the Deno
Deploy dashboard.

### With a custom exporter

You can use any OpenTelemetry-compatible backend (Jaeger, Zipkin, Honeycomb,
Grafana Tempo, Datadog, etc.). Install the SDK and configure an exporter in your
entry point:

```ts main.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "https://your-collector.example.com/v1/traces",
  }),
});
sdk.start();
```

## Span attributes

Fresh sets the following attributes on spans:

| Attribute         | Span type   | Description                                                                |
| ----------------- | ----------- | -------------------------------------------------------------------------- |
| `http.route`      | Root        | The matched route pattern (e.g. `/blog/:slug`)                             |
| `fresh.span_type` | Various     | Internal span classification (`render`, etc.)                              |
| `fresh.cache`     | Static file | Cache status (`immutable`, `not_modified`, `no_cache`, `invalid_bust_key`) |
| `fresh.cache_key` | Static file | The cache bust key for the asset                                           |

Errors in handlers or rendering are recorded on the span with
`span.recordException()` and the span status is set to `ERROR`.

## Local development

### Console exporter

The quickest way to see traces is to print them to the console. Deno (2.7+)
supports this out of the box - no extra dependencies or services needed:

```sh Terminal
OTEL_DENO=true \
OTEL_TRACES_EXPORTER=console \
deno task start
```

Each request prints its spans directly to stderr, showing the full breakdown of
middleware, handler, and rendering timings.

### Jaeger

For a visual trace explorer, run [Jaeger](https://www.jaegertracing.io/) locally
with Docker:

```sh Terminal
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  cr.jaegertracing.io/jaegertracing/jaeger:latest
```

Then start your Fresh app pointing at the Jaeger collector:

```sh Terminal
OTEL_DENO=true \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
deno task start
```

Open `http://localhost:16686` to browse traces. You'll see each request broken
down into its middleware, handler, and rendering spans.

## Client-side trace correlation

When an OpenTelemetry exporter is active, Fresh automatically injects a
[W3C Trace Context](https://www.w3.org/TR/trace-context/) `<meta>` tag into the
`<head>` of every rendered page:

```html
<head>
  <meta
    name="traceparent"
    content="00-ab42124a3c573678d4d8b21ba52df3bf-d21f7bc17caa5aba-01"
  >
  <!-- ... -->
</head>
```

This allows client-side OpenTelemetry instrumentation (such as
[`@opentelemetry/instrumentation-document-load`](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/c9d62be989802534c01373e8ab41e13747d7ee3e/packages/instrumentation-document-load))
to link browser performance traces back to the server-side span that rendered
the page, giving you end-to-end visibility from server rendering through page
load.

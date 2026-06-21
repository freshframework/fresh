import { CodeBlock } from "../../components/CodeBlock.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";

const features = [
  {
    title: "<Head> component",
    description:
      "Set titles, meta tags, stylesheets, and scripts from any page or island. Fresh hoists them into the document head for you.",
    href: "/docs/advanced/head",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.5rem"
        height="1.5rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M18 3a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12z" />
        <path d="M9 12h6" />
        <path d="M13 8l4 4l-4 4" />
      </svg>
    ),
    code: `<Head>
  <title>My Page</title>
  <meta name="description"
    content="..." />
</Head>`,
    lang: "jsx" as const,
  },
  {
    title: "Route handlers",
    description:
      "Define GET, POST, DELETE, or any HTTP method as a named handler on your route, with full type safety.",
    href: "/docs/concepts/routes",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.5rem"
        height="1.5rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M4 13h5" />
        <path d="M12 16v-8h3a2 2 0 0 1 2 2v1a2 2 0 0 1 -2 2h-3" />
        <path d="M20 8v8" />
        <path d="M9 16v-5.5a2.5 2.5 0 0 0 -5 0v5.5" />
      </svg>
    ),
    code: `export const handlers = handler({
  GET(ctx) { /* ... */ },
  POST(ctx) { /* ... */ },
  DELETE(ctx) { /* ... */ },
});`,
    lang: "js" as const,
  },
  {
    title: "Typed everything",
    description:
      "Generated $ helpers give you typed ctx, params, and props.data inferred from the actual handler. No manual interfaces.",
    href: "/docs/advanced/type-checking",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.5rem"
        height="1.5rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M7 10h14l-4 -4" />
        <path d="M17 14h-14l4 4" />
      </svg>
    ),
    code: `import { handler, page } from
  "./$[id].ts";

export const handlers = handler({
  GET(ctx) {
    return { data: ctx.params.id };
  },
});`,
    lang: "js" as const,
  },
  {
    title: "Nested layouts",
    description:
      "Drop a _layout.tsx into any folder under routes/. Fresh composes the layouts outermost-first, automatically.",
    href: "/docs/concepts/layouts",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.5rem"
        height="1.5rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
        <path d="M10 13l-1 2l1 2" />
        <path d="M14 13l1 2l-1 2" />
      </svg>
    ),
    code: `import { layout } from
  "./$_layout.ts";

export default layout(
  ({ Component }) => (
    <div class="app">
      <Component />
    </div>
  ),
);`,
    lang: "jsx" as const,
  },
  {
    title: "Events on static pages",
    description:
      "Wire onClick into server-rendered HTML with serializable handlers. No island required. The surrounding markup stays static.",
    href: "/docs/concepts/events",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.5rem"
        height="1.5rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M6 21l6 -5l6 5" />
        <path d="M12 13v8" />
        <path d="M3.294 13.678l.166 .281c.52 .88 1.624 1.265 2.605 .91l14.242 -5.165a1.023 1.023 0 0 0 .565 -1.456l-2.62 -4.705a1.024 1.024 0 0 0 -1.462 -.394l-13.397 7.719c-1.038 .598 -1.272 1.783 -.594 2.692" />
        <path d="M8 11.5l5.5 -3.2" />
        <path d="M12.602 8.3l-2.552 4.6" />
      </svg>
    ),
    code: `import { add } from "fresh/events";

<button onClick={add(count, 1)}>
  +
</button>`,
    lang: "jsx" as const,
  },
  {
    title: "Vite-powered dev",
    description:
      "Built on Vite. Instant dev server, fast HMR with Preact Fast Refresh, and full Vite plugin support.",
    href: "/docs/getting-started",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.5rem"
        height="1.5rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06" />
        <path d="M15 19l2 2l4 -4" />
      </svg>
    ),
    code: `import { defineConfig } from "vite";
import { fresh } from "fresh/vite";

export default defineConfig({
  plugins: [fresh()],
});`,
    lang: "js" as const,
  },
];

const extras = [
  {
    title: "File-based routing",
    description: "Drop a file in routes/, get a URL. Dynamic params via [id].tsx.",
    href: "/docs/concepts/routing",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.25rem"
        height="1.25rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
        <path d="M5 18h2" />
        <path d="M10 18h2" />
        <path d="M15 18h2" />
        <path d="M20 18h2" />
      </svg>
    ),
  },
  {
    title: "Middleware",
    description: "Chain auth, logging, or any logic before your routes run.",
    href: "/docs/concepts/middleware",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.25rem"
        height="1.25rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9l8 -4.5" />
        <path d="M12 12l8 -4.5" />
        <path d="M12 12v9" />
        <path d="M12 12l-8 -4.5" />
      </svg>
    ),
  },
  {
    title: "Signals & reactivity",
    description: "Preact Signals power reactive state inside islands and even on the static page.",
    href: "/docs/concepts/signals",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.25rem"
        height="1.25rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M15 17.5c.32 .32 .754 .5 1.207 .5h.543a1.75 1.75 0 0 0 0 -3.5h-1a1.75 1.75 0 0 1 0 -3.5h.543c.453 0 .887 .18 1.207 .5" />
        <path d="M9 12h4" />
        <path d="M11 12v6" />
        <path d="M21 19v-14a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2z" />
      </svg>
    ),
  },
  {
    title: "Deploy anywhere",
    description: "Nitro builds for Node, Deno Deploy, Cloudflare Workers, containers, and more.",
    href: "/docs/getting-started",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.25rem"
        height="1.25rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
        <path d="M3.6 9h16.8" />
        <path d="M3.6 15h16.8" />
        <path d="M11.5 3a17 17 0 0 0 0 18" />
        <path d="M12.5 3a17 17 0 0 1 0 18" />
      </svg>
    ),
  },
  {
    title: "Error pages",
    description: "A single _error.tsx renders 404s, 405s, and any thrown error.",
    href: "/docs/concepts/error-pages",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.25rem"
        height="1.25rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M4 4m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v1a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
        <path d="M4 13m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
        <path d="M14 4m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
      </svg>
    ),
  },
  {
    title: "Partials",
    description: "Swap regions of the page during navigation, with no full reload.",
    href: "/docs/advanced/partials",
    icon: (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        class="text-fresh"
        width="1.25rem"
        height="1.25rem"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M4 7l3 0" />
        <path d="M4 11l3 0" />
        <path d="M4 15l3 0" />
        <path d="M4 19l3 0" />
        <path d="M11 7l10 0" />
        <path d="M11 11l10 0" />
        <path d="M11 15l10 0" />
        <path d="M11 19l10 0" />
      </svg>
    ),
  },
];

export function MoreFeatures() {
  return (
    <div className="w-full py-8 bg-linear-to-r from-fresh-green/10 to-fresh/10">
      <PageSection>
        <div class="text-center flex flex-col gap-2">
          <SectionHeading>And so much more</SectionHeading>
        </div>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <a
              href={f.href}
              class="grid grid-cols-1 grid-rows-[minmax(9.5rem,auto)_1fr] items-stretch gap-3 transition-colors bg-white rounded-lg overflow-clip hover:bg-fresh/1 border border-gray-200 hover:border-fresh"
            >
              <div className="p-6 space-y-3">
                <div class="flex items-center gap-2 justify-between">
                  <h3 class="font-bold text-lg sm:text-xl lg:text-2xl">{f.title}</h3>
                  {f.icon}
                </div>
                <p class="text-gray-600 text-sm">{f.description}</p>
              </div>
              <div class="text-xs h-full [&>div]:h-full [&_pre]:m-0! [&_pre]:rounded-none [&_pre]:h-full [&_pre]:p-6! flex-1">
                <CodeBlock code={f.code} lang={f.lang} />
              </div>
            </a>
          ))}
        </div>
        <div class="text-center flex flex-col gap-2 mt-8">
          <h3 class="text-lg font-bold text-gray-600">(…and even more)</h3>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {extras.map((e) => (
            <a
              href={e.href}
              class="flex flex-col gap-2 p-4 rounded-lg border border-gray-200 hover:bg-fresh/1 transition-colors bg-white hover:border-fresh"
            >
              <div class="flex items-center gap-2 justify-between">
                <h3 class="font-bold text-sm">{e.title}</h3>
                {e.icon}
              </div>
              <p class="text-gray-500 text-xs">{e.description}</p>
            </a>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

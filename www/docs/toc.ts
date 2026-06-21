import FRESH_VERSIONS_1x from "../versions.json" with { type: "json" };

// Version selector labels. `latest` tracks Fresh 3; `v2.x` is the archived
// Fresh 2 documentation (frozen), and `1.x` the legacy Fresh 1 docs.
const LATEST_LABEL = "3.x";
const V2_LABEL = "2.x";

type RawTableOfContents = Record<
  string,
  {
    label: string;
    content: Record<string, RawTableOfContentsEntry>;
  }
>;

interface RawTableOfContentsEntry {
  title: string;
  link?: string;
  pages?: [string, string, string?][];
}

const toc: RawTableOfContents = {
  latest: {
    label: LATEST_LABEL,
    content: {
      introduction: {
        title: "Introduction",
        link: "latest",
      },
      "getting-started": {
        title: "Getting Started",
        link: "latest",
      },
      concepts: {
        title: "Concepts",
        link: "latest",
        pages: [
          ["routing", "Routing", "link:latest"],
          ["routes", "Routes", "link:latest"],
          ["context", "Context", "link:latest"],
          ["middleware", "Middleware", "link:latest"],
          ["layouts", "Layouts", "link:latest"],
          ["app-shell", "App shell", "link:latest"],
          ["error-pages", "Error pages", "link:latest"],
          ["islands", "Islands", "link:latest"],
          ["signals", "Signals & reactivity", "link:latest"],
          ["events", "Event handlers", "link:latest"],
        ],
      },
      advanced: {
        title: "Advanced",
        link: "latest",
        pages: [
          ["head", "<head> element", "link:latest"],
          ["partials", "Partials", "link:latest"],
          ["serializable-types", "Serializable types", "link:latest"],
          ["type-checking", "Type checking", "link:latest"],
        ],
      },
    },
  },
  "v2.x": {
    label: V2_LABEL,
    content: {
      introduction: {
        title: "Introduction",
        link: "v2.x",
      },
      "getting-started": {
        title: "Getting Started",
        link: "v2.x",
      },
      concepts: {
        title: "Concepts",
        link: "v2.x",
        pages: [
          ["architecture", "Architecture", "link:v2.x"],
          ["islands", "Islands", "link:v2.x"],
          ["app", "App", "link:v2.x"],
          ["routing", "Routing", "link:v2.x"],
          ["data-fetching", "Data Fetching", "link:v2.x"],
          ["middleware", "Middlewares", "link:v2.x"],
          ["context", "Context", "link:v2.x"],
          ["signals", "Signals", "link:v2.x"],
          ["layouts", "Layouts", "link:v2.x"],
          ["static-files", "Static files", "link:v2.x"],
          ["file-routing", "File routing", "link:v2.x"],
        ],
      },
      advanced: {
        title: "Advanced",
        link: "v2.x",
        pages: [
          ["app-wrapper", "App wrapper", "link:v2.x"],
          ["layouts", "Layouts", "link:v2.x"],
          ["error-handling", "Error handling", "link:v2.x"],
          ["partials", "Partials", "link:v2.x"],
          ["view-transitions", "View Transitions", "link:v2.x"],
          ["forms", "Forms", "link:v2.x"],
          ["define", "Define Helpers", "link:v2.x"],
          ["serialization", "Serialization", "link:v2.x"],
          ["environment-variables", "Environment Variables", "link:v2.x"],
          ["head", "<head> element", "link:v2.x"],
          ["vite", "Vite Plugin Options", "link:v2.x"],
          ["websockets", "WebSockets", "link:v2.x"],
          ["opentelemetry", "OpenTelemetry", "link:v2.x"],
          ["api-reference", "API Reference", "link:v2.x"],
          ["troubleshooting", "Troubleshooting", "link:v2.x"],
          ["builder", "Builder (Legacy)", "link:v2.x"],
        ],
      },
      deployment: {
        title: "Deployment",
        link: "v2.x",
        pages: [
          ["deno-deploy", "Deno Deploy", "link:v2.x"],
          ["deno-compile", "deno compile", "link:v2.x"],
          ["docker", "Docker", "link:v2.x"],
          ["cloudflare-workers", "Cloudflare Workers", "link:v2.x"],
        ],
      },
      testing: {
        title: "Testing",
        link: "v2.x",
      },
      plugins: {
        title: "Plugins",
        link: "v2.x",
        pages: [
          ["cors", "cors", "link:v2.x"],
          ["csrf", "csrf", "link:v2.x"],
          ["csp", "csp", "link:v2.x"],
          ["ip-filter", "ipFilter", "link:v2.x"],
          ["trailing-slashes", "trailingSlashes", "link:v2.x"],
        ],
      },
      examples: {
        title: "Examples",
        link: "v2.x",
        pages: [
          ["api-routes", "API Routes", "link:v2.x"],
          ["daisyui", "daisyUI", "link:v2.x"],
          ["markdown", "Rendering Markdown", "link:v2.x"],
          ["rendering-raw-html", "Rendering raw HTML", "link:v2.x"],
          ["sharing-state-between-islands", "Sharing state between islands", "link:v2.x"],
          ["active-links", "Active links", "link:v2.x"],
          ["session-management", "Session management", "link:v2.x"],
          ["common-patterns", "Common Patterns", "link:v2.x"],
        ],
      },
      "migration-guide": {
        title: "Migration Guide",
        link: "v2.x",
      },
      contributing: {
        title: "Contributing",
        link: "v2.x",
      },
    },
  },
  "1.x": {
    label: FRESH_VERSIONS_1x[0],
    content: {
      introduction: {
        title: "Introduction",
      },
      "getting-started": {
        title: "Getting Started",
        pages: [
          ["create-a-project", "Create a project"],
          ["running-locally", "Running locally"],
          ["create-a-route", "Create a route"],
          ["dynamic-routes", "Dynamic routes"],
          ["custom-handlers", "Custom handlers"],
          ["form-submissions", "Form submissions"],
          ["adding-interactivity", "Adding interactivity"],
          ["deploy-to-production", "Deploy to production"],
        ],
      },
      concepts: {
        title: "Concepts",
        pages: [
          ["architecture", "Architecture"],
          ["server-components", "Server Components"],
          ["routing", "Routing"],
          ["routes", "Routes"],
          ["app-wrapper", "App wrapper"],
          ["layouts", "Layouts"],
          ["forms", "Forms"],
          ["islands", "Interactive islands"],
          ["static-files", "Static files"],
          ["middleware", "Middlewares"],
          ["error-pages", "Error pages"],
          ["partials", "Partials"],
          ["data-fetching", "Data fetching"],
          ["ahead-of-time-builds", "Ahead-of-time Builds"],
          ["deployment", "Deployment"],
          ["plugins", "Plugins"],
          ["updating", "Updating Fresh"],
          ["server-configuration", "Server configuration"],
        ],
      },
      integrations: {
        title: "Integrations",
      },
      examples: {
        title: "Examples",
        pages: [
          ["migrating-to-tailwind", "Migrating to Tailwind"],
          ["modifying-the-head", "Modifying the <head>"],
          ["writing-tests", "Writing tests"],
          ["changing-the-src-dir", "Changing the source directory"],
          ["using-twind-v1", "Using Twind v1"],
          ["init-the-server", "Initializing the server"],
          ["using-fresh-canary-version", "Using Fresh canary version"],
          ["dealing-with-cors", "Dealing with CORS"],
          ["creating-a-crud-api", "Creating a CRUD API"],
          ["handling-complex-routes", "Handling complex routes"],
          ["rendering-markdown", "Rendering markdown"],
          ["rendering-raw-html", "Rendering raw HTML"],
          ["sharing-state-between-islands", "Sharing state between islands"],
          ["using-csp", "Using CSP"],
          ["active-links", "Styling active links"],
          ["client-side-components-and-libraries", "Client only side components"],
        ],
      },
    },
  },
};

export default toc;

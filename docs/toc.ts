import FRESH_VERSIONS_1x from "../versions.json" with { type: "json" };
import LATEST_VERSION_2 from "../packages/fresh/deno.json" with {
  type: "json",
};

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
    label: LATEST_VERSION_2.version,
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
          ["architecture", "Architecture", "link:latest"],
          ["islands", "Islands", "link:latest"],
          ["app", "App", "link:latest"],
          ["routing", "Routing", "link:latest"],
          ["data-fetching", "Data Fetching", "link:latest"],
          ["middleware", "Middlewares", "link:latest"],
          ["context", "Context", "link:latest"],
          ["signals", "Signals", "link:latest"],
          ["layouts", "Layouts", "link:latest"],
          ["static-files", "Static files", "link:latest"],
          ["file-routing", "File routing", "link:latest"],
        ],
      },
      advanced: {
        title: "Advanced",
        link: "latest",
        pages: [
          ["app-wrapper", "App wrapper", "link:latest"],
          ["layouts", "Layouts", "link:latest"],
          ["error-handling", "Error handling", "link:latest"],
          ["partials", "Partials", "link:latest"],
          ["view-transitions", "View Transitions", "link:latest"],
          ["forms", "Forms", "link:latest"],
          ["define", "Define Helpers", "link:latest"],
          ["serialization", "Serialization", "link:latest"],
          ["environment-variables", "Environment Variables", "link:latest"],
          ["head", "<head> element", "link:latest"],
          ["vite", "Vite Plugin Options", "link:latest"],
          ["websockets", "WebSockets", "link:latest"],
          ["opentelemetry", "OpenTelemetry", "link:latest"],
          ["api-reference", "API Reference", "link:latest"],
          ["troubleshooting", "Troubleshooting", "link:latest"],
          ["builder", "Builder (Legacy)", "link:latest"],
        ],
      },
      deployment: {
        title: "Deployment",
        link: "latest",
        pages: [
          ["deno-deploy", "Deno Deploy", "link:latest"],
          ["deno-compile", "deno compile", "link:latest"],
          ["docker", "Docker", "link:latest"],
          ["cloudflare-workers", "Cloudflare Workers", "link:latest"],
        ],
      },
      testing: {
        title: "Testing",
        link: "latest",
      },
      plugins: {
        title: "Plugins",
        link: "latest",
        pages: [
          ["cache", "cache", "link:latest"],
          ["cors", "cors", "link:latest"],
          ["csrf", "csrf", "link:latest"],
          ["csp", "csp", "link:latest"],
          ["ip-filter", "ipFilter", "link:latest"],
          ["trailing-slashes", "trailingSlashes", "link:latest"],
        ],
      },
      examples: {
        title: "Examples",
        link: "latest",
        pages: [
          ["api-routes", "API Routes", "link:latest"],
          ["daisyui", "daisyUI", "link:latest"],
          ["markdown", "Rendering Markdown", "link:latest"],
          ["rendering-raw-html", "Rendering raw HTML", "link:latest"],
          [
            "sharing-state-between-islands",
            "Sharing state between islands",
            "link:latest",
          ],
          ["active-links", "Active links", "link:latest"],
          ["session-management", "Session management", "link:latest"],
          ["common-patterns", "Common Patterns", "link:latest"],
        ],
      },
      "migration-guide": {
        title: "Migration Guide",
        link: "latest",
      },
      contributing: {
        title: "Contributing",
        link: "latest",
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
          [
            "client-side-components-and-libraries",
            "Client only side components",
          ],
        ],
      },
    },
  },
};

export default toc;

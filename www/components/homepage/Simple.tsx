import { PageSection } from "../../components/PageSection.tsx";
import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";

const TRADITIONAL = `// package.json
// tsconfig.json
// next.config.js
// postcss.config.js
// tailwind.config.js
// .eslintrc.json
// app/layout.tsx
// app/page.tsx

// app/api/hello/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "Hello!",
  });
}`;

const FRESH_EXAMPLE = `// main.ts — that's it.
import { App } from "fresh";

const app = new App()
  .get("/", (ctx) =>
    ctx.render(<h1>Hello!</h1>)
  )
  .get("/api/hello", () =>
    Response.json({
      message: "Hello!",
    })
  );

app.listen();`;

export function Simple() {
  return (
    <PageSection class="!mb-12 !mt-20">
      <div class="text-center max-w-max mx-auto flex flex-col gap-4">
        <p class="italic text-gray-500 text-lg">Introducing Fresh:</p>
        <h2 class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl sm:tracking-tight font-extrabold text-balance text-gray-600">
          The framework so simple, you already know it.
        </h2>
        <p class="text-xl text-balance max-w-prose mx-auto">
          No config files, no build step. Just one file and you
          have a server with routing, JSX, and islands.
        </p>
      </div>

      <div class="grid md:grid-cols-2 gap-6 mt-8 items-start">
        <div class="flex flex-col gap-3">
          <h3 class="font-bold text-lg text-gray-400 text-center">
            The traditional way
          </h3>
          <CodeWindow name="8 config files + app code">
            <CodeBlock code={TRADITIONAL} lang="js" />
          </CodeWindow>
        </div>
        <div class="flex flex-col gap-3">
          <h3 class="font-bold text-lg text-green-700 text-center">
            The Fresh way
          </h3>
          <CodeWindow name="main.ts">
            <CodeBlock code={FRESH_EXAMPLE} lang="jsx" />
          </CodeWindow>
        </div>
      </div>
    </PageSection>
  );
}

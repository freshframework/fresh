import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { FancyLink } from "../../components/FancyLink.tsx";

const apiCode = `import { createDefine } from "fresh";
const define = createDefine();

export const handlers = define.handlers({
  GET(ctx) {
    const user = db.getUser(ctx.params.id);
    return Response.json(user);
  },
  POST(ctx) {
    const body = await ctx.req.json();
    const user = db.updateUser(ctx.params.id, body);
    return Response.json(user);
  },
  DELETE(ctx) {
    db.deleteUser(ctx.params.id);
    return new Response(null, { status: 204 });
  },
});`;

export function APIRoutesSection() {
  return (
    <PageSection>
      <SideBySide mdColSplit="3/2" lgColSplit="3/2" reverseOnDesktop class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-api text-fresh"
            width="2.5rem"
            height="2.5rem"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <title>API routes icon</title>
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M4 13h5" />
            <path d="M12 16v-8h3a2 2 0 0 1 2 2v1a2 2 0 0 1 -2 2h-3" />
            <path d="M20 8v8" />
            <path d="M9 16v-5.5a2.5 2.5 0 0 0 -5 0v5.5" />
          </svg>
          <SectionHeading>Handlers for every method</SectionHeading>
          <p>
            Define <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">GET</code>,{" "}
            <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">POST</code>,{" "}
            <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">DELETE</code> — any
            HTTP method as a named handler on your route. Fresh maps requests to the right function
            automatically, with full type safety.
          </p>
          <FancyLink href="/docs/concepts/routing" class="mt-2">
            Learn about handlers
          </FancyLink>
        </div>
        <div class="flex flex-col gap-4">
          <CodeWindow name="routes/users/[id].tsx">
            <CodeBlock code={apiCode} lang="js" />
          </CodeWindow>
        </div>
      </SideBySide>
    </PageSection>
  );
}

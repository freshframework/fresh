import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { DemoBox } from "../../components/homepage/DemoBox.tsx";
import { ExampleArrow } from "../../components/homepage/ExampleArrow.tsx";
import { DocsDemo } from "../../components/homepage/DocsDemo.tsx";
import { FancyLink } from "../../components/FancyLink.tsx";

const islandCode = `import { handler, page } from "./$[id].ts";
import { Partial } from "fresh/runtime";

export const handlers = handler({
  async GET(ctx) {
    const content = await loadDoc(ctx.params.id);
    return { data: { content } };
  },
});

export default page(({ data }) => (
  <div f-client-nav>
    <aside>
      <a href="/docs/introduction">Introduction</a>
      <a href="/docs/routing">Routing</a>
      <a href="/docs/islands">Islands</a>
    </aside>
    <main>
      <Partial name="content">
        {data.content}
      </Partial>
    </main>
  </div>
));`;

export function PartialsSection({ topic }: { topic: string | null }) {
  return (
    <PageSection id="partials">
      <SideBySide mdColSplit="3/2" lgColSplit="3/2" reverseOnDesktop class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-arrows-transfer-down text-fresh"
            width="2.5rem"
            height="2.5rem"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <title>Arrows showing partial page navigation</title>
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M17 3v6" />
            <path d="M10 18l-3 3l-3 -3" />
            <path d="M7 21v-18" />
            <path d="M20 6l-3 -3l-3 3" />
            <path d="M17 21v-2" />
            <path d="M17 15v-2" />
          </svg>

          <SectionHeading>Swap parts of the page during navigation</SectionHeading>
          <p>
            Click a link or submit a form and Fresh replaces just the parts of the page that need to
            change. No full reload, no client-side routing library. The browser navigation UI still
            works: address bar, back and forward buttons, loading indicator.
          </p>
          <FancyLink href="/docs/advanced/partials" class="mt-4">
            Learn more about Partials
          </FancyLink>
        </div>
        <div class="flex flex-col gap-4">
          <CodeWindow name="routes/docs/[id].tsx">
            <CodeBlock code={islandCode} lang="jsx" />
          </CodeWindow>
          <ExampleArrow class="[transform:rotateY(-180deg)]" />
          <DemoBox flip>
            <DocsDemo topic={topic} />
          </DemoBox>
        </div>
      </SideBySide>
    </PageSection>
  );
}

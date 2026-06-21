import { PageSection } from "../PageSection.tsx";
import { SideBySide } from "../SideBySide.tsx";
import { CodeWindow } from "../CodeWindow.tsx";
import { CodeBlock } from "../CodeBlock.tsx";
import { SectionHeading } from "../homepage/SectionHeading.tsx";
import { DemoBox } from "../homepage/DemoBox.tsx";
import { ExampleArrow } from "../homepage/ExampleArrow.tsx";
import { FancyLink } from "../FancyLink.tsx";
import { FormSubmitDemo } from "../../islands/FormSubmitDemo.tsx";

const routingCode = `import { handler } from "./$index.ts";

export const handlers = handler({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const treat = form.get("treat");
    await db.votes.insert({ treat });
    return ctx.redirect("/thanks", 303);
  },
});`;

export function FormsSection() {
  return (
    <PageSection id="forms-section">
      <SideBySide mdColSplit="2/3" lgColSplit="2/3" class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <div class="leading-none text-[4rem]">
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              class="icon icon-tabler icon-tabler-route-square-2 text-fresh"
              width="2.5rem"
              height="2.5rem"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M14 5a2 2 0 0 0 -2 2v10a2 2 0 0 1 -2 2" />
              <path d="M3 17h4v4h-4z" />
              <path d="M17 3h4v4h-4z" />
            </svg>
          </div>
          <SectionHeading>Forms that just work</SectionHeading>
          <p>
            Handle submissions server-side with standard Request and FormData. No client-side state
            management, no serialization headaches. Progressive enhancement comes free.
          </p>
          <FancyLink href="/docs/concepts/routes" class="mt-2">
            Routes and forms in Fresh
          </FancyLink>
        </div>
        <div class="flex flex-col gap-4">
          <CodeWindow name="routes/index.tsx">
            <CodeBlock code={routingCode} lang="jsx" />
          </CodeWindow>
          <ExampleArrow />
          <DemoBox>
            <FormSubmitDemo />
          </DemoBox>
        </div>
      </SideBySide>
    </PageSection>
  );
}

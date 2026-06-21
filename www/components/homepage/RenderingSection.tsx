import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { CodeBlock } from "../../components/CodeBlock.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { DemoBox } from "../../components/homepage/DemoBox.tsx";
import { ExampleArrow } from "../../components/homepage/ExampleArrow.tsx";

const serverCode = `export default function HomePage() {
  const now = Temporal.Now.plainDateTimeISO()
    .toLocaleString("en-US");
  return (
    <p>Freshly server-rendered {now}</p>
  );
}`;

export function RenderingSection() {
  return (
    <PageSection>
      <SideBySide mdColSplit="2/3" lgColSplit="2/3" class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-atom text-fresh"
            width="2.5rem"
            height="2.5rem"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
            role="img"
          >
            <title>Preact icon</title>
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M12 12v.01" />
            <path d="M19.071 4.929c-1.562 -1.562 -6 .337 -9.9 4.243c-3.905 3.905 -5.804 8.337 -4.242 9.9c1.562 1.561 6 -.338 9.9 -4.244c3.905 -3.905 5.804 -8.337 4.242 -9.9" />
            <path d="M4.929 4.929c-1.562 1.562 .337 6 4.243 9.9c3.905 3.905 8.337 5.804 9.9 4.242c1.561 -1.562 -.338 -6 -4.244 -9.9c-3.905 -3.905 -8.337 -5.804 -9.9 -4.242" />
          </svg>
          <SectionHeading>Server-rendered by default</SectionHeading>
          <p>
            Every route renders on the server as a{" "}
            <a href="https://preactjs.com/" class="underline">
              Preact
            </a>{" "}
            component. Zero JavaScript hits the browser unless you opt in with an island. Pages are
            fast because they start as plain HTML.
          </p>
        </div>
        <div class="flex flex-col gap-4">
          <CodeWindow name="routes/index.tsx">
            <CodeBlock code={serverCode} lang="jsx" />
          </CodeWindow>
          <ExampleArrow class="ml-[55%]" />{" "}
          <DemoBox>
            <p>Freshly server-rendered {Temporal.Now.plainDateTimeISO().toLocaleString("en-US")}</p>
          </DemoBox>
        </div>
      </SideBySide>
    </PageSection>
  );
}

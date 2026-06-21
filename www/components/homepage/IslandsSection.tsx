import Counter from "../../islands/Counter.tsx";
import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { DemoBox } from "../../components/homepage/DemoBox.tsx";
import { ExampleArrow } from "../../components/homepage/ExampleArrow.tsx";
import { FancyLink } from "../../components/FancyLink.tsx";

const islandCode = `import { useSignal } from "@preact/signals";

export default function Counter(props) {
  const count = useSignal(props.start);

  return (
    <div>
      <h3>Interactive island</h3>
      <p>The server supplied the initial value of {props.start}.</p>
      <div>
        <button onClick={() => count.value -= 1}>-</button>
        <div>{count}</div>
        <button onClick={() => count.value += 1}>+</button>
      </div>
    </div>
  );
}`;

export function IslandsSection() {
  return (
    <PageSection>
      <SideBySide mdColSplit="3/2" lgColSplit="3/2" reverseOnDesktop class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-beach text-fresh"
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
            <path d="M17.553 16.75a7.5 7.5 0 0 0 -10.606 0" />
            <path d="M18 3.804a6 6 0 0 0 -8.196 2.196l10.392 6a6 6 0 0 0 -2.196 -8.196z" />
            <path d="M16.732 10c1.658 -2.87 2.225 -5.644 1.268 -6.196c-.957 -.552 -3.075 1.326 -4.732 4.196" />
            <path d="M15 9l-3 5.196" />
            <path d="M3 19.25a2.4 2.4 0 0 1 1 -.25a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 1 .25" />
          </svg>
          <SectionHeading>Interactive where it matters</SectionHeading>
          <p>
            Most of your page is static HTML. Islands are the small, interactive parts that get
            hydrated with JavaScript. You choose exactly what runs on the client.
          </p>
          <p>
            Built on{" "}
            <a href="https://preactjs.com/" class="underline">
              Preact
            </a>{" "}
            and{" "}
            <a href="https://preactjs.com/guide/v10/signals/" class="underline">
              Signals
            </a>
            , so islands are tiny and reactive out of the box.
          </p>
          <FancyLink href="/docs/concepts/islands" class="mt-2">
            Learn more about islands
          </FancyLink>
        </div>
        <div class="flex flex-col gap-4 relative">
          <CodeWindow name="islands/Counter.tsx">
            <CodeBlock code={islandCode} lang="jsx" />
          </CodeWindow>
          <ExampleArrow class="[transform:rotateY(-180deg)]" />
          <DemoBox flip>
            <Counter start={3} />
          </DemoBox>
        </div>
      </SideBySide>
    </PageSection>
  );
}

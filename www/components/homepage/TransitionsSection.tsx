import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { FancyLink } from "../../components/FancyLink.tsx";

const transitionCode = `import { App } from "fresh";

const app = new App({
  // Enable the View Transitions API
  // for smooth client-side navigation
  viewTransition: true,
});

app.listen();`;

const cssCode = `/* Style your transitions with CSS */
::view-transition-old(root) {
  animation: fade-out 0.2s ease-in;
}
::view-transition-new(root) {
  animation: fade-in 0.2s ease-out;
}`;

export function TransitionsSection() {
  return (
    <PageSection>
      <SideBySide mdColSplit="2/3" lgColSplit="2/3" class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-transition-right text-fresh"
            width="2.5rem"
            height="2.5rem"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <title>View Transitions icon</title>
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M18 3a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12z" />
            <path d="M9 12h6" />
            <path d="M13 8l4 4l-4 4" />
          </svg>
          <SectionHeading>Smooth View Transitions</SectionHeading>
          <p>
            Fresh supports the{" "}
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API"
              class="underline"
            >
              View Transitions API
            </a>{" "}
            out of the box, giving your app native-feeling page transitions with a single config
            flag.
          </p>
          <p>
            Pages crossfade automatically. Customize animations per-element with plain CSS — no
            JavaScript animation libraries needed.
          </p>
          <FancyLink href="/docs/advanced/view-transitions" class="mt-2">
            Learn about View Transitions
          </FancyLink>
        </div>
        <div class="flex flex-col gap-4">
          <CodeWindow name="main.ts">
            <CodeBlock code={transitionCode} lang="js" />
          </CodeWindow>
          <CodeWindow name="styles.css">
            <CodeBlock code={cssCode} lang="js" />
          </CodeWindow>
        </div>
      </SideBySide>
    </PageSection>
  );
}

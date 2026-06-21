import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { FancyLink } from "../../components/FancyLink.tsx";

const otelCode = `import { App } from "fresh";

// When OpenTelemetry is active, Fresh
// auto-injects a <meta name="traceparent">
// tag — connecting browser traces to
// server spans, zero config required
const app = new App();

app.listen();`;

export function SecuritySection() {
  return (
    <PageSection>
      <SideBySide mdColSplit="2/3" lgColSplit="2/3" class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-telescope text-fresh"
            width="2.5rem"
            height="2.5rem"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <title>Observability icon</title>
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M6 21l6 -5l6 5" />
            <path d="M12 13v8" />
            <path d="M3.294 13.678l.166 .281c.52 .88 1.624 1.265 2.605 .91l14.242 -5.165a1.023 1.023 0 0 0 .565 -1.456l-2.62 -4.705a1.024 1.024 0 0 0 -1.462 -.394l-13.397 7.719c-1.038 .598 -1.272 1.783 -.594 2.692" />
            <path d="M8 11.5l5.5 -3.2" />
            <path d="M12.602 8.3l-2.552 4.6" />
          </svg>
          <SectionHeading>OpenTelemetry, built in</SectionHeading>
          <p>
            When OpenTelemetry is active, Fresh automatically injects a{" "}
            <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">traceparent</code>{" "}
            meta tag into every page — connecting your browser traces to server spans end-to-end,
            zero config required.
          </p>
          <p>
            Get full-stack observability across your entire request lifecycle with zero
            configuration.
          </p>
          <FancyLink href="/docs/advanced/opentelemetry" class="mt-2">
            Learn about OpenTelemetry
          </FancyLink>
        </div>
        <div class="flex flex-col gap-6">
          <CodeWindow name="main.ts">
            <CodeBlock code={otelCode} lang="js" />
          </CodeWindow>
        </div>
      </SideBySide>
    </PageSection>
  );
}

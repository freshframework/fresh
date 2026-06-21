import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { FancyLink } from "../../components/FancyLink.tsx";

const headCode = `import { Head } from "fresh/runtime";

export default function MyPage() {
  return (
    <>
      <Head>
        <title>My Page</title>
        <meta name="description" content="..." />
        <link rel="stylesheet" href="/styles.css" />
      </Head>
      <h1>Hello, world!</h1>
    </>
  );
}`;

export function HeadSection() {
  return (
    <PageSection>
      <SideBySide mdColSplit="3/2" lgColSplit="3/2" reverseOnDesktop class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-file-code text-fresh"
            width="2.5rem"
            height="2.5rem"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <title>Head element icon</title>
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
            <path d="M10 13l-1 2l1 2" />
            <path d="M14 13l1 2l-1 2" />
          </svg>
          <SectionHeading>
            Full control of{" "}
            <span
              // deno-lint-ignore react-no-danger
              dangerouslySetInnerHTML={{ __html: "&lt;head&gt;" }}
            />
          </SectionHeading>
          <p>
            Use the{" "}
            <code
              class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono"
              // deno-lint-ignore react-no-danger
              dangerouslySetInnerHTML={{ __html: "&lt;Head&gt;" }}
            />{" "}
            component from any page or island to set titles, meta tags, stylesheets, and scripts —
            no hoisting hacks or side channels needed.
          </p>
          <FancyLink href="/docs/advanced/head" class="mt-2">
            <span
              // deno-lint-ignore react-no-danger
              dangerouslySetInnerHTML={{ __html: "Learn about &lt;Head&gt;" }}
            />
          </FancyLink>
        </div>
        <div class="flex flex-col gap-4">
          <CodeWindow name="routes/my-page.tsx">
            <CodeBlock code={headCode} lang="jsx" />
          </CodeWindow>
        </div>
      </SideBySide>
    </PageSection>
  );
}

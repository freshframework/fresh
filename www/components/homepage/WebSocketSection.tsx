import { CodeBlock } from "../../components/CodeBlock.tsx";
import { CodeWindow } from "../../components/CodeWindow.tsx";
import { PageSection } from "../../components/PageSection.tsx";
import { SideBySide } from "../../components/SideBySide.tsx";
import { SectionHeading } from "../../components/homepage/SectionHeading.tsx";
import { FancyLink } from "../../components/FancyLink.tsx";

const wsCode = `import { App } from "fresh";

const app = new App();

app.ws("/chat", {
  open(socket) {
    console.log("Client connected");
  },
  message(socket, event) {
    // Echo the message back
    socket.send(\`You said: \${event.data}\`);
  },
  close(socket) {
    console.log("Client disconnected");
  },
});

app.listen();`;

export function WebSocketSection() {
  return (
    <PageSection>
      <SideBySide mdColSplit="2/3" lgColSplit="2/3" class="!items-start">
        <div class="flex flex-col gap-4 md:sticky md:top-4">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            class="icon icon-tabler icon-tabler-arrows-exchange text-fresh"
            width="2.5rem"
            height="2.5rem"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <title>WebSocket icon</title>
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M7 10h14l-4 -4" />
            <path d="M17 14h-14l4 4" />
          </svg>
          <SectionHeading>First-class WebSockets</SectionHeading>
          <p>
            Add real-time endpoints with{" "}
            <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">app.ws()</code> —
            define open, message, and close handlers in a single object. Build chat, live
            dashboards, or collaborative editing without leaving Fresh.
          </p>
          <FancyLink href="/docs/advanced/websockets" class="mt-2">
            Learn about WebSockets
          </FancyLink>
        </div>
        <div class="flex flex-col gap-4">
          <CodeWindow name="main.ts">
            <CodeBlock code={wsCode} lang="js" />
          </CodeWindow>
        </div>
      </SideBySide>
    </PageSection>
  );
}

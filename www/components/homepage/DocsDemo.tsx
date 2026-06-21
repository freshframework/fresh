import { Partial } from "fresh/runtime";

const TOPICS: Record<string, { title: string; body: string }> = {
  introduction: {
    title: "Introduction",
    body: "Fresh is a small, fast, full-stack web framework for Preact, built on Vite. Routes render on the server, and islands hydrate the parts that need to be interactive.",
  },
  routing: {
    title: "Routing",
    body: "Every file in routes/ is a URL. Bracket segments capture dynamic parameters, and folder names shape the URL exactly as you'd expect.",
  },
  islands: {
    title: "Islands",
    body: "Drop a component in islands/ and Fresh hydrates just that subtree on the client. Everything around it stays static HTML, so no JavaScript is shipped for it.",
  },
};

export const DocsDemo = ({ topic }: { topic: string | null }) => {
  const selected = topic ? TOPICS[topic] : null;
  return (
    <div
      f-client-nav
      class="w-full grid grid-cols-1 md:grid-cols-[auto_1fr] text-left gap-6 items-stretch min-h-40"
    >
      <aside class="flex flex-col gap-2 p-6 pl-0 border-b md:border-r md:border-b-0 border-current text-left items-start justify-center">
        <a href="/?topic=introduction#partials" class="underline">
          Introduction
        </a>
        <a href="/?topic=routing#partials" class="underline">
          Routing
        </a>
        <a href="/?topic=islands#partials" class="underline">
          Islands
        </a>
      </aside>
      <main class="w-full flex flex-col justify-center">
        <Partial name="content">
          {selected ? (
            <>
              <h2 class="mb-2 font-extrabold">{selected.title}</h2>
              <p>{selected.body}</p>
            </>
          ) : (
            <p>Pick a topic from the menu.</p>
          )}
        </Partial>
      </main>
    </div>
  );
};

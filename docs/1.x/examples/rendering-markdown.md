---
description: |
  How to render markdown on your Fresh site.
---

What if you want to render some markdown on your site? There are a few
possibilities:

1. the markdown is coming from a remote source
2. the markdown is defined in a string
3. the markdown is on a file

The following file uses
[dynamic routing](https://usefresh.dev/docs/getting-started/dynamic-routes) to
handle the three cases. It's assumed this file is called `[slug].tsx`:

```ts routes/[slug].tsx
import { Handlers, PageProps } from "$fresh/server.ts";
import { extract } from "$std/front_matter/yaml.ts";
import { CSS, render } from "$gfm";
import { Head } from "$fresh/runtime.ts";

interface Page {
  markdown: string;
  data: Record<string, unknown>;
}

export const handler: Handlers<Page> = {
  async GET(_req, ctx) {
    let rawMarkdown = "";
    if (ctx.params.slug === "remote") {
      const resp = await fetch(
        `https://raw.githubusercontent.com/denoland/fresh/main/docs/latest/introduction/index.md`,
      );
      if (resp.status !== 200) {
        return ctx.render(undefined);
      }
      rawMarkdown = await resp.text();
    } else if (ctx.params.slug === "string") {
      rawMarkdown = `---
description: test
---

## big text

Look, it's working. _This is in italics._
      
      `;
    } else if (ctx.params.slug === "file") {
      rawMarkdown = await Deno.readTextFile("text.md");
    } else {
      return ctx.render(undefined);
    }
    const { attrs, body } = extract(rawMarkdown);
    return ctx.render({ markdown: body, data: attrs });
  },
};

export default function MarkdownPage({ data }: PageProps<Page | null>) {
  if (!data) {
    return <h1>File not found.</h1>;
  }

  return (
    <>
      <Head>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </Head>
      <main>
        <div>{JSON.stringify(data.data)}</div>
        <div
          class="markdown-body"
          dangerouslySetInnerHTML={{ __html: render(data?.markdown) }}
        />
      </main>
    </>
  );
}
```

The contents of the `text.md` file are the following:

```md text.md
---
description: testFromText
---

# Really Big Text

**bold**
```

You'll also need to import the `Github Flavored Markdown` module:

```sh Terminal
deno add jsr:@deno/gfm
```

Andy has a helpful [post](https://deno.com/blog/build-a-blog-with-fresh) on the
Deno Blog which goes into a slightly more realistic example.

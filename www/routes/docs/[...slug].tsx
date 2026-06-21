import { handler, page as definePage } from "./$[...slug].ts";
import { Partial } from "fresh/runtime";
import { HttpError } from "fresh/errors";
import { Seo } from "../../components/Seo.tsx";
import { SidebarCategory } from "../../components/DocsSidebar.tsx";
import Footer from "../../components/Footer.tsx";
import Header from "../../components/Header.tsx";
import * as Icons from "../../components/Icons.tsx";
import {
  CATEGORIES,
  getFirstPageUrl,
  LATEST_VERSION,
  TABLE_OF_CONTENTS,
  type TableOfContentsEntry,
} from "../../data/docs.ts";
import { frontMatter, parsePmCookie, type PmName, renderMarkdown } from "../../utils/markdown.ts";
import toc from "../../docs/toc.ts";
import { TableOfContents } from "../../islands/TableOfContents.tsx";
import SearchButton from "../../islands/SearchButton.tsx";
import VersionSelect from "../../islands/VersionSelect.tsx";

/**
 * Every docs markdown file, bundled at build time via Vite's glob import.
 * Keyed by `/docs/<version>/<path>.md`; each value lazily yields the raw text.
 */
const DOCS = import.meta.glob<string>("/docs/**/*.md", {
  query: "?raw",
  import: "default",
});

interface Data {
  page: Page;
  activePm: PmName;
}

interface NavEntry {
  title: string;
  category?: string;
  href: string;
}

export interface VersionLink {
  label: string;
  href: string;
  value: string;
}

interface Page extends TableOfContentsEntry {
  markdown: string;
  data: Record<string, unknown>;
  versionLinks: VersionLink[];
  version: string;
  prevNav?: NavEntry;
  nextNav?: NavEntry;
}

const pattern = new URLPattern({ pathname: "/:version/:page*" });

export const handlers = handler({
  async GET(ctx): Promise<{ data: Data } | Response> {
    let slug = ctx.params.slug;

    // `/docs/<path>.md` serves the raw markdown source for that page.
    const rawMarkdown = slug.endsWith(".md");
    if (rawMarkdown) slug = slug.slice(0, -3);

    // Check if the slug is the index page of a version tag
    if (TABLE_OF_CONTENTS[slug]) {
      return ctx.redirect(getFirstPageUrl(slug), 307);
    }

    const match = pattern.exec("https://localhost/" + slug);
    if (!match) {
      throw new HttpError(404);
    }

    let { version, page: path = "" } = match.pathname.groups;
    if (!version) {
      throw new HttpError(404);
    }

    // Latest version doesn't show up in the url
    if (!TABLE_OF_CONTENTS[version]) {
      path = version + (path ? "/" + path : "");
      version = LATEST_VERSION;
    }

    // Check if the page exists
    const currentToc = TABLE_OF_CONTENTS[version];
    const entry = currentToc[path];
    if (!entry) {
      throw new HttpError(404);
    }

    // Build up the link map for the version selector.
    const versionLinks: VersionLink[] = [];
    for (const v in TABLE_OF_CONTENTS) {
      const label = toc[v].label;
      const maybeEntry = TABLE_OF_CONTENTS[v][path];

      // Check if the same page is available for this version and
      // link to that. Pick the index page for that version if an
      // exact match doesn't exist.
      versionLinks.push({
        label,
        value: v,
        href: maybeEntry ? maybeEntry.href : getFirstPageUrl(v),
      });
    }

    // Add previous and next page entry if available

    const entryKeys = Object.keys(currentToc);
    const idx = entryKeys.findIndex((name) => name === entry.slug);

    let nextNav: NavEntry | undefined;
    let prevNav: NavEntry | undefined;
    const prevEntry = currentToc[entryKeys[idx - 1]];
    const nextEntry = currentToc[entryKeys[idx + 1]];

    if (prevEntry) {
      let category = prevEntry.category;
      category = category ? currentToc[category].title : "";
      prevNav = { title: prevEntry.title, category, href: prevEntry.href };
    }

    if (nextEntry) {
      let category = nextEntry.category;
      category = category ? currentToc[category].title : "";
      nextNav = { title: nextEntry.title, category, href: nextEntry.href };
    }

    // Load the markdown file (bundled via the `DOCS` glob) and parse front matter.
    const loadMarkdown = DOCS["/" + entry.file];
    if (!loadMarkdown) {
      throw new HttpError(404);
    }
    const fileContent = await loadMarkdown();
    const { body, attrs } = frontMatter<Record<string, unknown>>(fileContent);

    if (rawMarkdown) {
      return new Response(body, {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }

    return {
      data: {
        page: {
          ...entry,
          markdown: body,
          data: attrs ?? {},
          versionLinks,
          version,
          prevNav,
          nextNav,
        },
        activePm: parsePmCookie(ctx.req.headers.get("cookie")),
      },
    };
  },
});

export default definePage(function DocsPage(props) {
  // `props.data` infers to `never` because the handler can also return a
  // redirect `Response` (Fresh's `InferData` only resolves a pure data result);
  // at render time the data is always `Data`, so assert that here.
  const { page, activePm } = props.data as Data;
  const { html, headings } = renderMarkdown(page.markdown, { activePm });

  return (
    <div class="flex flex-col min-h-screen mx-auto max-w-screen-2xl">
      <Seo
        url={props.url}
        title={`${page.title ?? "Not Found"} | Fresh docs`}
        description={page.data.description ? String(page.data.description) : "Fresh Document"}
        ogImage={new URL("/og-image.webp", props.url).href}
      />
      <Header title="docs" active="/docs" />
      <div f-client-nav>
        <MobileSidebar page={page} />
        <div class="flex mx-auto max-w-screen-2xl px-0 md:px-4 md:py-0 justify-start bg-background-secondary">
          <label
            for="docs_sidebar"
            class="px-4 py-3 lg:hidden flex items-center  rounded-sm gap-2 cursor-pointer"
          >
            <svg class="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h7"
              ></path>
            </svg>
            <div>Table of Contents</div>
          </label>
        </div>
        <nav class="flex-shrink-0 hidden lg:block lg:px-4 bg-white">
          <div class="fixed top-24 w-[17rem] flex overflow-hidden text-base">
            <div class="flex-1 h-[calc(100vh_-_6rem)] overflow-y-auto pb-8">
              <SearchButton class="mr-4 sm:mr-0" />
              <div class="mb-4 px-1">
                <VersionSelect selectedVersion={page.version} versions={page.versionLinks} />
              </div>
              <ul class="list-inside font-semibold nested ml-2.5">
                {CATEGORIES[page.version].map((category) => (
                  <SidebarCategory key={category.href} category={category} />
                ))}
              </ul>
            </div>
          </div>
        </nav>
        <Partial name="docs-main">
          <div class="w-full min-w-0">
            <main class="lg:ml-[18rem] mt-4 min-w-0 mx-auto">
              <div class="flex gap-6 md:gap-8 xl:gap-[8%] flex-col xl:flex-row md:mx-8 lg:mx-16 2xl:mx-0 lg:justify-end">
                <TableOfContents headings={headings} />

                <div class="lg:order-1 min-w-0 max-w-3xl w-full">
                  <h1 class="text-4xl text-foreground-primary tracking-tight font-bold md:mt-0 px-4 md:px-0 mb-4">
                    {page.title}
                  </h1>
                  <div
                    class="markdown-body mb-8"
                    // deno-lint-ignore react-no-danger
                    dangerouslySetInnerHTML={{ __html: html }}
                  />

                  <div class="mb-8">
                    <ForwardBackButtons
                      slug={page.slug}
                      version={page.version}
                      prev={page.prevNav}
                      next={page.nextNav}
                    />
                  </div>
                  <hr />
                  <div class="px-4 md:px-0 flex flex-wrap gap-3 justify-between my-6">
                    <a
                      href={`https://github.com/denoland/fresh/edit/main/${page.file}`}
                      class="text-gray-700 dark:text-gray-200 text-md flex items-center bg-[#ebedf0] dark:bg-[#2c2d39] px-4 py-2 rounded-sm hover:bg-gray-200 dark:hover:bg-[#36394c] transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span class="mr-2 inline-flex">Edit this page</span>
                      <Icons.GitHub />
                    </a>
                    <a
                      href={`${props.url.pathname}.md`}
                      class="text-gray-700 dark:text-gray-200 text-md flex items-center bg-[#ebedf0] dark:bg-[#2c2d39] px-4 py-2 rounded-sm hover:bg-gray-200 dark:hover:bg-[#36394c] transition-colors"
                    >
                      View as Markdown
                    </a>
                  </div>
                </div>
              </div>
              <div class="xl:ml-[3.75rem]">
                <Footer />
              </div>
            </main>
          </div>
        </Partial>
      </div>
    </div>
  );
});

function MobileSidebar({ page }: { page: Page }) {
  return (
    <div class="lg:hidden">
      <input type="checkbox" class="hidden toggle" id="docs_sidebar" autocomplete="off" />
      <div class="fixed inset-0 flex z-50 hidden toggled">
        <label class="absolute inset-0 bg-gray-600 opacity-75" for="docs_sidebar" />
        <div class="relative flex-1 flex flex-col w-[18rem] h-full bg-background-primary border-r-2 border-foreground-secondary">
          <nav class="pt-0 pb-16 overflow-x-auto">
            <div class="flex-1 h-screen overflow-y-auto pt-4 px-4">
              <SearchButton class="mr-4 sm:mr-0" />
              <div class="mb-4">
                <VersionSelect selectedVersion={page.version} versions={page.versionLinks} />
              </div>
              <ul class="list-inside font-semibold nested ml-2.5">
                {CATEGORIES[page.version].map((category) => (
                  <SidebarCategory key={category.href} category={category} />
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

function ForwardBackButtons(props: {
  slug: string;
  version: string;
  prev?: NavEntry;
  next?: NavEntry;
}) {
  const { prev, next } = props;

  return (
    <div class="px-4 md:px-0 mt-8 flex flex-col sm:flex-row gap-4 justify-between">
      {prev ? (
        <a
          href={prev.href}
          class="px-4 py-2 text-left rounded-sm border border-foreground-secondary/20 grid border-solid w-full hover:border-green-600 transition-colors"
        >
          <span class="text-sm text-gray-600 dark:text-gray-500">Previous page</span>
          <span class="text-green-600 dark:text-green-400 font-medium">{prev.title}</span>
        </a>
      ) : (
        <div class="w-full" />
      )}
      {next ? (
        <a
          href={next.href}
          class="px-4 py-2 text-left rounded-sm border border-foreground-secondary/20 grid border-solid w-full hover:border-green-600 transition-colors"
        >
          <span class="text-sm text-gray-600 dark:text-gray-500">Next page</span>
          <span class="text-green-600 dark:text-green-400 font-medium">{next.title}</span>
        </a>
      ) : (
        <div class="w-full" />
      )}
    </div>
  );
}

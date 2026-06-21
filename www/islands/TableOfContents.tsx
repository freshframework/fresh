import { useEffect, useRef } from "preact/hooks";
import type { MarkdownHeading } from "../utils/markdown.ts";
import { useSignal } from "@preact/signals";

export interface TableOfContentsProps {
  headings: MarkdownHeading[];
}

function setActiveLink(container: HTMLElement, marker: HTMLElement, id: string) {
  container.querySelectorAll(`a`).forEach((link) => link.classList.remove("active"));
  const tocLink = container.querySelector(`a[href="#${id}"]`) as HTMLElement;

  if (tocLink === null) return;

  tocLink.classList.add("active");

  const rect = tocLink.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();

  const top = tocLink.offsetTop + rect.height / 2 - markerRect.height / 2;
  marker.style.cssText = `transform: translate3d(0, ${top}px, 0); opacity: 1`;
}

function hLevelToClass(level: number): string {
  if (level === 3) return "ml-4";
  if (level === 4) return "ml-8";
  return "";
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const refMarker = useRef<HTMLDivElement>(null);
  const isOpen = useSignal(false);

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;

    const activeList = Array.from({ length: headings.length }, () => false);
    const visibleList = Array.from({ length: headings.length }, () => false);

    const marker = refMarker.current!;
    const observer = new IntersectionObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const target = entry.target;

        for (let j = 0; j < headings.length; j++) {
          const heading = headings[j];
          if (heading.id === target.id) {
            const active = entry.isIntersecting || entry.boundingClientRect.top < 0;
            activeList[j] = active;
            visibleList[j] = entry.isIntersecting;
          }
        }
      }

      // Reset links
      for (let i = 0; i < headings.length; i++) {
        const id = headings[i].id;
        const tocLink = container.querySelector(`a[href="#${id}"]`);
        if (tocLink !== null) {
          tocLink.classList.remove("active");
        }
      }

      let activeIdx = visibleList.indexOf(true);
      if (activeIdx < 0) {
        activeIdx = activeList.lastIndexOf(true);
      }

      if (activeIdx > -1) {
        const id = headings[activeIdx].id;
        setActiveLink(container, marker, id);
      } else {
        marker.style.cssText = `transform: translate3d(0, 0, 0); opacity: 0`;
      }
    });

    document
      .querySelectorAll(
        ".markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6",
      )
      .forEach((elem) => {
        observer.observe(elem);
      });

    return () => {
      observer.disconnect();
    };
  }, [headings]);

  return (
    <div ref={ref} class="relative xl:order-2 w-56 xl:max-w-xs xl:top-14 shrink-0">
      {headings.length > 0 && (
        <>
          <div class="xl:hidden mx-4 md:mx-0 mt-4 md:mt-0">
            <button
              type="button"
              id="toc-outline-btn"
              onClick={() => (isOpen.value = !isOpen.value)}
              class="bg-background-primary py-2 px-4 rounded-sm border border-foreground-secondary/30 flex items-center hover:border-fresh-green/80 transition-colors text-sm"
            >
              On this page
              <svg
                class={`w-4 h-4 inline-block ml-2 -rotate-90 [&.active]:rotate-0 ${
                  isOpen ? "active" : ""
                }`}
              >
                <use href="/icons.svg#arrow-down" />
              </svg>
            </button>
            {isOpen.value && (
              <div class="mt-2 pl-4 border-l border-foreground-primary/20 text-[13px] leading-7">
                <nav aria-labelledby="toc-outline-btn">
                  <ul>
                    {headings.map((heading) => {
                      return (
                        <li key={heading.id}>
                          <a
                            href={`#${heading.id}`}
                            class={`block ${hLevelToClass(
                              heading.level,
                            )} truncate text-gray-600 dark:text-gray-400`}
                            // deno-lint-ignore react-no-danger
                            dangerouslySetInnerHTML={{ __html: heading.html }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
            )}
          </div>
          <div class="hidden xl:block xl:sticky xl:top-40">
            <div class="relative">
              <div
                ref={refMarker}
                class="marker w-[2px] bg-green-400 h-5 absolute top-0 opacity-0 transition-all"
              />
              <div class="pl-4 border-l border-foreground-secondary/20 text-[13px] leading-7">
                <div role="heading" aria-level={2} class="font-semibold">
                  On this page
                </div>
                <nav aria-labelledby="doc-outline-aria-label">
                  <span id="doc-outline-aria-label" class="sr-only">
                    Table of Contents for current page
                  </span>
                  <ul>
                    {headings.map((heading) => {
                      return (
                        <li key={heading.id}>
                          <a
                            href={`#${heading.id}`}
                            class={`block truncate transition-colors ${hLevelToClass(
                              heading.level,
                            )} text-gray-600 dark:text-gray-400 [&.active]:text-green-600 dark:[&.active]:text-green-300`}
                            onClick={() => {
                              setActiveLink(ref.current!, refMarker.current!, heading.id);
                            }}
                            // deno-lint-ignore react-no-danger
                            dangerouslySetInnerHTML={{ __html: heading.html }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

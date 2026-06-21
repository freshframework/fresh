import type { TableOfContentsCategory, TableOfContentsCategoryEntry } from "../data/docs.ts";

export function SidebarCategory(props: { category: TableOfContentsCategory }) {
  const { title, href, entries } = props.category;

  return (
    <li class="my-2 block">
      <a
        href={href}
        class="text-foreground-secondary hover:text-gray-600 dark:hover:text-green-300 aria-[current]:text-fresh-green dark:aria-[current]:text-green-300 aria-[current]:hover:underline font-bold"
      >
        {title}
      </a>
      {entries.length > 0 && (
        <ul class="py-2 nested list-outside">
          {entries.map((entry) => (
            <SidebarEntry key={entry.href} entry={entry} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarEntry(props: { entry: TableOfContentsCategoryEntry }) {
  const { title, href } = props.entry;

  return (
    <li class="py-[1px]">
      <a
        href={href}
        class="aria-[current]:text-fresh-green aria-[current]:border-green-600 dark:aria-[current]:text-green-300 aria-[current]:bg-fresh-green/5 dark:hover:text-green-300 border-l-4 border-transparent px-4 py-0.5 transition-colors hover:text-fresh-green/80 font-normal block"
      >
        {title}
      </a>
    </li>
  );
}

import toc from "../docs/toc.ts";

export interface TableOfContentsEntry {
  slug: string;
  title: string;
  category?: string;
  href: string;
  file: string;
}

export interface TableOfContentsCategory {
  title: string;
  href: string;
  entries: TableOfContentsCategoryEntry[];
}

export interface TableOfContentsCategoryEntry {
  title: string;
  href: string;
}

export const TABLE_OF_CONTENTS: Record<string, Record<string, TableOfContentsEntry>> = {};
export const CATEGORIES: Record<string, TableOfContentsCategory[]> = {};

export const VERSIONS = Object.keys(toc);
export const LATEST_VERSION = VERSIONS[0] ?? "";

for (const version in toc) {
  const RAW_VERSION = toc[version];
  const versionSlug = version === LATEST_VERSION ? "" : `/${version}`;
  TABLE_OF_CONTENTS[version] = {};
  CATEGORIES[version] = [];

  for (const parent in RAW_VERSION.content) {
    const rawEntry = RAW_VERSION.content[parent];

    // A `link` lets a version reuse another version's files (e.g. the
    // `latest` entries point their files at `docs/latest/...`), so we don't
    // have to copy and backport documentation content across versions.
    const fileVersion = rawEntry.link ?? version;
    const versionFilePath = fileVersion === LATEST_VERSION ? "/latest" : `/${fileVersion}`;

    const href = `/docs${versionSlug}/${parent}`;
    const file = `docs${versionFilePath}/${parent}/index.md`;

    const entry = {
      slug: parent,
      title: rawEntry.title,
      href,
      file,
    };
    TABLE_OF_CONTENTS[version][parent] = entry;
    const category: TableOfContentsCategory = {
      title: rawEntry.title,
      href,
      entries: [],
    };
    CATEGORIES[version].push(category);
    if (rawEntry.pages) {
      for (const [id, title, linkedVersion] of rawEntry.pages) {
        const slug = `${parent}/${id}`;

        // Allow stacked documentation
        const pageVersion = linkedVersion ? linkedVersion.slice("link:".length) : version;
        const versionFilePath =
          !pageVersion || pageVersion === LATEST_VERSION ? "/latest" : `/${pageVersion}`;

        const href = `/docs${versionSlug}/${slug}`;

        const file = `docs${versionFilePath}/${slug}.md`;
        const entry = { slug, title, category: parent, href, file };
        TABLE_OF_CONTENTS[version][slug] = entry;
        category.entries.push({
          title,
          href,
        });
      }
    }
  }
}

export function getFirstPageUrl(version: string) {
  const group = TABLE_OF_CONTENTS[version];
  if (group) {
    for (const slug in group) {
      return group[slug].href;
    }
  }

  throw new Error(`Could not find version "${version}"`);
}

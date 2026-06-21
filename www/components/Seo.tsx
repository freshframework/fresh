import { Head } from "fresh/runtime";

export interface SeoProps {
  /** Document title + `og:title`. */
  title?: string;
  /** Meta description + `og:description`. */
  description?: string;
  /** Absolute `og:image` URL. */
  ogImage?: string;
  /** The current request URL, used for `og:url`. */
  url: URL;
  /** When true, emit `<meta name="robots" content="noindex">`. */
  noIndex?: boolean;
}

/**
 * Per-route SEO metadata, hoisted into the document `<head>` via `<Head>`.
 *
 * In Fresh 3 the `_app` wrapper only receives `children` (no per-request
 * state or URL), so page-specific `<title>`/`<meta>` tags live here and are
 * rendered from within the page/layout that knows the values.
 */
export function Seo({ title, description, ogImage, url, noIndex }: SeoProps) {
  return (
    <Head>
      {title ? <title>{title}</title> : null}
      {description ? <meta name="description" content={description} /> : null}
      {title ? <meta property="og:title" content={title} /> : null}
      {description ? <meta property="og:description" content={description} /> : null}
      <meta property="og:url" content={url.href} />
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}
      {noIndex ? <meta name="robots" content="noindex" /> : null}
    </Head>
  );
}

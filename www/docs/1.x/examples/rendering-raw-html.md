---
description: |
  How to render raw HTML in Fresh.
---

Text content in Fresh is always escaped, whether serverside rendered or rendered
in islands. While this generally desired, it can create issues in certain
situations.

## Warning

The TL;DR is to use Preact's `dangerouslySetInnerHTML`. As the name implies, it
should not be used lightly.

Setting arbitrary HTML can be dangerous. Make sure you trust the source.
Rendering user-supplied HTML to the DOM makes your site vulnerable to cross-
site scripting. The markup must first be sanitizied, or better yet, something
you trust.

## Example: Rendering JSON-LD

Suppose we need to add some microdata markup to a page. The following will
result in **escaped characters, and will not work**:

```tsx components/json-ld.tsx
const json = `
{
  "@context": "http://schema.org",
  "@type": "PostalAddress",
  "streetAddress": "8888 University Drive",
  "addressLocality": "Burnaby",
  "addressRegion": "British Columbia"
}
`;

export default function JsonLd() {
  return <script type="application/ld+json">{json}</script>;
}
```

Instead, we can use `dangerouslySetInnerHTML`:

```tsx components/json-ld.tsx
export default function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
```

## Another example: Code highlighting

Syntax highlighters parse strings into HTML tags, allowing them to be
individually styled with CSS. We can build a simple Preact syntax highlighter
like so:

```tsx components/code.tsx
import Prism from "https://esm.sh/prismjs@1.29.0";

interface Props {
  code: string;
  lang: string;
}

export default function Code({ code, lang }: Props) {
  const parsed = Prism.highlight(code, Prism.languages[lang], lang);

  return (
    <pre data-lang={lang} className={`language-${lang}`}>
      <code
        dangerouslySetInnerHTML={{
          __html: parsed,
        }}
      />
    </pre>
  );
}
```

Of course, we will also have to add some CSS to make this look nice.

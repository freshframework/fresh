---
description: |
  How to render raw HTML in Fresh.
---

Text content in Fresh is always escaped, whether serverside rendered or rendered
in [islands](/docs/concepts/islands). While this is generally desired, it can
create issues in certain situations.

To address this you can render raw HTML via Preact's `dangerouslySetInnerHTML`
prop:

```tsx routes/dynamic-html.tsx
<div dangerouslySetInnerHTML={{ __html: "<h1>This is raw HTML</h1>" }} />;
```

This will output:

```html Response body
<div>
  <h1>This is raw HTML</h1>
</div>
```

A common use case for rendering raw HTML is syntax highlighting code blocks or
rendering markdown.

> [warn]: Setting arbitrary HTML can be dangerous, hence the
> `dangerouslySetInnerHTML` naming. Make sure you trust the source. Rendering
> user-supplied HTML to the DOM makes your site vulnerable to cross-site
> scripting. The markup must first be sanitized, or better yet, something you
> trust.

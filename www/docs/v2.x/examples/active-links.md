---
description: |
  Style active links with ease in Fresh
---

Fresh automatically enhances the accessibility of `<a>` elements by adding the
aria-current attribute when rendering links that match the current URL. This
attribute is recognized by assistive technologies and clearly indicates the
current page within a set of pages.

- `aria-current="page"` - Added to links with an exact path match, enhancing
  accessibility by indicating the current page to assistive technologies.
- `aria-current="true"` - Added to ancestor links (e.g. `/docs` when the current
  page is `/docs/intro`).

As we aim to improve accessibility, we encourage the use of aria-current for
styling current links where applicable.

### Query parameters

When a link's `href` includes query parameters, Fresh considers them during
matching. A link to `/products?sort=name` will only receive
`aria-current="page"` when the current URL also has `?sort=name`. If the query
parameters differ, the link is treated as an ancestor instead. Links without
query parameters in their `href` match regardless of the current URL's query
string.

### Preserving custom `aria-current`

If you set `aria-current` on an `<a>` element yourself, Fresh will leave it
untouched. This is useful when integrating with component libraries (e.g.
daisyUI tabs) that manage their own active state.

## Styling with CSS

The aria-current attribute is easily styled with CSS using attribute selectors,
providing a native way to visually differentiate the active link.

```css static/styles.css
/* Give links pointing to the current page a green color */
a[aria-current="page"] {
  color: green;
}

/* Color all ancestor links of the current page */
a[aria-current="true"] {
  color: peachpuff;
}
```

## Tailwindcss

In Tailwindcss or similar CSS frameworks, you can apply styles to elements with
the `aria-current` attribute using bracket notation in your class definitions.
For Tailwindcss, use the syntax:

```tsx components/Menu.tsx
function Menu() {
  return (
    <a href="/foo" class="aria-[current]:text-green-600">
      Link to some page
    </a>
  );
}
```

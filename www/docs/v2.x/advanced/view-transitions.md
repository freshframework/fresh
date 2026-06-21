---
description: Animate page navigations with the View Transitions API
---

Fresh integrates the browser's native
[View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
into its [partials](/docs/advanced/partials) system. When enabled, DOM updates
during client-side navigation are wrapped in `document.startViewTransition()`,
giving you smooth animated transitions between pages with zero JavaScript
animation code.

This is progressive enhancement -- if the browser doesn't support the View
Transitions API, partials work exactly as before with no animation.

## Enabling view transitions

Add the `f-view-transition` attribute alongside `f-client-nav`:

```tsx routes/_app.tsx
export default function App({ Component }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
      </head>
      <body f-client-nav f-view-transition>
        <Component />
      </body>
    </html>
  );
}
```

All partial navigations (link clicks, form submissions, back/forward) will now
be animated.

## Customizing animations

The default view transition is a cross-fade. Customize it with standard CSS
using the `::view-transition-old` and `::view-transition-new` pseudo-elements:

```css static/styles.css
::view-transition-old(root) {
  animation: fade-out 0.2s ease-in;
}
::view-transition-new(root) {
  animation: fade-in 0.2s ease-out;
}
```

### Per-element transitions

Assign a `view-transition-name` in CSS to animate specific elements
independently from the rest of the page:

```css static/styles.css
.sidebar {
  view-transition-name: sidebar;
}
.main-content {
  view-transition-name: content;
}
```

Then target those named transitions:

```css static/styles.css
/* Sidebar stays in place */
::view-transition-old(sidebar),
::view-transition-new(sidebar) {
  animation: none;
}

/* Content slides */
::view-transition-old(content) {
  animation: slide-out-left 0.3s ease-in;
}
::view-transition-new(content) {
  animation: slide-in-right 0.3s ease-out;
}
```

This is useful for keeping persistent UI (navigation bars, sidebars) stable
while animating the main content area.

### Direction-aware animations

Since Fresh tracks navigation history, you can use CSS custom properties or
classes to apply different animations for forward vs. backward navigation. The
View Transitions API captures the old and new states automatically -- combine
this with `::view-transition-group` to create directional slide effects.

## Disabling view transitions

Disable view transitions on a subtree by setting `f-view-transition={false}`:

```tsx
<body f-client-nav f-view-transition={false}>
```

## Browser support

View Transitions are supported in Chrome 111+, Edge 111+, and Safari 18+.
Firefox support is in development. On unsupported browsers, navigations work
normally without animation -- no polyfill needed.

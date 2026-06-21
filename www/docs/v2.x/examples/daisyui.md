---
title: Install daisyUI for Deno Fresh
desc: How to install Tailwind CSS and daisyUI in a Deno Fresh project
---

[daisyUI](https://daisyui.com/) is a component library for
[Tailwind CSS](https://tailwindcss.com/) that provides semantic class names for
common UI components like buttons, cards, and modals. It makes building
beautiful interfaces faster while maintaining full Tailwind CSS compatibility.

## Installation

To get started with daisyUI, make sure you have Tailwind CSS enabled in your
Fresh project, then install daisyUI and update your configuration.

1. Run `deno i -D npm:daisyui@latest` to install daisyUI
2. Add daisyUI configuration in `./assets/styles.css`:

   ```diff assets/styles.css
     @import "tailwindcss";
   + @plugin "daisyui";
   ```

Now you're ready to use daisyUI.

## Using daisyUI Components

Create a button component in the `components` directory, using daisyUI's style
classes for reference.

```tsx components/Button.tsx
import type { ComponentChildren } from "preact";

export interface ButtonProps {
  id?: string;
  onClick?: () => void;
  children?: ComponentChildren;
  disabled?: boolean;
}

export function Button(props: ButtonProps) {
  return <button className="btn btn-dash btn-primary" {...props} />;
}
```

### Display Effect

![DaisyUI Showcase](/docs/fresh-daisyui-showcase.jpg)

### daisyUI Class Name Reference

For more components and usage, please refer to the
[daisyUI official documentation](https://daisyui.com/)

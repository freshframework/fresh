import type { ComponentChildren } from "preact";

export function SectionHeading({ children }: { children: ComponentChildren }) {
  return (
    <h2 class="text-2xl lg:text-3xl xl:text-4xl text-gray-600 font-[750] text-balance">
      {children}
    </h2>
  );
}

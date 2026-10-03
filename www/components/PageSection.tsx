import type { HTMLAttributes } from "preact";

export function PageSection(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      id={props.id ?? ""}
      class={`w-full max-w-screen-xl mx-auto my-12 md:my-16 lg:my-24 px-4 sm:px-8 lg:px-16 2xl:px-0 flex flex-col gap-6 md:gap-8 ${
        props.class ?? ""
      }`}
    >
      {props.children}
    </section>
  );
}

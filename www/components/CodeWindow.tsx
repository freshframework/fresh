import type { HTMLAttributes } from "preact";

interface CodeWindowProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
}

export function CodeWindow(props: CodeWindowProps) {
  return (
    <div
      {...props}
      class={`-mx-4 sm:mx-0 w-[calc(100%+2rem)] sm:w-full sm:rounded-lg bg-slate-700 overflow-hidden sm:max-w-full [&>*]:rounded-t-none ${
        props.class ?? ""
      }`}
      style={props.style}
    >
      <div class="flex items-stretch justify-start">
        <div class="p-3 flex items-center">
          <svg
            aria-hidden="true"
            width="41"
            height="10"
            viewBox="0 0 41 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <ellipse cx="20.9388" cy="5" rx="4.99155" ry="5" fill="#FFBD2D" />
            <ellipse cx="5.96421" cy="5" rx="4.99155" ry="5" fill="#FF5F56" />
            <ellipse cx="35.9134" cy="5" rx="4.99155" ry="5" fill="#26C940" />
          </svg>
        </div>
        <div class="p-3 w-full leading-none text-slate-400 text-sm font-mono">
          {props.name ?? ""}
        </div>
      </div>
      {props.children}
    </div>
  );
}

import type { JSX } from "preact";

interface DemoBoxProps extends JSX.HTMLAttributes<HTMLDivElement> {
  flip?: boolean;
}

export function DemoBox(props: DemoBoxProps) {
  const outerFlip = props.flip ? "-skew-y-2 -skew-x-3" : "skew-y-2 skew-x-3";
  const innerFlip = props.flip ? "skew-y-2 skew-x-3" : "-skew-y-2 -skew-x-3";
  return (
    <div
      class={`bg-gradient-to-br font-medium from-blue-200 via-green-300 to-yellow-200 p-5 py-8 text-center items-center flex justify-center text-sm ${outerFlip}`}
    >
      <div class={`w-full ${innerFlip}`}>{props.children}</div>
    </div>
  );
}

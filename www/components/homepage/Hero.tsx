import { FancyLink } from "../../components/FancyLink.tsx";
import LemonTop from "../../islands/LemonTop.tsx";
import LemonBottom from "../../islands/LemonBottom.tsx";
import { CopyButton } from "../CopyButton.tsx";

export function Hero() {
  return (
    <>
      <div class="bg-green-300 mt-0 pt-32 md:pt-48 !mb-0 bg-gradient-to-br from-blue-100 via-green-200 to-yellow-100">
        <div class="md:grid grid-cols-5 gap-8 md:gap-16 items-center w-full max-w-screen-xl mx-auto px-4 md:px-8 lg:px-16 2xl:px-0">
          <div class="flex-1 text-center md:text-left md:col-span-3 pb-8 md:pb-32">
            <p class="italic text-gray-500 text-lg mb-4">Introducing Fresh:</p>
            <h2 class="text-[calc(1rem+4vw)] leading-tight sm:text-5xl lg:text-6xl sm:tracking-tight sm:leading-none font-extrabold">
              The framework so simple, you already know it.
            </h2>
            <p class="mt-6 text-lg sm:text-xl text-gray-700 text-balance max-w-prose">
              No config files, no build step. Just one file and
              you have a server with routing, JSX, and islands.
            </p>
            <div class="mt-12 flex flex-wrap justify-center items-stretch md:justify-start gap-4">
              <FancyLink href="/docs/getting-started">Get started</FancyLink>
              <CopyArea code={`deno run -Ar jsr:@fresh/init`} />
            </div>
          </div>
          <div class="md:col-span-2 flex justify-center items-end pb-8 md:pb-32">
            <LemonTop />
          </div>
        </div>
      </div>
      <LemonBottom />
    </>
  );
}

function CopyArea(props: { code: string }) {
  return (
    <div class="bg-slate-800 rounded-sm text-green-100 flex items-center min-w-0 overflow-x-auto">
      <pre class="overflow-x-auto w-full flex-1 px-6 py-4">
        {props.code}
      </pre>

      <CopyButton code={props.code} />
    </div>
  );
}

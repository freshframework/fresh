import { FancyLink } from "../../components/FancyLink.tsx";
import LemonTop from "../../islands/LemonTop.tsx";
import LemonBottom from "../../islands/LemonBottom.tsx";
import { CopyButton } from "../CopyButton.tsx";
import { PM_NAMES, type PmName } from "../../utils/markdown.ts";

const PM_COMMANDS: Record<PmName, string> = {
  npm: "npm create @frsh/app@latest",
  pnpm: "pnpm create @frsh/app",
  yarn: "yarn create @frsh/app",
  deno: "deno run -A npm:@frsh/create-app",
};

const PM_LABELS: Record<PmName, string> = {
  npm: "npm",
  pnpm: "pnpm",
  yarn: "Yarn",
  deno: "Deno",
};

export function Hero(props: { activePm: PmName }) {
  return (
    <>
      <div class="bg-green-300 mt-0 pt-32 md:pt-48 !mb-0 bg-gradient-to-br from-blue-100 via-green-200 to-yellow-100">
        <div class="md:grid grid-cols-5 gap-8 md:gap-16 items-center w-full max-w-screen-xl mx-auto px-4 md:px-8 lg:px-16 2xl:px-0">
          <div class="flex-1 text-center md:text-left md:col-span-3 pb-8 md:pb-32">
            <p class="italic text-gray-500 text-lg mb-4">Introducing Fresh 3:</p>
            <h2 class="text-[calc(1rem+4vw)] leading-tight sm:text-5xl lg:text-6xl sm:tracking-tight sm:leading-none font-extrabold">
              The framework so simple, you already know it.
            </h2>
            <p class="mt-6 text-lg sm:text-xl text-gray-700 text-balance max-w-prose">
              <img
                src="/logos/preact.svg"
                alt=""
                aria-hidden="true"
                class="inline-block h-[1em] w-[1em] align-[-0.15em] mr-1"
              />
              Preact and{" "}
              <img
                src="/logos/vite.svg"
                alt=""
                aria-hidden="true"
                class="inline-block h-[1em] w-[1em] align-[-0.15em] mr-1"
              />
              Vite, with file-system routing and signals. Server-render by default, and ship
              JavaScript only for the islands that need it.
            </p>
            <div class="mt-12 flex flex-col items-stretch md:items-start gap-4">
              <FancyLink href="/docs/getting-started">Get started</FancyLink>
              <PmInstall activePm={props.activePm} />
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

function PmInstall(props: { activePm: PmName }) {
  const activePm = PM_NAMES.includes(props.activePm) ? props.activePm : "npm";
  return (
    <div class="pm-tabs w-full max-w-md text-left" data-pm-tabs>
      <div class="pm-tabs-bar" role="tablist">
        {PM_NAMES.map((pm) => {
          const active = pm === activePm;
          return (
            <button
              type="button"
              role="tab"
              data-pm={pm}
              aria-selected={active}
              class={`pm-tab${active ? " pm-tab-active" : ""}`}
            >
              <img src={`/logos/${pm}.svg`} alt="" width={18} height={18} />
              {PM_LABELS[pm]}
            </button>
          );
        })}
      </div>
      {PM_NAMES.map((pm) => {
        const active = pm === activePm;
        const code = PM_COMMANDS[pm];
        return (
          <div class={`fenced-code pm-block${active ? " pm-active" : ""}`} data-pm={pm}>
            <div class="pm-block-copy text-green-100">
              <CopyButton code={code} />
            </div>
            <pre class="overflow-x-auto px-6 py-4 m-0 rounded-none bg-slate-800 text-green-100 text-left">
              {code}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

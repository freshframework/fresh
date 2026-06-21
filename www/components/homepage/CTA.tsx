import { FancyLink } from "../FancyLink.tsx";

export function CTA() {
  return (
    <div class="relative mt-16">
      <div class="text-center bg-gradient-to-br from-blue-100 via-green-200 to-yellow-100 pb-32 md:pb-48 xl:pb-56 !my-0 before:w-full before:bg-white before:h-16 md:before:h-32 xl:before:h-48 before:[clip-path:polygon(0%_0%,_100%_0%,_0%_100%)] z-0 before:absolute before:top-0 before:left-0">
        <div class="flex flex-col gap-4">
          <img
            src="/lemon.svg"
            alt="Illustration of a lemon sliced cleanly in half, suspended in midair as though frozen in time the instant after the cut, the juice flung from the edges"
            class="w-full max-w-48 sm:max-w-64 -mt-24 mx-auto mb-12 relative z-0"
          />
          <h2 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-gray-600 font-extrabold">
            Time for a Fresh start
          </h2>
          <div class="flex flex-col justify-start items-center gap-4">
            <p class="text-xl text-balance max-w-prose">
              Jump right in and build your website with Fresh. Learn everything you need to know in
              seconds.
            </p>
            <FancyLink href="/docs/getting-started" class="mx-auto mt-4">
              Get started
            </FancyLink>
          </div>
        </div>
      </div>
    </div>
  );
}

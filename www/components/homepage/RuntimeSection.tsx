import { PageSection } from "../PageSection.tsx";
import { FancyLink } from "../FancyLink.tsx";
import { SideBySide } from "../SideBySide.tsx";
import { SectionHeading } from "../homepage/SectionHeading.tsx";

export function RuntimeSection() {
  return (
    <PageSection>
      <SideBySide reverseOnDesktop>
        <img
          src="/illustration/lemon-squash.svg"
          class="w-full h-auto mx-auto max-w-[24rem] mt-8 mb-4"
          alt="A lemon-squash illustration symbolizing Fresh running on any runtime"
        />
        <div class="flex flex-col gap-4">
          <SectionHeading>Runtime agnostic</SectionHeading>
          <p>
            Fresh builds with Nitro and runs anywhere Nitro does. Node, Deno, Cloudflare Workers,
            containers, or a static export for a CDN. Pick a host and deploy.
          </p>
          <p>
            No custom runtime, no fork of the standard library, no host-specific entry file. The
            same project ships to all of them.
          </p>
          <FancyLink href="/docs/getting-started" class="mt-4">
            Get started
          </FancyLink>
        </div>
      </SideBySide>
    </PageSection>
  );
}

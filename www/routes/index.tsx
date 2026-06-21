import { handler, page } from "./$index.ts";
import VERSIONS from "../versions.json" with { type: "json" };
import { Seo } from "../components/Seo.tsx";
import Footer from "../components/Footer.tsx";
import Header from "../components/Header.tsx";
import { CTA } from "../components/homepage/CTA.tsx";
import { Hero } from "../components/homepage/Hero.tsx";
import { IslandsSection } from "../components/homepage/IslandsSection.tsx";
import { PartialsSection } from "../components/homepage/PartialsSection.tsx";
import { RenderingSection } from "../components/homepage/RenderingSection.tsx";
import { FormsSection } from "../components/homepage/FormsSection.tsx";
import { SocialProof } from "../components/homepage/SocialProof.tsx";
import { MoreFeatures } from "../components/homepage/MoreFeatures.tsx";
import { RuntimeSection } from "../components/homepage/RuntimeSection.tsx";
import { parsePmCookie } from "../utils/markdown.ts";
export const handlers = handler({
  GET(ctx) {
    const accept = ctx.req.headers.get("accept");
    const userAgent = ctx.req.headers.get("user-agent");
    if (userAgent?.includes("Deno/") && !accept?.includes("text/html")) {
      return ctx.redirect(`https://deno.land/x/fresh@${VERSIONS[0]}/init.ts`, 307);
    }
    return {
      data: {
        topic: ctx.url.searchParams.get("topic"),
        activePm: parsePmCookie(ctx.req.headers.get("cookie")),
      },
    };
  },
  async POST(ctx) {
    const form = await ctx.req.formData();
    const treat = form.get("treat");
    return ctx.redirect(`/thanks?vote=${treat}`, 303);
  },
});

export default page(function MainPage(props) {
  const { topic, activePm } = props.data;
  return (
    <div class="flex flex-col min-h-screen bg-white">
      <Seo
        url={props.url}
        title="Fresh - The simple, approachable, productive web framework."
        description="Fresh is a full-stack web framework for Preact, built on Vite. File-system routing, server-rendered by default, with islands for interactivity and signals for reactive state."
        ogImage={new URL("/og-image.webp", props.url).href}
      />
      <div class="bg-transparent flex flex-col relative z-10">
        <Header title="" active="/" />
      </div>
      <div class="flex flex-col -mt-20 relative">
        <Hero activePm={activePm} />
        <h2 class="text-3xl sm:text-4xl md:text-5xl text-gray-600 font-extrabold text-center mt-8 md:mt-12 lg:mt-16 px-4 italic">
          Take a tour of Fresh
        </h2>
        <RenderingSection />
        <IslandsSection />
        <FormsSection />
        <PartialsSection topic={topic} />
        <MoreFeatures />
        <SocialProof />
        <RuntimeSection />
        <CTA />
      </div>
      <Footer class="!mt-0" />
    </div>
  );
});

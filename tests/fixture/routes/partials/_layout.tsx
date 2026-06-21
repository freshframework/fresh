import { layout } from "./$_layout";
import { Partial } from "fresh/runtime";

import { Counter } from "../../islands/Counter.tsx";
import { NavStatus } from "../../islands/NavStatus.tsx";

// Wraps the partial demo in an `f-client-nav` region with a nav, an island
// that lives OUTSIDE the `<Partial>` (so tests can assert its state survives a
// partial swap), and the swappable `main` region.
export default layout(({ Component }) => {
  return (
    <div f-client-nav>
      <nav>
        <a id="nav-home" href="/partials">
          Home
        </a>
        <a id="nav-about" href="/partials/about">
          About
        </a>
        <a id="nav-form" href="/partials/form">
          Form
        </a>
        <a id="nav-data" href="/partials/data?q=alpha">
          Data
        </a>
        <a id="nav-slow" href="/partials/slow">
          Slow
        </a>
        <a id="nav-nested" href="/partials/nested">
          Nested
        </a>
        {/* The two keyed panels share a `key="kept"` on their inner counter, so
            the partial-swap path preserves the island's count across the swap
            while updating the `label` prop in place. */}
        <a id="nav-keyed" href="/partials/keyed">
          Keyed A
        </a>
        <a id="nav-keyed-2" href="/partials/keyed2">
          Keyed B
        </a>
        {/* 303-redirects to /partials/about — exercises redirect URL correction. */}
        <a id="nav-redirect" href="/partials/redirect">
          Redirect
        </a>
        {/* f-partial whose fetch 303-redirects to /partials/data. The region
            updates from the redirect target, but the committed URL must stay at
            the href (/partials/about) — f-partial decouples URL from fetch. */}
        <a
          id="nav-fpartial-redirect"
          href="/partials/about"
          f-partial="/partials/redirect?to=/partials/data"
        >
          f-partial → redirect
        </a>
        {/* `f-partial`: the history entry lands on /partials/about, but the
            partial is fetched from /partials/data?q=override — so the swapped
            region shows the data panel while the URL reads /partials/about. */}
        <a id="nav-fpartial" href="/partials/about" f-partial="/partials/data?q=override">
          Data (via f-partial)
        </a>
        {/* Opted out via boolean `={false}` (coerced to the string form by the
            render hook); clicking this does a full-page navigation. */}
        <a id="nav-fullload" href="/partials/about" f-client-nav={false}>
          About (full load)
        </a>
        {/* Handler throws → a partial fetch gets a 500, so the client falls back
            to a full-page load that renders the error document. */}
        <a id="nav-boom" href="/partials/boom">
          Boom
        </a>
        {/* In-page fragment link — a hash-only change isn't intercepted, so the
            browser scrolls natively with no partial swap or reload. */}
        <a id="nav-hash" href="#bottom-section">
          Hash
        </a>
      </nav>
      <Counter id="outside-counter" />
      <NavStatus />
      <Partial name="main">
        <Component />
      </Partial>
      {/* A tall spacer (OUTSIDE the partial, so it persists across swaps) gives
          the page enough height to exercise scroll restoration + fragment
          scrolling; `#bottom-section` is the hash target at the bottom. */}
      <div data-testid="tall-spacer" style={{ height: "2000px" }} />
      <div id="bottom-section">bottom</div>
    </div>
  );
});

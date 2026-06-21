import { layout } from "./$_layout";
import { Partial } from "fresh/runtime";

import { Clicks } from "../../islands/Clicks.tsx";

// The shell for the partials demo. Everything here is rendered on a normal
// (full) page load. On a client-side navigation between the links below, only
// the `<Partial name="content">` region is fetched and swapped — the heading,
// the island, and the nav stay exactly as they are.
export default layout(({ Component, url }) => {
  const link = (href: string, label: string) => (
    <a href={href} class={url.pathname === href ? "active" : ""}>
      {label}
    </a>
  );

  return (
    <div f-client-nav class="partials">
      <h2>Partials</h2>
      <p>
        Click the island, then switch panels. The count survives — only the panel below is swapped,
        not the whole page.
      </p>
      <Clicks />
      <nav class="partials-nav">
        {link("/partials", "Home")}
        {link("/partials/about", "About")}
        {link("/partials/time", "Server time")}
        {link("/partials/form", "Forms")}
        {link("/partials/kept-a", "Kept A")}
        {link("/partials/kept-b", "Kept B")}
      </nav>
      <Partial name="content">
        <Component />
      </Partial>
    </div>
  );
});

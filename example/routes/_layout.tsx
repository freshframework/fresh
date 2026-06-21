import { layout } from "./$_layout";

export default layout(({ Component, state, url }) => {
  return (
    <div class="layout">
      <nav>
        <a href="/" class={url.pathname === "/" ? "active" : ""}>
          Home
        </a>
        <a href="/about">About</a>
        <a href="/partials">Partials</a>
        {state.foo && <span>Hi, {state.foo}</span>}
      </nav>
      <main>
        <Component />
      </main>
      <footer>&copy; 2026 fresh3</footer>
    </div>
  );
});

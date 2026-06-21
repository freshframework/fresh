import { app } from "./$_app.ts";

import "../styles.css";

export default app(function App({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta property="og:type" content="website" />
        <meta name="color-scheme" content="light dark" />
        <link
          rel="preload"
          href="/fonts/FixelVariable.woff2"
          as="font"
          type="font/woff2"
          crossorigin="anonymous"
        />
        <script
          type="module"
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: `
const isDarkMode = localStorage.theme === "dark"
  || (!("theme" in localStorage)
    && window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";`,
          }}
        ></script>
      </head>
      <body>{children}</body>
    </html>
  );
});

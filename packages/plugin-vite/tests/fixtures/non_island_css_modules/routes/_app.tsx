import type { PageProps } from "fresh";
import { CssModulesNonIsland } from "../components/CssModuleNonIsland.tsx";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <CssModulesNonIsland />
        <Component />
      </body>
    </html>
  );
}

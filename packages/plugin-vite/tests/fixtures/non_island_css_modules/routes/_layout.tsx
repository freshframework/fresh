import { CssModulesNonIsland3 } from "../components/CssModuleNonIsland3.tsx";
import { define } from "../utils.ts";

export default define.layout(({ Component }) => {
  return (
    <>
      <CssModulesNonIsland3 />
      <Component />
    </>
  );
});

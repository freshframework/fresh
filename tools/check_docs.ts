import { checkDocs } from "./check_docs_lib.ts";

await checkDocs([
  import.meta.resolve("../packages/fresh/src/error.ts"),
  import.meta.resolve("../packages/fresh/src/mod.ts"),
  import.meta.resolve("../packages/fresh/src/context.ts"),
  import.meta.resolve("../packages/fresh/src/app.ts"),
]);

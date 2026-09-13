import { doc } from "jsr:@deno/doc@0.202.1";
import { App } from "@fresh/core";

const source =
  "data:application/typescript,export%20const%20answer%3A%20number%20%3D%2042%3B";

export const app = new App().get("/", async () => {
  const docs = await doc([source]);
  return Response.json({
    symbols: docs[source].symbols.map((symbol) => symbol.name),
  });
});

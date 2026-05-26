import { App, staticFiles } from "@fresh/core";

export const app = new App()
  .use(staticFiles())
  .fsRoutes();

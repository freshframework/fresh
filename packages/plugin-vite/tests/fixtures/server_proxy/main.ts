import { App } from "@fresh/core";

export const app = new App().get("/", () => new Response("ok"));

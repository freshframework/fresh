import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";

const proxyTargetPort = Number(process.env.PROXY_TARGET_PORT ?? 0);

export default defineConfig({
  plugins: [fresh()],
  server: {
    host: "127.0.0.1",
    port: 0,
    proxy: {
      "/api": `http://127.0.0.1:${proxyTargetPort}`,
    },
  },
});

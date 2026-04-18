import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Pure static output — wrangler.json has assets.directory: ./dist
// No adapter needed; @astrojs/cloudflare would emit _worker.js which
// wrangler rejects when deploying via `assets`.
export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: true, watch: { ignored: ["**/ψ/**"] } },
  },
});

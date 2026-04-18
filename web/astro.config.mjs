import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "static",
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: true, watch: { ignored: ["**/ψ/**"] } },
  },
});

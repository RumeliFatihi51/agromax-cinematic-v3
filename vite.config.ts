import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { workflow } from "workflow/vite";
const commercial = process.env.AGROMAX_RUNTIME === "commercial";
export default defineConfig({
  plugins: commercial ? [nitro(), workflow()] : [],
  ...(commercial
    ? {
        nitro: {
          serverDir: "runtime",
          serverAssets: [{ baseName: "fonts", dir: "public/fonts" }],
          compatibilityDate: "2026-11-01",
          preset: process.env.VERCEL ? "vercel" : "node-server",
        },
      }
    : {}),
});

import { build } from "esbuild";
import { build as buildClient } from "vite";

await build({
  entryPoints: ["server/vercel-entry.js"],
  outfile: ".agromax-build/api.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: false,
  logLevel: "warning",
});
await buildClient();

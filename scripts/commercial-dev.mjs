import { existsSync, appendFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer } from "vite";
import { loadEnvFile } from "node:process";
const file = ".env.commercial.local";
if (!existsSync(file)) {
  appendFileSync(
    file,
    `AGROMAX_AUTH_SECRET=${randomBytes(48).toString("base64url")}\nAGROMAX_APP_URL=http://127.0.0.1:5180\n`,
  );
}
loadEnvFile(file);
if (!process.env.AGROMAX_AUTH_SECRET || !process.env.AGROMAX_APP_URL)
  throw new Error("Commercial identity environment is incomplete.");
mkdirSync("data", { recursive: true });
process.env.AGROMAX_RUNTIME = "commercial";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
});
await server.listen();
console.log("Agromax commercial development: http://127.0.0.1:5180");

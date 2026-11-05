import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./commercial/db/schema.ts",
  out: "./commercial/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://localhost/agromax",
  },
  strict: true,
  verbose: false,
});

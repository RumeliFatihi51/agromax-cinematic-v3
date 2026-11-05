import { createStore } from "../commercial/db/store";
const url = process.env.AGROMAX_DATABASE_URL;
if (!url && process.env.VERCEL)
  throw new Error("Explicit commercial migration target is required.");
const store = await createStore({
  url,
  dataDir: url ? undefined : "data/commercial-pg",
});
try {
  await store.migrate();
  console.log(
    "Commercial schema migrations applied. Legacy tables were not changed.",
  );
} finally {
  await store.close();
}

import { DatabaseSync } from "node:sqlite";
import { createStore, type SqlClient } from "../commercial/db/store";
import { importLegacy } from "../commercial/db/import-legacy";
if (process.env.AGROMAX_DATABASE_URL)
  throw new Error(
    "This local importer does not write a remote target. Use the reviewed production cutover procedure.",
  );
const raw = new DatabaseSync("data/agromax.sqlite", { readOnly: true });
const source: SqlClient = {
  query: async (sql) => ({ rows: raw.prepare(sql).all() }),
};
const store = await createStore({
  dataDir: "data/commercial-pg",
  migrate: true,
});
try {
  console.log(JSON.stringify(await importLegacy(store, source)));
} catch {
  console.error(
    "Legacy import stopped; original data was not changed and target transaction was rolled back.",
  );
  process.exitCode = 1;
} finally {
  raw.close();
  await store.close();
}

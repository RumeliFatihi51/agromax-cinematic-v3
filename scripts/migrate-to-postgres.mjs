// One-time, lossless transfer of real local records. Never exports data to files.
// Run with --env-file=.env.local after linking the intended Vercel project.
import { DatabaseSync } from "node:sqlite";
import { postgresDatabase, initializeDatabase } from "../server/database.js";
import { createAnalysisService } from "../server/analysis-jobs.js";
import { createNasaService } from "../server/nasa.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const source = new DatabaseSync("data/agromax.sqlite", { readOnly: true });
const target = postgresDatabase(process.env.DATABASE_URL);
const tables = [
  "users",
  "records",
  "analyses",
  "analysis_jobs",
  "notifications",
  "audit_events",
  "integration_checks",
];
try {
  if (
    source
      .prepare(
        "SELECT COUNT(*) AS n FROM analysis_jobs WHERE state IN ('queued','running')",
      )
      .get().n
  )
    throw new Error("Finish active local analyses before migration.");
  await initializeDatabase(target);
  await createAnalysisService(target);
  await createNasaService(target);
  const counts = {};
  await target.transaction(async (tx) => {
    for (const table of tables) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      const existing = await tx
        .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
        .get();
      if (Number(existing.n))
        throw new Error(
          `Target ${table} is not empty; migration stopped without overwriting records.`,
        );
      for (const row of rows) {
        const columns = Object.keys(row);
        await tx
          .prepare(
            `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
          )
          .run(...Object.values(row));
      }
      const transferred = await tx.prepare(`SELECT * FROM ${table}`).all();
      const canonical = (row) =>
        JSON.stringify(
          Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
        );
      if (
        JSON.stringify(rows.map(canonical).sort()) !==
        JSON.stringify(transferred.map(canonical).sort())
      )
        throw new Error(
          `Exact record verification failed for ${table}; rolling back.`,
        );
      counts[table] = transferred.length;
    }
  });
  console.log(
    JSON.stringify({
      migrated: true,
      exactRecordsVerified: true,
      counts,
      sessionsTransferred: false,
    }),
  );
} catch {
  console.error(
    "Migration stopped. No existing target records were overwritten. Check connectivity and source/target state.",
  );
  process.exitCode = 1;
} finally {
  source.close();
  await target.close();
}

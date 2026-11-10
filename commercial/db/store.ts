import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import pg from "pg";
import { postgresTls } from "../../server/postgres-tls.js";
import { drizzle as drizzleLocal } from "drizzle-orm/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migrateLocal } from "drizzle-orm/pglite/migrator";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { resolve } from "node:path";
import * as schema from "./schema";

export type CommercialDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export interface SqlResult {
  rows: Record<string, unknown>[];
  rowCount?: number;
  affectedRows?: number;
}
export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<SqlResult>;
}
export interface Store {
  db: CommercialDb;
  raw: SqlClient;
  transaction<T>(callback: (client: SqlClient) => Promise<T>): Promise<T>;
  migrate(): Promise<void>;
  close(): Promise<void>;
}
export async function createStore(
  options: { url?: string; dataDir?: string; migrate?: boolean } = {},
): Promise<Store> {
  const migrationsFolder = resolve("commercial/db/migrations");
  let store: Store;
  if (options.url) {
    const poolOptions = {
      connectionString: options.url,
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 10000,
    };
    const pool = process.env.AGROMAX_POSTGRES_DRIVER === "pg"
      ? new pg.Pool({ ...poolOptions, ssl: postgresTls() })
      : new Pool(poolOptions);
    pool.on("error", () =>
      console.error("Commercial database idle connection closed."),
    );
    const connection = pool instanceof pg.Pool
      ? (() => {
          const db = drizzlePg(pool, { schema });
          return { db, migrate: () => migratePg(db, { migrationsFolder }) };
        })()
      : (() => {
          const db = drizzleNeon(pool, { schema });
          return { db, migrate: () => migrateNeon(db, { migrationsFolder }) };
        })();
    store = {
      db: connection.db as unknown as CommercialDb,
      raw: pool as unknown as SqlClient,
      async transaction(callback) {
        const connection = await pool.connect();
        const client = connection as unknown as SqlClient;
        try {
          await client.query("BEGIN");
          const result = await callback(client);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          connection.release();
        }
      },
      migrate: connection.migrate,
      close: () => pool.end(),
    };
  } else {
    const pg = new PGlite(options.dataDir);
    await pg.waitReady;
    const db = drizzleLocal(pg, { schema });
    store = {
      db: db as unknown as CommercialDb,
      raw: pg as unknown as SqlClient,
      transaction: (callback) =>
        pg.transaction((tx) => callback(tx as unknown as SqlClient)),
      migrate: () => migrateLocal(db, { migrationsFolder }),
      close: () => pg.close(),
    };
  }
  if (options.migrate) await store.migrate();
  return store;
}
let singleton: Promise<Store> | undefined;
export function getStore() {
  return (singleton ??= (async () => {
    const url = process.env.AGROMAX_DATABASE_URL;
    if (process.env.VERCEL && !url)
      throw new Error(
        "Explicit AGROMAX_DATABASE_URL is required. Legacy production is never selected implicitly.",
      );
    return createStore({
      url,
      dataDir: url
        ? undefined
        : process.env.AGROMAX_LOCAL_DATA_DIR || "data/commercial-pg",
      migrate: !process.env.VERCEL,
    });
  })().catch((error) => {
    singleton = undefined;
    throw error;
  }));
}

const legacyTables: Record<string, string> = {
  records: "farm_records",
  analyses: "farm_analyses",
  analysis_jobs: "farm_analysis_jobs",
  notifications: "farm_notifications",
  audit_events: "farm_audit_events",
  integration_checks: "commercial_integration_checks",
  weather_cache: "commercial_weather_cache",
  platform_records: "farm_platform_records",
  platform_revisions: "farm_platform_revisions",
};
function translate(sql: string) {
  let n = 0;
  return sql
    .replace(/\b(analysis_jobs_[a-z_]+|notifications_owner|platform_records_owner|platform_revision_unique)\b/g, "farm_$1")
    .replace(
      /\b(records|analyses|analysis_jobs|notifications|audit_events|integration_checks|weather_cache|platform_records|platform_revisions)\b/g,
      (name) => legacyTables[name]!,
    )
    .replace(
      /SELECT id FROM users WHERE id=\? FOR UPDATE/g,
      "SELECT id FROM organizations WHERE id=? FOR UPDATE",
    )
    .replace(/\?/g, () => `$${++n}`);
}
function scopedAdapter(client: SqlClient) {
  return {
    dialect: "postgres",
    lock: " FOR UPDATE",
    exec: async (statement: string) => {
      for (const sql of statement
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await client.query(translate(sql));
    },
    prepare(sql: string) {
      const query = (...values: unknown[]) =>
        client.query(translate(sql), values);
      return {
        get: async (...values: unknown[]) => (await query(...values)).rows[0],
        all: async (...values: unknown[]) => (await query(...values)).rows,
        run: async (...values: unknown[]) => {
          const r = await query(...values);
          return { changes: r.rowCount ?? r.affectedRows ?? 0 };
        },
      };
    },
  };
}
export function legacyDomainAdapter(store: Store) {
  return {
    ...scopedAdapter(store.raw),
    transaction: <T>(
      callback: (tx: ReturnType<typeof scopedAdapter>) => Promise<T>,
    ) => store.transaction((client) => callback(scopedAdapter(client))),
  };
}

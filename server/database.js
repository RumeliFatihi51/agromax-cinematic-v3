import { Pool } from "@neondatabase/serverless";
import pg from "pg";
import { postgresTls } from "./postgres-tls.js";

// SQL and values always travel separately. Application SQL uses ? placeholders.
function postgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}
function postgresAdapter(client) {
  return {
    dialect: "postgres",
    lock: " FOR UPDATE",
    exec: (sql) => client.query(sql),
    prepare(sql) {
      const query = (...values) => client.query(postgresSql(sql), values);
      return {
        get: async (...values) => (await query(...values)).rows[0],
        all: async (...values) => (await query(...values)).rows,
        run: async (...values) => ({
          changes: (await query(...values)).rowCount,
        }),
      };
    },
  };
}
export function postgresDatabase(connectionString) {
  const PoolConstructor = process.env.AGROMAX_POSTGRES_DRIVER === "pg" ? pg.Pool : Pool;
  const pool = new PoolConstructor({
    connectionString,
    ...(PoolConstructor === pg.Pool ? { ssl: postgresTls() } : {}),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  });
  // Never log driver error objects: they can include connection details.
  pool.on("error", () => console.error("Database idle connection closed."));
  return {
    ...postgresAdapter(pool),
    async transaction(callback) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await callback(postgresAdapter(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// Serialize local operations so an awaited transaction cannot absorb another request.
export function sqliteDatabase(raw) {
  let tail = Promise.resolve();
  const scoped = {
    dialect: "sqlite",
    lock: "",
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => raw.prepare(sql),
  };
  const exclusive = (work) => {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  };
  return {
    dialect: "sqlite",
    lock: "",
    exec: (sql) => exclusive(() => raw.exec(sql)),
    prepare(sql) {
      return Object.fromEntries(
        ["get", "all", "run"].map((method) => [
          method,
          (...values) => exclusive(() => raw.prepare(sql)[method](...values)),
        ]),
      );
    },
    transaction(callback) {
      return exclusive(async () => {
        raw.exec("BEGIN IMMEDIATE");
        try {
          const result = await callback(scoped);
          raw.exec("COMMIT");
          return result;
        } catch (error) {
          raw.exec("ROLLBACK");
          throw error;
        }
      });
    },
    close: () => exclusive(() => raw.close()),
  };
}

export async function openDatabase() {
  if (process.env.DATABASE_URL)
    return postgresDatabase(process.env.DATABASE_URL);
  // A preview can be demonstrated before its managed Postgres instance is
  // provisioned. This opt-in store lasts only for the function instance
  // and must never be enabled for a production workspace.
  const ephemeralPreview =
    process.env.VERCEL &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.AGROMAX_EPHEMERAL_PREVIEW_DATABASE === "true";
  if (process.env.VERCEL && !ephemeralPreview)
    throw new Error("Persistent DATABASE_URL is required on Vercel.");
  const { DatabaseSync } = await import("node:sqlite");
  if (ephemeralPreview) return sqliteDatabase(new DatabaseSync(":memory:"));
  const { mkdirSync } = await import("node:fs");
  mkdirSync("data", { recursive: true });
  const raw = new DatabaseSync("data/agromax.sqlite");
  raw.exec("PRAGMA journal_mode=WAL");
  return sqliteDatabase(raw);
}

export async function initializeDatabase(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires BIGINT);
    CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,body TEXT);
    CREATE INDEX IF NOT EXISTS records_owner ON records(user_id);
    CREATE TABLE IF NOT EXISTS analyses(field_id TEXT PRIMARY KEY,geometry_hash TEXT,body TEXT);
    CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,started_at BIGINT NOT NULL);
  `);
}

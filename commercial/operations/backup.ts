import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
} from "node:crypto";
import type { Store } from "../db/store";
// Fixed dependency order; no request-controlled SQL identifiers are accepted.
const previousTables = [
  "auth_users",
  "auth_accounts",
  "auth_sessions",
  "auth_verifications",
  "auth_rate_limits",
  "organizations",
  "memberships",
  "organization_invitations",
  "user_preferences",
  "farm_records",
  "farm_analyses",
  "farm_analysis_jobs",
  "farm_notifications",
  "farm_audit_events",
  "domain_records",
  "audit_log",
  "usage_reservations",
  "provider_usage",
  "release_gates",
  "method_validations",
  "reports",
  "assistant_proposals",
  "billing_events",
  "subscriptions",
  "legacy_imports",
  "job_executions",
  "notification_receipts",
  "observation_cache",
  "assistant_requests",
] as const;
const requestTables = [...previousTables, "analysis_requests"] as const;
const claimTables = [...requestTables, "analysis_claims"] as const;
const tables = [...claimTables, "farm_platform_records", "farm_platform_revisions"] as const;
const magic = Buffer.from("AGROMAX_BACKUP_V1\n"),
  schemaVersion = "commercial-schema-0008";
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? String(v) : v));
type Snapshot = {
  schemaVersion: string;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};
export async function encryptedBackup(store: Store, passphrase: string) {
  if (passphrase.length < 32)
    throw new Error("Backup key must have at least 32 characters.");
  const snapshot: Snapshot = {
    schemaVersion,
    createdAt: new Date().toISOString(),
    tables: {},
  };
  await store.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    for (const table of tables)
      snapshot.tables[table] = (
        await tx.query(`SELECT * FROM "${table}"`)
      ).rows;
  });
  const plain = Buffer.from(canonical(snapshot)),
    salt = randomBytes(16),
    iv = randomBytes(12),
    key = scryptSync(passphrase, salt, 32),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(magic);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  key.fill(0);
  return {
    bytes: Buffer.concat([magic, salt, iv, cipher.getAuthTag(), ciphertext]),
    recordCount: Object.values(snapshot.tables).reduce(
      (s, r) => s + r.length,
      0,
    ),
    createdAt: snapshot.createdAt,
  };
}
export async function restoreEncryptedBackup(
  store: Store,
  bytes: Uint8Array,
  passphrase: string,
) {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length > 100_000_000 ||
    buffer.subarray(0, magic.length).compare(magic) !== 0
  )
    throw new Error("Unsupported backup format or size.");
  let at = magic.length;
  const salt = buffer.subarray(at, (at += 16)),
    iv = buffer.subarray(at, (at += 12)),
    tag = buffer.subarray(at, (at += 16)),
    key = scryptSync(passphrase, salt, 32),
    decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(magic);
  decipher.setAuthTag(tag);
  let plain: Buffer;
  try {
    plain = Buffer.concat([
      decipher.update(buffer.subarray(at)),
      decipher.final(),
    ]);
  } finally {
    key.fill(0);
  }
  const snapshot = JSON.parse(plain.toString("utf8")) as Snapshot;
  plain.fill(0);
  const sourceTables =
    snapshot.schemaVersion === "commercial-schema-0005" ? previousTables :
    snapshot.schemaVersion === "commercial-schema-0006" ? requestTables :
    snapshot.schemaVersion === "commercial-schema-0007" ? claimTables :
    snapshot.schemaVersion === schemaVersion ? tables : null;
  if (!sourceTables ||
    Object.keys(snapshot.tables).length !== sourceTables.length ||
    sourceTables.some((t) => !Array.isArray(snapshot.tables[t])))
    throw new Error("Backup schema does not match this migration version.");
  await store.transaction(async (tx) => {
    for (const table of tables) {
      const current = await tx.query(`SELECT 1 FROM "${table}" LIMIT 1`);
      if (current.rows.length)
        throw new Error(
          "Restore target must be empty. No existing records were removed.",
        );
    }
    for (const table of sourceTables) {
      const allowed = (
        await tx.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
          [table],
        )
      ).rows.map((c) => String(c.column_name));
      for (const row of snapshot.tables[table]!) {
        const columns = Object.keys(row);
        if (columns.some((c) => !allowed.includes(c)))
          throw new Error("Backup contains an unexpected column.");
        const values = Object.values(row).map((v) =>
          v instanceof Date
            ? v.toISOString()
            : typeof v === "object" && v !== null
              ? JSON.stringify(v)
              : v,
        );
        await tx.query(
          `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`,
          values,
        );
      }
    }
    for (const table of sourceTables) {
      const actual = (await tx.query(`SELECT * FROM "${table}"`)).rows;
      const rows = (list: Record<string, unknown>[]) =>
        list
          .map((row) =>
            canonical(
              Object.fromEntries(
                Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
              ),
            ),
          )
          .sort();
      if (canonical(rows(actual)) !== canonical(rows(snapshot.tables[table]!)))
        throw new Error(`Exact restore verification failed: ${table}`);
    }
  });
  return {
    schemaVersion,
    sourceCreatedAt: snapshot.createdAt,
    recordsVerified: Object.values(snapshot.tables).reduce(
      (s, r) => s + r.length,
      0,
    ),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

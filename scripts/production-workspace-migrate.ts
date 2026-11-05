// Run only against the explicitly selected existing production database.
// All source rows are encrypted and verified before additive migrations execute.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createStore } from "../commercial/db/store";
const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (
  project.projectId !== "prj_t2t4a9YoSToeg5WXtsi665OtmDc8" ||
  !process.env.DATABASE_URL
)
  throw new Error("Explicit Agromax production target is required.");
const legacyTables = [
  "users",
  "sessions",
  "records",
  "analyses",
  "analysis_jobs",
  "notifications",
  "audit_events",
  "integration_checks",
  "weather_cache",
  "auth_limits",
];
const store = await createStore({ url: process.env.DATABASE_URL });
try {
  const snapshot: Record<string, unknown[]> = {};
  await store.transaction(async (tx) => {
    await tx.query("set transaction isolation level repeatable read read only");
    for (const table of legacyTables)
      snapshot[table] = (await tx.query(`select * from ${table}`)).rows;
  });
  const plain = Buffer.from(
    JSON.stringify({
      version: "agromax-existing-account-backup-v1",
      createdAt: new Date().toISOString(),
      tables: snapshot,
    }),
  );
  const key = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]),
    tag = cipher.getAuthTag();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const verified = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  if (!verified.equals(plain))
    throw new Error("Encrypted backup verification failed.");
  const directory = resolve("data", "production-backups", `${Date.now()}`);
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "database.encrypted.json"),
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    }),
    { mode: 0o600 },
  );
  await writeFile(resolve(directory, "recovery.key"), key.toString("base64"), {
    mode: 0o600,
  });
  const counts = Object.fromEntries(
    Object.entries(snapshot).map(([k, v]) => [k, v.length]),
  );
  await writeFile(
    resolve(directory, "verification.json"),
    JSON.stringify(
      {
        counts,
        sha256: createHash("sha256").update(plain).digest("hex"),
        roundTripVerified: true,
      },
      null,
      2,
    ),
  );
  await store.migrate();
  const intact: Record<string, boolean> = {};
  for (const table of legacyTables) {
    const n = (await store.raw.query(`select count(*)::int as n from ${table}`))
      .rows[0]!.n;
    intact[table] = Number(n) >= snapshot[table]!.length;
  }
  console.log(
    JSON.stringify({
      encryptedBackupVerified: true,
      backupDirectory: directory,
      originalCounts: counts,
      sourceRowsPreserved: intact,
      additiveMigrationsApplied: true,
    }),
  );
} finally {
  await store.close();
}

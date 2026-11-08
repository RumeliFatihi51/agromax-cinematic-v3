import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Store, SqlClient } from "./store";
import {
  user,
  account,
  organizations,
  memberships,
  preferences,
  legacyImport,
} from "./schema";
const tablePairs = [
  ["records", "farm_records"],
  ["analyses", "farm_analyses"],
  ["analysis_jobs", "farm_analysis_jobs"],
  ["notifications", "farm_notifications"],
  ["audit_events", "farm_audit_events"],
  ["platform_records", "farm_platform_records"],
  ["platform_revisions", "farm_platform_revisions"],
] as const;
const workspaceId = (id: string) =>
  createHash("sha256")
    .update("agromax:legacy-workspace:" + id)
    .digest("hex")
    .slice(0, 32);
export async function importLegacy(
  store: Store,
  source: SqlClient,
  sourceKey = "legacy-v1",
) {
  const [previous] = await store.db
    .select()
    .from(legacyImport)
    .where(eq(legacyImport.source, sourceKey))
    .limit(1);
  if (previous) return { alreadyImported: true, counts: previous.counts };
  // Source credentials and sessions never become migration logs or exported files.
  const users = (await source.query("SELECT id,name,email,password FROM users"))
    .rows;
  const snapshots = new Map<string, Record<string, unknown>[]>();
  let missingPlatformTables = 0;
  for (const [from] of tablePairs) {
    try {
      snapshots.set(from, (await source.query(`SELECT * FROM ${from}`)).rows);
    } catch (error) {
      if (!from.startsWith("platform_") || !(error instanceof Error) ||
        (!("code" in error && error.code === "42P01") && !error.message.includes(`no such table: ${from}`)))
        throw error;
      missingPlatformTables++;
      snapshots.set(from, []);
    }
  }
  if (missingPlatformTables === 1)
    throw new Error("Legacy platform records and revisions must be imported together.");
  const ownerByField = new Map(snapshots.get("records")!
    .filter((row) => row.kind === "field").map((row) => [row.id, row.user_id]));
  const platform = snapshots.get("platform_records")!;
  const ownerByRecord = new Map(platform.map((row) => [row.id, row.user_id]));
  if (platform.some((row) => ownerByField.get(row.field_id) !== row.user_id) ||
    snapshots.get("platform_revisions")!.some((row) => ownerByRecord.get(row.record_id) !== row.user_id))
    throw new Error("Legacy platform records have inconsistent field or revision ownership.");
  if (
    snapshots
      .get("analysis_jobs")!
      .some((j) => ["queued", "running"].includes(String(j.state)))
  )
    throw new Error("Finish active legacy analyses before importing.");
  const counts: Record<string, number> = { users: users.length };
  await store.db.transaction(async (tx) => {
    const existing = await tx.select({ id: user.id }).from(user).limit(1);
    if (existing.length)
      throw new Error(
        "Target identities are not empty; import refuses to overwrite accounts.",
      );
    for (const row of users) {
      const id = String(row.id),
        orgId = workspaceId(id),
        password = String(row.password);
      if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(password))
        throw new Error("Unsupported legacy password format.");
      await tx.insert(user).values({
        id,
        name: String(row.name),
        email: String(row.email),
        emailVerified: false,
      });
      await tx.insert(account).values({
        id: workspaceId("credential:" + id),
        userId: id,
        providerId: "credential",
        accountId: id,
        password: "legacy-scrypt:" + password,
      });
      await tx.insert(organizations).values({
        id: orgId,
        name: `${String(row.name).slice(0, 65)} · çalışma alanı`,
      });
      await tx.insert(memberships).values({
        id: workspaceId("member:" + id),
        userId: id,
        organizationId: orgId,
        role: "owner",
      });
      await tx
        .insert(preferences)
        .values({ userId: id, activeOrganizationId: orgId });
    }
    const ids = new Set(users.map((u) => String(u.id)));
    for (const [from, to] of tablePairs) {
      const rows = snapshots.get(from)!;
      for (const original of rows) {
        const row = { ...original };
        if ("user_id" in row) {
          if (!ids.has(String(row.user_id)))
            throw new Error("Legacy record references an unknown owner.");
          row.user_id = workspaceId(String(row.user_id));
        }
        const columns = Object.keys(row);
        // Identifiers come exclusively from the fixed table map and database schema.
        const allowed: Record<string, Set<string>> = {
          records: new Set(["id", "user_id", "kind", "body"]),
          analyses: new Set(["field_id", "geometry_hash", "body"]),
          analysis_jobs: new Set([
            "id",
            "user_id",
            "field_id",
            "geometry_hash",
            "snapshot",
            "state",
            "created_at",
            "started_at",
            "finished_at",
            "result",
            "error",
          ]),
          notifications: new Set([
            "id",
            "user_id",
            "type",
            "title",
            "message",
            "job_id",
            "field_id",
            "created_at",
            "read_at",
          ]),
          audit_events: new Set([
            "id",
            "user_id",
            "action",
            "resource_id",
            "created_at",
          ]),
          platform_records: new Set([
            "id", "user_id", "field_id", "kind", "name", "status",
            "version", "body", "created_at", "updated_at",
          ]),
          platform_revisions: new Set([
            "id", "user_id", "record_id", "version", "body", "created_at",
          ]),
        };
        if (columns.some((c) => !allowed[from]!.has(c)))
          throw new Error("Unexpected source column; migration stopped.");
        const { sql } = await import("drizzle-orm");
        const identifiers = sql.raw(columns.map((c) => `"${c}"`).join(","));
        await tx.execute(
          sql`insert into ${sql.raw(to)} (${identifiers}) values (${sql.join(
            Object.values(row).map((value) => sql`${value}`),
            sql`,`,
          )})`,
        );
      }
      const { sql } = await import("drizzle-orm");
      const result = (await tx.execute(
        sql`select * from ${sql.raw(to)}`,
      )) as unknown as { rows: Record<string, unknown>[] };
      const canonical = (row: Record<string, unknown>) =>
        JSON.stringify(
          Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
        );
      const expected = rows
        .map((row) =>
          canonical(
            "user_id" in row
              ? { ...row, user_id: workspaceId(String(row.user_id)) }
              : row,
          ),
        )
        .sort();
      if (
        JSON.stringify(expected) !==
        JSON.stringify(result.rows.map(canonical).sort())
      )
        throw new Error("Exact record verification failed; rolling back.");
      counts[from] = rows.length;
    }
    await tx
      .insert(legacyImport)
      .values({ source: sourceKey, importedAt: new Date(), counts });
  });
  return {
    alreadyImported: false,
    exactRecordsVerified: true,
    sessionsTransferred: false,
    counts,
  };
}

import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { CommercialDb } from "../db/store";
import { farmPlatformRecords } from "../db/schema";
import type { Context } from "../organizations/service";
import { parseDraft, scenarioTotals } from "../../shared/platform-contracts.js";

type Row = { id: string; kind: string; name: string; version: number; body: string };

export async function scopedWorkspaceFiles(
  db: CommercialDb,
  ctx: Context,
  fieldId: string,
  geometryVersion: string,
) {
  const rows: Row[] = ctx.actor.authentication === "legacy-session"
    ? (await db.execute(sql`select id, kind, name, version, body from platform_records
        where user_id=${ctx.actor.id} and field_id=${fieldId} and status<>'archived'
        order by updated_at desc, id desc limit 50`) as { rows: Row[] }).rows
    : await db.select({
        id: farmPlatformRecords.id, kind: farmPlatformRecords.kind,
        name: farmPlatformRecords.name, version: farmPlatformRecords.version, body: farmPlatformRecords.body,
      }).from(farmPlatformRecords).where(and(
        eq(farmPlatformRecords.organizationId, ctx.organization.id),
        eq(farmPlatformRecords.fieldId, fieldId),
        ne(farmPlatformRecords.status, "archived"),
      )).orderBy(desc(farmPlatformRecords.updatedAt), desc(farmPlatformRecords.id)).limit(50);

  return rows.flatMap(({ body, ...row }) => {
    const { fieldSnapshot, payload } = JSON.parse(body);
    if (fieldSnapshot?.geometryHash !== geometryVersion) return [];
    const file = parseDraft({ fieldId, name: row.name, kind: row.kind, payload });
    return [{
      ...row, payload: file.payload,
      calculation: file.kind === "scenario" ? scenarioTotals(file.payload) : undefined,
    }];
  });
}

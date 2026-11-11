import { and, desc, eq, sql } from "drizzle-orm";
import { domainRecords, auditLog } from "../db/schema";
import { requirePermission, uid } from "../organizations/service";
import { ownField } from "../records/service";
import { DomainError } from "../core/errors";
import type { CommercialDb } from "../db/store";
import type { WorkspaceRequest } from "../core/api";
import { geometryHash } from "../../server/analysis-jobs.js";
import { validateGeometry } from "../../shared/geometry.js";
import { balanceInput, runWaterBalance } from "./water-balance";

const kind = "water_balance";

export async function simulationRoutes({ db, context, body, path, method }: WorkspaceRequest) {
  const match = path.match(/^\/api\/v1\/fields\/([a-f0-9]{32})\/water-balance$/);
  if (!match || !["GET", "POST"].includes(method)) return;
  const fieldId = match[1]!;
  const existingAccount = context.actor.authentication === "legacy-session";
  requirePermission(context, method === "GET" ? "read" : existingAccount ? "record.write" : "calculate");
  if (method === "GET") {
    const field = await ownField(db, context, fieldId);
    const runs = await db.select().from(domainRecords).where(and(
      eq(domainRecords.organizationId, context.organization.id),
      eq(domainRecords.fieldId, fieldId),
      eq(domainRecords.kind, kind),
    )).orderBy(desc(domainRecords.createdAt), desc(domainRecords.id)).limit(1);
    return Response.json({ run: runs[0] ?? null, geometryVersion: geometryHash(field.geometry) }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const input = balanceInput.parse(body);
  return db.transaction(async (tx) => {
    // Field mutations take this lock before writing geometry.
    await tx.execute(sql`select id from organizations where id=${context.organization.id} for update`);
    const field = await ownField(tx as unknown as CommercialDb, context, fieldId);
    if (existingAccount) {
      const result = await tx.execute(sql`select body from records where id=${fieldId}
        and user_id=${context.actor.id} and kind='field' for update`) as { rows: { body: string }[] };
      const current = result.rows[0] && JSON.parse(result.rows[0].body);
      if (!current || current.deletedAt)
        throw new DomainError("NOT_FOUND", "Parsel bulunamadı.", 404);
      if (geometryHash(current.geometry) !== geometryHash(field.geometry))
        throw new DomainError("GEOMETRY_CHANGED", "Parsel sınırı değişti. Yeniden yükleyip tekrar deneyin.", 409);
    }
    if (!field.geometry)
      throw new DomainError("GEOMETRY_REQUIRED", "Önce parsel sınırını çizin.", 422);
    const areaM2 = validateGeometry(field.geometry).area * 1000;
    const id = uid();
    const [run] = await tx.insert(domainRecords).values({
      id,
      organizationId: context.organization.id,
      fieldId,
      kind,
      createdBy: context.actor.id,
      data: {
        geometryVersion: geometryHash(field.geometry),
        areaM2,
        input,
        result: runWaterBalance(input, areaM2),
      },
    }).returning();
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: context.organization.id,
      actorId: context.actor.id,
      resourceId: id,
      action: "water_balance.created",
    });
    return Response.json({ run, geometryVersion: geometryHash(field.geometry) }, { status: 201 });
  });
}

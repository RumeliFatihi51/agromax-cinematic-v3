import { and, eq, isNull, desc, sql } from "drizzle-orm";
import type { CommercialDb } from "../db/store";
import { domainRecords, farmRecords, farmJobs, auditLog } from "../db/schema";
import {
  domainSchemas,
  domainKind,
  type DomainKind,
} from "../../shared/contracts/commercial";
import { DomainError } from "../core/errors";
import { requirePermission, uid, type Context } from "../organizations/service";

export async function ownField(db: CommercialDb, ctx: Context, id: string) {
  const [row] = await db
    .select()
    .from(farmRecords)
    .where(
      and(
        eq(farmRecords.id, id),
        eq(farmRecords.organizationId, ctx.organization.id),
        eq(farmRecords.kind, "field"),
      ),
    )
    .limit(1);
  if (!row || JSON.parse(row.body).deletedAt)
    throw new DomainError("NOT_FOUND", "Parsel bulunamadı.", 404);
  return { ...JSON.parse(row.body), id: row.id } as {
    id: string;
    name: string;
    area: number;
    geometry?: unknown;
  };
}
export async function listDomainRecords(
  db: CommercialDb,
  ctx: Context,
  inputKind: string,
  fieldId?: string | null,
) {
  const kind = domainKind.parse(inputKind);
  if (fieldId) await ownField(db, ctx, fieldId);
  return db
    .select()
    .from(domainRecords)
    .where(
      and(
        eq(domainRecords.organizationId, ctx.organization.id),
        eq(domainRecords.kind, kind),
        isNull(domainRecords.deletedAt),
        ...(fieldId ? [eq(domainRecords.fieldId, fieldId)] : []),
      ),
    )
    .orderBy(desc(domainRecords.createdAt), desc(domainRecords.id));
}
export async function saveDomainRecord(
  db: CommercialDb,
  ctx: Context,
  inputKind: string,
  input: unknown,
  update?: { id: string; version: number },
) {
  requirePermission(ctx, "record.write");
  const kind = domainKind.parse(inputKind),
    data = domainSchemas[kind].parse(input),
    fieldId = data.fieldId;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from organizations where id=${ctx.organization.id} for update`,
    );
    await ownField(tx as unknown as CommercialDb, ctx, fieldId);
    if (kind === "evaluation" && "analysisId" in data && data.analysisId) {
      const [job] = await tx
        .select()
        .from(farmJobs)
        .where(
          and(
            eq(farmJobs.id, data.analysisId),
            eq(farmJobs.organizationId, ctx.organization.id),
            eq(farmJobs.fieldId, fieldId),
            eq(farmJobs.state, "completed"),
          ),
        )
        .limit(1);
      if (!job)
        throw new DomainError(
          "NOT_FOUND",
          "Tamamlanmış analiz bulunamadı.",
          404,
        );
    }
    let row;
    if (update) {
      const [current] = await tx
        .select()
        .from(domainRecords)
        .where(
          and(
            eq(domainRecords.id, update.id),
            eq(domainRecords.organizationId, ctx.organization.id),
            eq(domainRecords.kind, kind),
            isNull(domainRecords.deletedAt),
          ),
        )
        .limit(1);
      if (!current)
        throw new DomainError("NOT_FOUND", "Kayıt bulunamadı.", 404);
      if (ctx.role === "worker" && current.createdBy !== ctx.actor.id)
        throw new DomainError(
          "FORBIDDEN",
          "Yalnızca kendi kaydınızı değiştirebilirsiniz.",
          403,
        );
      if (current.version !== update.version)
        throw new DomainError(
          "VERSION_CONFLICT",
          "Kayıt başka bir işlemde değişti. Yeniden yükleyin.",
          409,
        );
      [row] = await tx
        .update(domainRecords)
        .set({
          data,
          fieldId,
          updatedAt: new Date(),
          version: current.version + 1,
        })
        .where(eq(domainRecords.id, current.id))
        .returning();
    } else
      [row] = await tx
        .insert(domainRecords)
        .values({
          id: uid(),
          organizationId: ctx.organization.id,
          fieldId,
          kind,
          data,
          createdBy: ctx.actor.id,
        })
        .returning();
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: ctx.organization.id,
      actorId: ctx.actor.id,
      action: `${kind}.${update ? "updated" : "created"}`,
      resourceId: row!.id,
    });
    return row!;
  });
}
export async function deleteDomainRecord(
  db: CommercialDb,
  ctx: Context,
  id: string,
  version: number,
) {
  requirePermission(ctx, "record.write");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(domainRecords)
      .where(
        and(
          eq(domainRecords.id, id),
          eq(domainRecords.organizationId, ctx.organization.id),
          isNull(domainRecords.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) throw new DomainError("NOT_FOUND", "Kayıt bulunamadı.", 404);
    if (ctx.role === "worker" && row.createdBy !== ctx.actor.id)
      throw new DomainError(
        "FORBIDDEN",
        "Yalnızca kendi kaydınızı kaldırabilirsiniz.",
        403,
      );
    if (version !== row.version)
      throw new DomainError(
        "VERSION_CONFLICT",
        "Kayıt değişti. Yeniden yükleyin.",
        409,
      );
    await tx
      .update(domainRecords)
      .set({ deletedAt: new Date(), version: row.version + 1 })
      .where(eq(domainRecords.id, id));
    await tx.insert(auditLog).values({
      id: uid(),
      actorId: ctx.actor.id,
      organizationId: ctx.organization.id,
      action: `${row.kind}.deleted`,
      resourceId: id,
    });
  });
}
export async function costSummary(
  db: CommercialDb,
  ctx: Context,
  fieldId?: string | null,
) {
  const rows = await listDomainRecords(db, ctx, "cost", fieldId),
    totals: Record<string, number> = {};
  for (const row of rows) {
    const data = domainSchemas.cost.parse(row.data);
    const sum = (totals[data.currency] || 0) + data.amountMinor;
    if (!Number.isSafeInteger(sum))
      throw new DomainError(
        "AMOUNT_OVERFLOW",
        "Toplam tutar desteklenen sınırı aşıyor.",
        422,
      );
    totals[data.currency] = sum;
  }
  return {
    totals: Object.entries(totals).map(([currency, amountMinor]) => ({
      currency,
      amountMinor,
    })),
    count: rows.length,
    exchangeConversion: null,
    source: "user_statement",
    method: "integer-minor-units-v1",
  };
}

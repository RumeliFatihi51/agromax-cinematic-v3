import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { CommercialDb } from "../db/store";
import {
  organizations,
  farmRecords,
  farmAnalyses,
  subscriptions,
  auditLog,
} from "../db/schema";
import { requirePermission, uid, type Context } from "../organizations/service";
import { prepareField } from "../../server/fields.js";
import { geometryHash } from "../../server/analysis-jobs.js";
import { DomainError } from "../core/errors";
export async function saveField(
  db: CommercialDb,
  ctx: Context,
  input: Record<string, unknown>,
  enforceQuota: boolean,
  operation?: { id: string; action: "update" | "delete" | "restore" },
) {
  requirePermission(ctx, "field.write");
  return db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ctx.organization.id))
      .for("update");
    let current: Record<string, unknown> | undefined;
    if (operation) {
      const [row] = await tx
        .select()
        .from(farmRecords)
        .where(
          and(
            eq(farmRecords.id, operation.id),
            eq(farmRecords.organizationId, ctx.organization.id),
            eq(farmRecords.kind, "field"),
          ),
        )
        .for("update");
      if (!row) throw new DomainError("NOT_FOUND", "Parsel bulunamadı.", 404);
      current = JSON.parse(row.body);
      if (
        z.number().int().positive().parse(input.version) !==
        Number(current!.version || 1)
      )
        throw new DomainError(
          "VERSION_CONFLICT",
          "Parsel değişti. Yeniden yükleyerek tekrar deneyin.",
          409,
        );
      if (current!.deletedAt && operation.action !== "restore")
        throw new DomainError("NOT_FOUND", "Parsel kaldırılmış.", 404);
    }
    const id = operation?.id || uid();
    let next: Record<string, unknown>;
    if (operation?.action === "delete")
      next = { ...current, deletedAt: new Date().toISOString() };
    else if (operation?.action === "restore") {
      next = { ...current };
      delete next.deletedAt;
    } else {
      try {
        next = prepareField(input, current);
      } catch (error) {
        throw new DomainError(
          "INVALID_FIELD",
          error instanceof Error ? error.message : "Parsel bilgileri geçersiz.",
        );
      }
      if (!next.geometry && !current)
        throw new DomainError(
          "GEOMETRY_REQUIRED",
          "Yeni parsel için sınır çizimi gerekli.",
        );
    }
    next.version = current ? Number(current.version || 1) + 1 : 1;
    next.geometryVersion = geometryHash(next.geometry);
    next.updatedAt = new Date().toISOString();
    if (!current) {
      next.createdAt = next.updatedAt;
      next.createdBy = ctx.actor.id;
    }
    if (enforceQuota && !next.deletedAt) {
      const [subscription] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, ctx.organization.id));
      if (
        !subscription ||
        subscription.state !== "active" ||
        !subscription.periodEnd ||
        subscription.periodEnd <= new Date()
      )
        throw new DomainError(
          "SUBSCRIPTION_REQUIRED",
          "Parsel ekleme veya alanı değiştirme için geçerli abonelik gerekli.",
          402,
        );
      const rows = await tx
        .select()
        .from(farmRecords)
        .where(
          and(
            eq(farmRecords.organizationId, ctx.organization.id),
            eq(farmRecords.kind, "field"),
          ),
        );
      const active = rows
        .filter((r) => r.id !== id)
        .map((r) => JSON.parse(r.body))
        .filter((r) => !r.deletedAt);
      const areaM2 =
        (active.reduce((s, r) => s + Number(r.area), 0) + Number(next.area)) *
        1000;
      const limit = subscription.limits.areaM2,
        fieldLimit = subscription.limits.fields;
      if (
        !Number.isFinite(areaM2) ||
        !Number.isFinite(limit) ||
        areaM2 > limit! ||
        !Number.isSafeInteger(fieldLimit) ||
        active.length + 1 > fieldLimit!
      )
        throw new DomainError(
          "AREA_QUOTA_EXCEEDED",
          "Paketin parsel sayısı veya toplam alan sınırı aşılıyor.",
          429,
        );
    }
    if (operation)
      await tx
        .update(farmRecords)
        .set({ body: JSON.stringify(next) })
        .where(eq(farmRecords.id, id));
    else
      await tx.insert(farmRecords).values({
        id,
        organizationId: ctx.organization.id,
        kind: "field",
        body: JSON.stringify(next),
      });
    if (
      current &&
      geometryHash(current.geometry) !== geometryHash(next.geometry)
    )
      await tx.delete(farmAnalyses).where(eq(farmAnalyses.fieldId, id));
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: ctx.organization.id,
      actorId: ctx.actor.id,
      action: `field.${operation?.action || "created"}`,
      resourceId: id,
      details: {
        version: next.version,
        geometryVersion: next.geometryVersion,
      },
    });
    return { ...next, id, kind: "field", version: Number(next.version) };
  });
}

import { and, eq, desc, isNull, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { CommercialDb } from "../db/store";
import { reports, farmJobs, domainRecords, organizations } from "../db/schema";
import { requirePermission, uid, type Context } from "../organizations/service";
import { reserveUsage } from "../usage/service";
import { DomainError } from "../core/errors";
import { identifier } from "../../shared/contracts/commercial";

export interface ReportSnapshot {
  schemaVersion: "report-v1";
  createdAt: string;
  organizationName: string;
  locale: "tr" | "en";
  field: {
    id: string;
    name: string;
    area?: number;
    geometry: { type: string; coordinates: number[][][] | number[][][][] };
  };
  analysisId: string;
  geometryVersion: string;
  analysis: {
    source: string;
    fetchedAt: string;
    method: string;
    range: { from: string; to: string; split: string };
    comparison: Record<
      string,
      {
        current: { mean: number } | null;
        previous: { mean: number } | null;
        delta: number | null;
      }
    >;
    observations: {
      from: string;
      to: string;
      stats: Record<
        string,
        { mean: number; coverage: number; min: number; max: number } | null
      >;
    }[];
    resolution: number;
    mask: string;
    aggregation: string;
  };
  records: {
    id: string;
    version: number;
    kind: string;
    data: Record<string, unknown>;
  }[];
}
export async function createReport(
  db: CommercialDb,
  ctx: Context,
  input: unknown,
  requestKey: string,
  enforceQuota: boolean,
  dailyLimit?: number,
) {
  requirePermission(ctx, "report.create");
  const data = z
    .object({
      analysisId: identifier,
      locale: z.enum(["tr", "en"]).default("tr"),
    })
    .strict()
    .parse(input);
  identifier.parse(requestKey);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ctx.organization.id))
      .for("update");
    const [existing] = await tx
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.organizationId, ctx.organization.id),
          eq(reports.requestKey, requestKey),
        ),
      );
    if (existing) {
      const snapshot = existing.snapshot as unknown as ReportSnapshot;
      if (
        snapshot.analysisId !== data.analysisId ||
        snapshot.locale !== data.locale
      )
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "Bu işlem anahtarı farklı rapora ait.",
          409,
        );
      return existing;
    }
    if (dailyLimit !== undefined) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(reports)
        .where(
          and(
            eq(reports.organizationId, ctx.organization.id),
            gte(reports.createdAt, today),
          ),
        );
      if ((count?.value || 0) >= dailyLimit)
        throw new DomainError(
          "REPORT_DAILY_LIMIT",
          `Günlük ${dailyLimit} rapor sınırına ulaşıldı.`,
          429,
        );
    }
    const [job] = await tx
      .select()
      .from(farmJobs)
      .where(
        and(
          eq(farmJobs.id, data.analysisId),
          eq(farmJobs.organizationId, ctx.organization.id),
        ),
      );
    if (!job || job.state !== "completed" || !job.result)
      throw new DomainError(
        "ANALYSIS_REQUIRED",
        "Tamamlanmış, erişiminiz olan bir analiz seçin.",
        422,
      );
    const analysis = JSON.parse(job.result);
    if (
      !analysis.source ||
      !analysis.method ||
      !Array.isArray(analysis.observations)
    )
      throw new DomainError(
        "INVALID_ANALYSIS",
        "Analizin kaynak bilgileri eksik.",
        422,
      );
    const id = uid(),
      now = new Date();
    const reservation = enforceQuota
      ? await reserveUsage(
          tx as unknown as CommercialDb,
          ctx.organization.id,
          `report:${id}`,
          "report",
        )
      : null;
    const records = await tx
      .select({
        id: domainRecords.id,
        version: domainRecords.version,
        kind: domainRecords.kind,
        data: domainRecords.data,
      })
      .from(domainRecords)
      .where(
        and(
          eq(domainRecords.organizationId, ctx.organization.id),
          eq(domainRecords.fieldId, job.fieldId),
          isNull(domainRecords.deletedAt),
        ),
      );
    const snapshot: ReportSnapshot = {
      schemaVersion: "report-v1",
      createdAt: now.toISOString(),
      organizationName: ctx.organization.name,
      locale: data.locale,
      field: JSON.parse(job.snapshot).field,
      analysisId: job.id,
      geometryVersion: job.geometryHash,
      analysis,
      records,
    };
    const [report] = await tx
      .insert(reports)
      .values({
        id,
        organizationId: ctx.organization.id,
        fieldId: job.fieldId,
        state: "queued",
        snapshot: snapshot as unknown as Record<string, unknown>,
        requestKey,
        reservationId: reservation?.id,
        createdBy: ctx.actor.id,
        createdAt: now,
      })
      .returning();
    return report!;
  });
}
export async function ownReport(db: CommercialDb, ctx: Context, id: string) {
  const [row] = await db
    .select()
    .from(reports)
    .where(
      and(eq(reports.id, id), eq(reports.organizationId, ctx.organization.id)),
    );
  if (!row) throw new DomainError("NOT_FOUND", "Rapor bulunamadı.", 404);
  return row;
}
export async function listReports(db: CommercialDb, ctx: Context) {
  return db
    .select({
      id: reports.id,
      fieldId: reports.fieldId,
      state: reports.state,
      createdAt: reports.createdAt,
      completedAt: reports.completedAt,
      error: reports.error,
    })
    .from(reports)
    .where(eq(reports.organizationId, ctx.organization.id))
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

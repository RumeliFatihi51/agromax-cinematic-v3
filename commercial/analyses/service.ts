import { and, eq, inArray, sql } from "drizzle-orm";
import {
  farmJobs,
  jobExecutions,
  organizations,
  farmRecords,
  farmAnalyses,
  farmNotifications,
  auditLog,
  analysisRequests,
  analysisClaims,
} from "../db/schema";
import { reserveUsage, settleUsage } from "../usage/service";
import { uid } from "../organizations/service";
import type { Store, CommercialDb } from "../db/store";
import { geometryHash } from "../../server/analysis-jobs.js";
import { comparisonRange, satelliteStatus } from "../../server/satellite.js";
import { availableMetrics } from "../../shared/metrics.js";
import { DomainError } from "../core/errors";
import { analysisWindow } from "./range";
import { deriveClaims } from "../intelligence/claims";

export type AnalysisPlan = typeof jobExecutions.$inferSelect.plan;
const stamp = () => new Date().toISOString();
export async function queueAnalysis(
  db: CommercialDb,
  organizationId: string,
  fieldId: string,
  enforceQuota: boolean,
  requestedRange?: unknown,
  request: { key?: string; actorId?: string } = {},
) {
  const id = uid();
  let window: ReturnType<typeof analysisWindow>;
  try {
    window = analysisWindow(requestedRange);
  } catch (error) {
    throw new DomainError(
      "INVALID_RANGE",
      error instanceof Error ? error.message : "Analiz tarihleri geçersiz.",
    );
  }
  return db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update");
    const [record] = await tx
      .select()
      .from(farmRecords)
      .where(
        and(
          eq(farmRecords.id, fieldId),
          eq(farmRecords.organizationId, organizationId),
          eq(farmRecords.kind, "field"),
        ),
      )
      .for("update");
    const field = record && JSON.parse(record.body);
    if (!field || field.deletedAt)
      throw new DomainError("NOT_FOUND", "Parsel bulunamadı.", 404);
    if (!field.geometry)
      throw new DomainError("GEOMETRY_REQUIRED", "Önce parsel sınırını çizin.");
    const selection = JSON.stringify([
      fieldId,
      window.scope === "custom" ? window.selectionKey : null,
    ]);
    if (request.key) {
      const [prior] = await tx
        .select()
        .from(analysisRequests)
        .where(
          and(
            eq(analysisRequests.organizationId, organizationId),
            eq(analysisRequests.key, request.key),
          ),
        );
      if (prior) {
        if (prior.selection !== selection)
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "İstek anahtarı başka bir parsel veya analiz dönemi için kullanıldı.",
            409,
          );
        return prior.jobId;
      }
    }
    async function rememberRequest(jobId: string) {
      if (!request.key) return;
      await tx.insert(analysisRequests).values({
        organizationId,
        key: request.key,
        jobId,
        selection,
      });
    }
    if (!satelliteStatus().configured)
      throw new DomainError(
        "PROVIDER_UNAVAILABLE",
        "Uydu bağlantısı yapılandırılmadı.",
        503,
      );
    const active = await tx
      .select()
      .from(farmJobs)
      .where(
        and(
          eq(farmJobs.organizationId, organizationId),
          inArray(farmJobs.state, ["queued", "running"]),
        ),
      );
    const duplicate = active.find((j) => j.fieldId === fieldId);
    if (duplicate) {
      const [execution] = await tx
        .select()
        .from(jobExecutions)
        .where(eq(jobExecutions.jobId, duplicate.id));
      const existingKey =
        execution?.plan.selectionKey ||
        `calendar:${execution?.plan.range.from}/${execution?.plan.range.split}`;
      if (existingKey !== window.selectionKey)
        throw new DomainError(
          "ANALYSIS_ALREADY_RUNNING",
          "Bu parsel için farklı bir dönem işleniyor. İşlemin tamamlanmasını bekleyin veya iptal edin.",
          409,
        );
      await rememberRequest(duplicate.id);
      return duplicate.id;
    }
    if (active.length >= 10)
      throw new DomainError(
        "TOO_MANY_JOBS",
        "Bekleyen analiz sınırına ulaşıldı.",
        429,
      );
    const reservation = enforceQuota
      ? await reserveUsage(
          tx as unknown as CommercialDb,
          organizationId,
          `analysis:${id}`,
          "analysis",
        )
      : null;
    const selected = availableMetrics(process.env.SENTINEL_PROVIDER),
      groups: string[][] = [];
    for (let i = 0; i < selected.length; i += 8)
      groups.push(selected.slice(i, i + 8).map((m: { id: string }) => m.id));
    await tx.insert(farmJobs).values({
      id,
      organizationId,
      fieldId,
      geometryHash: geometryHash(field.geometry),
      snapshot: JSON.stringify({ field: { ...field, id: fieldId } }),
      state: "queued",
      createdAt: stamp(),
    });
    await tx.insert(jobExecutions).values({
      jobId: id,
      reservationId: reservation?.id,
      plan: {
        ...window,
        provider: process.env.SENTINEL_PROVIDER!,
        groups,
      },
    });
    await rememberRequest(id);
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId,
      actorId: request.actorId,
      action: "analysis.queued",
      resourceId: id,
    });
    return id;
  });
}
export async function claimAnalysis(
  store: Store,
  jobId: string,
  runId: string,
) {
  return store.db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(farmJobs)
      .where(eq(farmJobs.id, jobId))
      .for("update");
    const [execution] = await tx
      .select()
      .from(jobExecutions)
      .where(eq(jobExecutions.jobId, jobId))
      .for("update");
    if (
      !job ||
      !execution ||
      !["queued", "running"].includes(job.state) ||
      (execution.runId && execution.runId !== runId)
    )
      return null;
    await tx
      .update(jobExecutions)
      .set({ runId })
      .where(eq(jobExecutions.jobId, jobId));
    if (job.state === "queued")
      await tx
        .update(farmJobs)
        .set({ state: "running", startedAt: stamp() })
        .where(eq(farmJobs.id, jobId));
    return {
      plan: execution.plan,
      geometry: JSON.parse(job.snapshot).field.geometry,
    };
  });
}
export async function assertActive(store: Store, jobId: string, runId: string) {
  const [row] = await store.db
    .select({ state: farmJobs.state, runId: jobExecutions.runId })
    .from(farmJobs)
    .innerJoin(jobExecutions, eq(farmJobs.id, jobExecutions.jobId))
    .where(eq(farmJobs.id, jobId));
  return row?.state === "running" && row.runId === runId;
}
export async function finishAnalysis(
  store: Store,
  jobId: string,
  runId: string,
  analysis: Record<string, unknown> | null,
  error: string | null = null,
) {
  return store.db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(farmJobs)
      .where(eq(farmJobs.id, jobId))
      .for("update");
    const [execution] = await tx
      .select()
      .from(jobExecutions)
      .where(eq(jobExecutions.jobId, jobId));
    if (
      !job ||
      !execution ||
      execution.runId !== runId ||
      job.state !== "running"
    )
      return;
    const [record] = await tx
      .select()
      .from(farmRecords)
      .where(
        and(
          eq(farmRecords.id, job.fieldId),
          eq(farmRecords.organizationId, job.organizationId),
          eq(farmRecords.kind, "field"),
        ),
      )
      .for("update");
    const field = record && JSON.parse(record.body);
    if (
      !field ||
      field.deletedAt ||
      geometryHash(field.geometry) !== job.geometryHash
    ) {
      analysis = null;
      error = "Parsel sınırı değişti; sonuç güncel parsele uygulanmadı.";
    }
    const state = analysis ? "completed" : "failed";
    const result = analysis
      ? JSON.stringify({
          ...analysis,
          comparisonScope: execution.plan.scope || "calendar",
          historyId: job.id,
          geometryVersion: job.geometryHash,
        })
      : null;
    await tx
      .update(farmJobs)
      .set({
        state,
        finishedAt: stamp(),
        result,
        error: analysis ? null : error || "Analiz tamamlanamadı.",
      })
      .where(eq(farmJobs.id, jobId));
    if (result && execution.plan.scope !== "custom")
      await tx
        .insert(farmAnalyses)
        .values({
          fieldId: job.fieldId,
          geometryHash: job.geometryHash,
          body: result,
        })
        .onConflictDoUpdate({
          target: farmAnalyses.fieldId,
          set: { geometryHash: job.geometryHash, body: result },
        });
    const claims = analysis ? deriveClaims(analysis) : [];
    if (claims.length) {
      await tx.insert(analysisClaims).values(claims.map((claim) => ({
        ...claim,
        id: uid(),
        organizationId: job.organizationId,
        fieldId: job.fieldId,
        analysisId: job.id,
        geometryVersion: job.geometryHash,
      })));
    }
    await tx
      .update(jobExecutions)
      .set({ completedAt: new Date() })
      .where(eq(jobExecutions.jobId, jobId));
    if (execution.reservationId)
      await settleUsage(
        tx as unknown as CommercialDb,
        job.organizationId,
        execution.reservationId,
        analysis ? "consumed" : "released",
      );
    await tx.insert(farmNotifications).values({
      id: uid(),
      organizationId: job.organizationId,
      type: `analysis.${state}`,
      title: analysis ? "Analiz tamamlandı" : "Analiz tamamlanamadı",
      message: analysis
        ? "Gerçek uydu sonuçları hazır."
        : error || "Yeni sonuç oluşturulmadı.",
      jobId,
      fieldId: job.fieldId,
      createdAt: stamp(),
    });
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: job.organizationId,
      action: `analysis.${state}`,
      resourceId: jobId,
    });
  });
}
export async function releaseCanceledUsage(
  db: CommercialDb,
  organizationId: string,
  jobId: string,
) {
  const [execution] = await db
    .select()
    .from(jobExecutions)
    .where(eq(jobExecutions.jobId, jobId));
  if (execution?.reservationId)
    await settleUsage(db, organizationId, execution.reservationId, "released");
}
export async function cancelAnalysis(
  db: CommercialDb,
  organizationId: string,
  jobId: string,
  actorId: string,
) {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(farmJobs)
      .where(
        and(
          eq(farmJobs.id, jobId),
          eq(farmJobs.organizationId, organizationId),
        ),
      )
      .for("update");
    if (!job) throw new DomainError("NOT_FOUND", "Analiz bulunamadı.", 404);
    if (job.state === "canceled") return;
    if (!["queued", "running"].includes(job.state))
      throw new DomainError(
        "ALREADY_FINISHED",
        "Bu analiz artık iptal edilemez.",
        409,
      );
    await tx
      .update(farmJobs)
      .set({ state: "canceled", finishedAt: stamp() })
      .where(eq(farmJobs.id, jobId));
    await releaseCanceledUsage(
      tx as unknown as CommercialDb,
      organizationId,
      jobId,
    );
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId,
      actorId,
      action: "analysis.canceled",
      resourceId: jobId,
    });
    await tx.insert(farmNotifications).values({
      id: uid(),
      organizationId,
      jobId,
      fieldId: job.fieldId,
      type: "analysis.canceled",
      title: "Analiz iptal edildi",
      message:
        "İşlem kullanıcı tarafından iptal edildi; yeni sonuç yayımlanmadı.",
      createdAt: stamp(),
    });
  });
}

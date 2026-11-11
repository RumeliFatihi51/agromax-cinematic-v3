import { and, eq, desc, isNull, gte, count } from "drizzle-orm";
import { z } from "zod";
import { ownField } from "../records/service";
import type { Context } from "../organizations/service";
import { requirePermission, uid } from "../organizations/service";
import type { CommercialDb } from "../db/store";
import {
  domainRecords,
  farmAnalyses,
  farmRecords,
  assistantProposals,
  organizations,
  auditLog,
  assistantRequests,
} from "../db/schema";
import { identifier, localDate } from "../../shared/contracts/commercial";
import { DomainError } from "../core/errors";
import type { ModelAdapter, Fact } from "./model";
import { selectionSchema } from "./model";
import { createReport } from "../reports/service";
import { reserveUsage, settleUsage } from "../usage/service";
import { geometryHash } from "../../server/analysis-jobs.js";
import { fieldClaims, publishProjectedClaims } from "../intelligence/claims";
import { scopedWorkspaceFiles } from "../records/workspace-files";
import { sensorMetrics } from "../../shared/field-observations.js";
import type { RuntimeOptions } from "../core/api";

export async function fieldFacts(
  db: CommercialDb,
  ctx: Context,
  fieldId: string,
  locale: "tr" | "en",
) {
  const field = await ownField(db, ctx, fieldId),
    t = (tr: string, en: string) => (locale === "tr" ? tr : en);
  const facts: Fact[] = [
    {
      id: "field-name",
      text: `${t("Parsel", "Parcel")}: ${field.name}`,
      source: `record:${field.id}`,
      kind: "user_statement",
      observedAt: null,
    },
  ];
  if (Number.isFinite(field.area))
    facts.push({
      id: "field-area",
      text: `${t("Kayıtlı alan", "Recorded area")}: ${field.area} ${t("dekar", "decare")}`,
      source: `record:${field.id}`,
      kind: field.geometry ? "calculated" : "user_statement",
      observedAt: null,
      geometryVersion: geometryHash(field.geometry),
    });
  const version = geometryHash(field.geometry);
  if (field.crop || field.sowingDate)
    facts.push({
      id: "field-crop", source: `record:${field.id}`, kind: "user_statement",
      text: `${t("Ürün ve ekim", "Crop and sowing")}: ${field.crop || t("Ürün kaydı yok", "No crop recorded")} · ${field.sowingDate || t("Ekim tarihi yok", "No sowing date")}`,
      observedAt: field.sowingDate || null, geometryVersion: version,
    });
  const records = await db
    .select()
    .from(domainRecords)
    .where(
      and(
        eq(domainRecords.organizationId, ctx.organization.id),
        eq(domainRecords.fieldId, fieldId),
        isNull(domainRecords.deletedAt),
      ),
    )
    .orderBy(desc(domainRecords.createdAt))
    .limit(50);
  for (const kind of [
    "irrigation",
    "nutrition",
    "protection",
    "soil",
    "evaluation",
    "season",
  ]) {
    const items = records.filter((r) => r.kind === kind);
    if (items.length) {
      const r = items[0]!;
      facts.push({
        id: `record-${r.id}`,
        text: `${t("Son kayıt", "Latest record")}: ${kind} · ${String(r.data.date || r.data.reportDate || r.data.sowingDate || r.createdAt.toISOString())} · ${String(r.data.state || r.data.name || "")}`,
        source: `record:${r.id}:v${r.version}`,
        kind: "user_statement",
        observedAt: typeof r.data.date === "string" ? r.data.date : null,
      });
    }
  }
  const costs = records.filter((r) => r.kind === "cost");
  for (const currency of new Set(costs.map((r) => String(r.data.currency)))) {
    const selected = costs.filter((r) => r.data.currency === currency),
      total = selected.reduce((sum, r) => sum + Number(r.data.amountMinor), 0);
    if (Number.isSafeInteger(total))
      facts.push({
        id: `cost-${currency}`,
        text: `${t("Son 50 saha kaydı içindeki giderler", "Costs among the latest 50 field records")}: ${new Intl.NumberFormat(locale, { style: "currency", currency }).format(total / 100)}`,
        source: selected.map((r) => `record:${r.id}:v${r.version}`).join(","),
        kind: "user_statement",
        observedAt: null,
      });
  }
  const [cached] = await db
    .select()
    .from(farmAnalyses)
    .where(eq(farmAnalyses.fieldId, fieldId));
  if (cached && cached.geometryHash === geometryHash(field.geometry)) {
    const analysis = JSON.parse(cached.body);
    for (const metric of ["NDVI", "NDMI", "NDWI", "NDRE", "EVI", "WDRVI"]) {
      const v = analysis.comparison?.[metric];
      if (
        typeof v?.current?.mean === "number" &&
        Number.isFinite(v.current.mean)
      )
        facts.push({
          id: `metric-${metric}`,
          text: `${metric}: ${v.current.mean} ${t("(birimsiz dönem ortalaması)", "(dimensionless period mean)")}; ${analysis.range?.split} - ${analysis.range?.to}`,
          source: `analysis:${analysis.historyId || fieldId}`,
          kind: "calculated",
          observedAt: analysis.range?.to || null,
          methodVersion: analysis.method,
          geometryVersion: cached.geometryHash,
        });
    }
    for (const [kind, source] of Object.entries(analysis.report?.supplementary || {})) {
      const measurement = z.object({ source: z.string(), date: z.string(), sceneId: z.string(),
        metrics: z.record(z.string(), z.object({ mean: z.number(), unit: z.string() })) }).safeParse(source);
      if (!measurement.success) continue;
      const value = measurement.data;
      facts.push({
        id: "satellite-" + kind,
        text: Object.entries(value.metrics).map(([name, stat]) => name + " " + stat.mean.toFixed(3) + " " + stat.unit).join(" · "),
        source: value.source + " · " + value.sceneId,
        kind: "calculated", observedAt: value.date, geometryVersion: cached.geometryHash,
      });
    }
  }
  const files = await scopedWorkspaceFiles(db, ctx, fieldId, version);
  for (const kind of ["scenario", "investigation", "prescription", "observation"]) {
    for (const file of files.filter(file => file.kind === kind).slice(0, 3)) {
      const p = file.payload;
      const reading = p.measurement || p.sensor;
      const measurement = reading ? ` · ${reading.value} ${sensorMetrics[reading.metric as keyof typeof sensorMetrics]?.unit || ""}` : "";
      const text = file.calculation
        ? `${t("Maliyet senaryosu", "Cost scenario")}: ${file.name} · ${file.calculation.totalMinor / 100} ${file.calculation.currency}`
        : kind === "prescription"
          ? `${t("Reçete taslağı", "Prescription draft")}: ${file.name} · ${p.rate} ${p.unit} · ${t("uzman onayı yok", "no expert approval")}`
          : kind === "investigation"
            ? `${t("Saha incelemesi", "Field investigation")}: ${file.name} · ${p.region}${measurement}${p.result ? " · " + p.result.slice(0, 350) : ""}`
            : `${t("Saha gözlemi", "Field observation")}: ${file.name}${measurement} · ${p.notes.slice(0, 350)}`;
      facts.push({
        id: `workspace-${file.id}`, text, source: `record:${file.id}:v${file.version}`,
        kind: file.calculation ? "calculated" : "user_statement",
        observedAt: p.observedAt || p.visitedAt || null, geometryVersion: version,
      });
    }
  }
  if (ctx.actor.authentication === "legacy-session") await publishProjectedClaims(db, ctx.organization.id, fieldId);
  const claims = await fieldClaims(db, ctx.organization.id, fieldId, 12);
  for (const claim of claims) {
    if (claim.geometryVersion !== version) continue;
    const evidence = claim.evidence;
    facts.push({
      id: `claim-${claim.id}`,
      text: `${claim.metric}: ${t("gözlenen dönem farkı", "observed period change")} ${evidence.delta.toFixed(4)} · ${evidence.range.from.slice(0, 10)} – ${evidence.range.to.slice(0, 10)}`,
      source: `claim:${claim.id} · analysis:${claim.analysisId}`,
      kind: "calculated",
      observedAt: evidence.range.to,
      methodVersion: evidence.claimMethod,
      geometryVersion: version,
    });
  }
  return facts;
}
const conversation = z.array(z.object({
  question: z.string().max(1000), answer: z.string().max(1800),
})).max(4).optional();

export async function answerHelp(db: CommercialDb, ctx: Context, input: unknown, model?: ModelAdapter) {
  const data = z.object({
    question: z.string().trim().min(1).max(1000),
    locale: z.enum(["tr", "en"]).default("tr"),
    consent: z.literal(true), conversation,
  }).strict().parse(input);
  requirePermission(ctx, "read");
  if (!model) throw new DomainError("MODEL_UNAVAILABLE", "Filiz şu anda kullanılamıyor.", 503);
  await db.transaction(async tx => {
    await tx.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.id, ctx.organization.id)).for("update");
    const [used] = await tx.select({ total: count() }).from(auditLog).where(and(
      eq(auditLog.organizationId, ctx.organization.id), eq(auditLog.action, "assistant.help"),
      gte(auditLog.createdAt, new Date(Date.now() - 86400000)),
    ));
    if ((used?.total ?? 0) >= 12) throw new DomainError("HELP_LIMIT", "Günlük genel sohbet sınırına ulaştın.", 429);
    await tx.insert(auditLog).values({ id: uid(), organizationId: ctx.organization.id,
      actorId: ctx.actor.id, action: "assistant.help" });
  });
  try {
    const response = await model({ ...data, facts: [] });
    return { introduction: response.selection.reply || (data.locale === "tr" ? "Sorunu biraz daha açabilir misin?" : "Could you tell me a bit more?"), facts: [] };
  } catch {
    throw new DomainError("MODEL_REQUEST_FAILED", "Filiz yanıt veremedi. Biraz sonra tekrar dene.", 502);
  }
}

export async function answerQuestion(
  db: CommercialDb,
  ctx: Context,
  input: unknown,
  key: string,
  model: ModelAdapter | undefined,
  enforceQuota: boolean,
  parcelForecast?: RuntimeOptions["parcelForecast"],
) {
  const data = z
    .object({
      question: z.string().trim().min(1).max(1000),
      fieldId: identifier,
      locale: z.enum(["tr", "en"]).default("tr"),
      consent: z.literal(true),
      conversation,
    })
    .strict()
    .parse(input);
  identifier.parse(key);
  requirePermission(ctx, "read");
  if (!model)
    throw new DomainError(
      "MODEL_UNAVAILABLE",
      "Filiz'in dil modeli henüz etkinleştirilmedi. Kayıt rehberini kullanabilirsiniz.",
      503,
    );
  const facts = await fieldFacts(db, ctx, data.fieldId, data.locale),
    id = uid();
  if (parcelForecast && /(?:hava|yağış|sıcaklık|rüzg[aâ]r|don|meteoroloji|weather|rain|temperature|wind|frost)/iu.test(data.question)) {
    try {
      const forecast = await parcelForecast(data.fieldId);
      const next = forecast.points.find(point => Date.parse(point.time) >= Date.now() &&
        Number.isFinite(point.values.air_temperature));
      if (next) {
        const units = [["air_temperature", "°C"], ["relative_humidity", "%"], ["wind_speed", "m/s"]] as const;
        const values = units.flatMap(([metric, unit]) =>
          Number.isFinite(next.values[metric]) ? [`${metric}: ${next.values[metric]} ${unit}`] : []);
        const rain = next.periods.find(period => Number.isFinite(period.values.precipitation_amount));
        if (rain) values.push(`precipitation_amount (${rain.hours} h): ${rain.values.precipitation_amount} mm`);
        facts.push({
          id: "parcel-weather", kind: "forecast", source: forecast.source,
          text: `${data.locale === "tr" ? "Parsel için model tahmini" : "Parcel model forecast"} · ${next.time} · ${values.join(" · ")}`,
          observedAt: next.time, methodVersion: forecast.method,
        });
      }
    } catch {
      // The parcel's other sources remain available when forecast retrieval fails.
    }
  }
  const request = await db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ctx.organization.id))
      .for("update");
    const [existing] = await tx
      .select()
      .from(assistantRequests)
      .where(
        and(
          eq(assistantRequests.organizationId, ctx.organization.id),
          eq(assistantRequests.requestKey, key),
          eq(assistantRequests.userId, ctx.actor.id),
        ),
      );
    if (existing) {
      if (
        existing.question !== data.question ||
        existing.fieldId !== data.fieldId ||
        existing.locale !== data.locale
      )
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "İstek anahtarı farklı soruya ait.",
          409,
        );
      return existing;
    }
    const reservation = enforceQuota
      ? await reserveUsage(
          tx as unknown as CommercialDb,
          ctx.organization.id,
          `assistant:${id}`,
          "assistant",
        )
      : null;
    const [row] = await tx
      .insert(assistantRequests)
      .values({
        id,
        organizationId: ctx.organization.id,
        userId: ctx.actor.id,
        requestKey: key,
        question: data.question,
        fieldId: data.fieldId,
        locale: data.locale,
        state: "running",
        reservationId: reservation?.id,
      })
      .returning();
    return row!;
  });
  if (request.answer) {
    const cited = Array.isArray(request.answer.facts) ? request.answer.facts as Fact[] : [];
    if (cited.some(previous => !facts.some(current =>
      current.id === previous.id && current.source === previous.source &&
      current.geometryVersion === previous.geometryVersion && current.text === previous.text
    ))) throw new DomainError(
      "SOURCES_CHANGED", "Bu yanıtın kaynakları değişti. Soruyu yeniden gönderin.", 409,
    );
    return request.answer;
  }
  if (request.id !== id)
    throw new DomainError(
      "REQUEST_PENDING",
      "Bu soru işleniyor veya tamamlanamadı. Yeni bir istek başlatabilirsiniz.",
      409,
    );
  try {
    const response = await model({
      question: data.question,
      facts,
      locale: data.locale,
      conversation: data.conversation,
    });
    const selection = selectionSchema.parse(response.selection);
    if (selection.factIds.some((id) => !facts.some((fact) => fact.id === id)))
      throw new DomainError(
        "UNSOURCED_RESPONSE",
        "Modelin kaynak seçimi doğrulanamadı; yanıt yayımlanmadı.",
        502,
      );
    const t = (tr: string, en: string) => (data.locale === "tr" ? tr : en);
    const answer = {
      model: response.model,
      topic: selection.topic,
      introduction: selection.reply ||
        (
        selection.topic === "agronomy"
          ? t(
              "Bu soru için doğrulanmış yöntem, ürün/bölge ve yeterli saha girdileri gerekir. Mevcut kayıtlarını aşağıda inceleyebilirsin.",
              "This question requires a validated method, crop/region and sufficient field inputs. You can review available records below.",
            )
          : selection.topic === "unsupported"
            ? t(
                "Bu soruya yetkili kayıtlarla kaynaklı bir yanıt veremiyorum.",
                "Authorized records do not support an answer to this question.",
              )
            : t(
                "Seçili parselin kaynaklı kayıtları:",
                "Sourced records for the selected parcel:",
              )),
      facts: selection.factIds.map((id) => facts.find((f) => f.id === id)!),
      suggestedAction: selection.suggestedAction,
      limitations: t(
        "Uydu indeksleri toprak nemi veya gübre dozu değildir. Kullanıcı kayıtları bağımsız ölçüm sayılmaz. Hiçbir kayıt değiştirilmedi.",
        "Satellite indices are not soil moisture or fertilizer dosage. User entries are not independently verified measurements. No records were changed.",
      ),
      usage: {
        inputTokens: response.inputTokens ?? null,
        outputTokens: response.outputTokens ?? null,
      },
    };
    await db.transaction(async (tx) => {
      await tx
        .update(assistantRequests)
        .set({ state: "completed", answer })
        .where(eq(assistantRequests.id, id));
      if (request.reservationId)
        await settleUsage(
          tx as unknown as CommercialDb,
          ctx.organization.id,
          request.reservationId,
          "consumed",
        );
    });
    return answer;
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .update(assistantRequests)
        .set({ state: "failed" })
        .where(eq(assistantRequests.id, id));
      if (request.reservationId)
        await settleUsage(
          tx as unknown as CommercialDb,
          ctx.organization.id,
          request.reservationId,
          "released",
        );
    });
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      "MODEL_REQUEST_FAILED",
      "Model yanıtı alınamadı. Hizmet erişimini veya bütçe sınırını kontrol edin.",
      502,
    );
  }
}
const taskPayload = z
  .object({
    fieldId: identifier,
    name: z.string().trim().min(1).max(150),
    date: localDate,
  })
  .strict();
const reportPayload = z
  .object({ analysisId: identifier, locale: z.enum(["tr", "en"]) })
  .strict();
export async function createProposal(
  db: CommercialDb,
  ctx: Context,
  input: unknown,
) {
  const envelope = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("task"), payload: taskPayload }),
      z.object({ kind: z.literal("report"), payload: reportPayload }),
    ])
    .parse(input);
  requirePermission(
    ctx,
    envelope.kind === "task" ? "record.write" : "report.create",
  );
  if (envelope.kind === "task")
    await ownField(db, ctx, envelope.payload.fieldId);
  const [row] = await db
    .insert(assistantProposals)
    .values({
      id: uid(),
      organizationId: ctx.organization.id,
      userId: ctx.actor.id,
      kind: envelope.kind,
      payload: envelope.payload,
      state: "pending",
      expiresAt: new Date(Date.now() + 86400000),
    })
    .returning();
  return row!;
}
export async function decideProposal(
  db: CommercialDb,
  ctx: Context,
  id: string,
  confirm: boolean,
  enforceQuota: boolean,
  reportDailyLimit?: number,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(assistantProposals)
      .where(
        and(
          eq(assistantProposals.id, id),
          eq(assistantProposals.organizationId, ctx.organization.id),
          eq(assistantProposals.userId, ctx.actor.id),
        ),
      )
      .for("update");
    if (!row) throw new DomainError("NOT_FOUND", "Taslak bulunamadı.", 404);
    if (row.state !== "pending")
      return { state: row.state, resultId: row.resultId, kind: row.kind };
    if (row.expiresAt <= new Date())
      throw new DomainError("EXPIRED_PROPOSAL", "Taslağın süresi doldu.", 409);
    let resultId: string | null = null;
    if (confirm && row.kind === "task") {
      requirePermission(ctx, "record.write");
      const payload = taskPayload.parse(row.payload);
      await ownField(tx as unknown as CommercialDb, ctx, payload.fieldId);
      resultId = uid();
      await tx.insert(farmRecords).values({
        id: resultId,
        organizationId: ctx.organization.id,
        kind: "task",
        body: JSON.stringify({
          ...payload,
          done: false,
          createdBy: ctx.actor.id,
          createdAt: new Date().toISOString(),
          proposalId: id,
        }),
      });
    } else if (confirm && row.kind === "report") {
      const report = await createReport(
        tx as unknown as CommercialDb,
        ctx,
        reportPayload.parse(row.payload),
        `proposal-${id}`,
        enforceQuota,
        reportDailyLimit,
      );
      resultId = report.id;
    }
    const state = confirm ? "confirmed" : "rejected";
    await tx
      .update(assistantProposals)
      .set({ state, resultId })
      .where(eq(assistantProposals.id, id));
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: ctx.organization.id,
      actorId: ctx.actor.id,
      action: `assistant.proposal_${state}`,
      resourceId: id,
    });
    return { state, resultId, kind: row.kind };
  });
}

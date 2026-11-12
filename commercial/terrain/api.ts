import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { geometryHash } from "../../server/analysis-jobs.js";
import { localDate } from "../../shared/contracts/commercial";
import type { WorkspaceRequest } from "../core/api";
import { DomainError } from "../core/errors";
import { auditLog, domainRecords } from "../db/schema";
import { requirePermission, uid } from "../organizations/service";
import { ownField } from "../records/service";
import { prepareTerrainLayer, type TerrainLayerKind } from "./raster";
import { maxTerrainBytes, terrainStorage, uploadExpiryMs, type TerrainStorage } from "./storage";

const kind = "terrain_dataset";
const route = /^\/api\/v1\/fields\/([a-f0-9]{32})\/terrain-datasets(?:\/([a-f0-9]{32})(?:\/(finish|(?:layers|upload)\/(?:ortho|dtm)))?)?$/;
const fileInput = z.object({ name: z.string().trim().min(1).max(180), bytes: z.number().int().min(16).max(maxTerrainBytes) }).strict();
const startInput = z.object({
  geometryVersion: z.string().regex(/^[a-f0-9]{64}$/),
  capturedOn: localDate,
  source: z.string().trim().min(1).max(160),
  ortho: fileInput,
  dtm: fileInput.optional(),
}).strict();
type Layer = Awaited<ReturnType<typeof prepareTerrainLayer>>["metadata"];
type Dataset = z.infer<typeof startInput> & {
  state: "uploading" | "processing" | "ready" | "failed";
  expires: number;
  lease?: number;
  attempt?: string;
  layers?: Partial<Record<TerrainLayerKind, Layer>>;
  error?: string;
};
const noStore = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const notFound = () => new DomainError("NOT_FOUND", "Drone veri seti bulunamadı.", 404);
const changed = () => new DomainError("GEOMETRY_CHANGED", "Parsel sınırı değişti. Yeniden yükleyip tekrar deneyin.", 409);
const publicDataset = (row: typeof domainRecords.$inferSelect) => {
  const { state, geometryVersion, capturedOn, source, layers, error, expires, lease, ortho, dtm } = row.data as Dataset;
  return { id: row.id, version: row.version, state, geometryVersion, capturedOn, source, layers, error, expires,
    canRetry: state === "processing" && Number(lease) <= Date.now(), ortho, dtm };
};

export async function terrainRoutes({ db, context, body, options, request, path, method }: WorkspaceRequest) {
  const matched = path.match(route);
  if (!matched) return;
  const [, fieldId, id, action] = matched as [string, string, string | undefined, string | undefined];
  const list = !id && !action;
  const upload = action?.startsWith("upload/");
  const readLayer = action?.startsWith("layers/");
  const finish = action === "finish";
  if (!(method === "GET" && (!action || readLayer) || method === "POST" && (list || finish) || method === "PUT" && upload)) return;
  requirePermission(context, method === "GET" ? "read" : "field.write");
  const field = await ownField(db, context, fieldId);
  const revision = geometryHash(field.geometry);
  const organizationId = context.organization.id;
  const scope = and(eq(domainRecords.organizationId, organizationId), eq(domainRecords.fieldId, fieldId),
    eq(domainRecords.kind, kind), isNull(domainRecords.deletedAt));
  const storage = terrainStorage();
  if (list && method === "GET") {
    const current = and(scope, sql`${domainRecords.data}->>'geometryVersion' = ${revision}`);
    const [ready, other] = await Promise.all([true, false].map(isReady =>
      db.select().from(domainRecords).where(and(current, isReady
        ? sql`${domainRecords.data}->>'state' = 'ready'`
        : sql`${domainRecords.data}->>'state' <> 'ready'`))
        .orderBy(desc(domainRecords.createdAt), desc(domainRecords.id)).limit(isReady ? 30 : 8)));
    return reply({ available: !!storage, datasets: [...ready!, ...other!].map(publicDataset) });
  }
  if (!storage) throw new DomainError("TERRAIN_STORAGE_UNAVAILABLE", "Özel drone dosya depolaması hazır değil.", 503);
  const root = (dataset: string) => ["terrain", organizationId, fieldId, dataset].join("/");
  if (list) {
    if (!field.geometry) throw new DomainError("GEOMETRY_REQUIRED", "Önce parsel sınırını çizin.", 422);
    const input = startInput.parse(body);
    if (input.geometryVersion !== revision) throw changed();
    const datasetId = uid();
    const data: Dataset = { ...input, state: "uploading", expires: Date.now() + uploadExpiryMs };
    const uploads = await Promise.all((["ortho", "dtm"] as const).filter(layer => input[layer]).map(async layer => ({
      layer,
      url: storage.direct ? await storage.sign(root(datasetId) + "/upload/" + layer, input[layer]!.bytes)
        : path + "/" + datasetId + "/upload/" + layer,
    })));
    const { row, expired } = await db.transaction(async tx => {
      await tx.execute(sql`select id from organizations where id=${organizationId} for update`);
      if (geometryHash((await ownField(tx, context, fieldId)).geometry) !== revision) throw changed();
      const old = await tx.select().from(domainRecords).where(and(scope,
        sql`${domainRecords.data}->>'state' = 'uploading' and
          ${domainRecords.data}->>'expires' < ${String(Date.now() - 60_000)}`)).limit(20);
      for (const pending of old) {
        await tx.update(domainRecords).set({ data: { ...pending.data, state: "failed", error: "Dosya yükleme süresi doldu." },
          updatedAt: new Date(), version: pending.version + 1 }).where(and(scope, eq(domainRecords.id, pending.id),
          eq(domainRecords.version, pending.version)));
      }
      const active = await tx.select({ id: domainRecords.id }).from(domainRecords).where(and(scope,
        sql`((${domainRecords.data}->>'state' = 'uploading' and ${domainRecords.data}->>'expires' >= ${String(Date.now() - 60_000)})
          or (${domainRecords.data}->>'state' = 'processing' and ${domainRecords.data}->>'lease' >= ${String(Date.now())}))`)).limit(4);
      if (active.length === 4) throw new DomainError("TERRAIN_UPLOAD_LIMIT", "Bu parselde dört yükleme devam ediyor.", 429);
      const [created] = await tx.insert(domainRecords).values({
        id: datasetId, organizationId, fieldId, kind, data, createdBy: context.actor.id,
      }).returning();
      return { row: created!, expired: old };
    });
    await Promise.allSettled(expired.flatMap(pending => (["ortho", "dtm"] as const).filter(layer => pending.data[layer])
      .map(layer => storage.remove(root(pending.id) + "/upload/" + layer))));
    return reply({ dataset: publicDataset(row), uploads }, 201);
  }

  const datasetScope = and(scope, eq(domainRecords.id, id!));
  const [row] = await db.select().from(domainRecords).where(datasetScope).limit(1);
  if (!row) throw notFound();
  const data = row.data as Dataset;
  if (data.geometryVersion !== revision) throw changed();
  const key = root(row.id);
  if (method === "GET" && !action) return reply({ dataset: publicDataset(row) });
  if (readLayer) {
    const layer = action!.split("/")[1] as TerrainLayerKind;
    if (data.state !== "ready" || !data.layers?.[layer] || !data.attempt) throw notFound();
    const bytes = await storage.derived.get(key + "/" + data.attempt + "/" + layer + ".png");
    return new Response(Buffer.from(bytes), { headers: { ...noStore, "Content-Type": "image/png" } });
  }
  if (upload) {
    if (row.createdBy !== context.actor.id || data.state !== "uploading" || Date.now() > data.expires) throw notFound();
    const layer = action!.split("/")[1] as TerrainLayerKind;
    if (!data[layer]) throw notFound();
    await storage.putLocal(key + "/upload/" + layer, data[layer].bytes, request);
    return reply({ ok: true });
  }
  if (row.createdBy !== context.actor.id) throw notFound();
  if (data.state === "ready" || data.state === "failed") return reply({ dataset: publicDataset(row) });
  if (data.state === "uploading" && Date.now() > data.expires + 60_000)
    throw new DomainError("TERRAIN_UPLOAD_EXPIRED", "Yükleme süresi doldu. Dosyaları yeniden seçin.", 409);
  if (data.state === "processing" && Number(data.lease) > Date.now()) return reply({ dataset: publicDataset(row) }, 202);

  const signal = AbortSignal.timeout(75_000);
  const attempt = uid();
  const processing: Dataset = { ...data, state: "processing", attempt, lease: Date.now() + 90_000 };
  const [claimed] = await db.update(domainRecords).set({ data: processing, updatedAt: new Date(), version: row.version + 1 })
    .where(and(datasetScope, eq(domainRecords.version, row.version))).returning();
  if (!claimed) return reply({ dataset: { ...publicDataset(row), state: "processing", canRetry: false } }, 202);
  const claim = and(datasetScope, eq(domainRecords.version, claimed.version));

  async function processLayers(privateFiles: TerrainStorage) {
    const generated: string[] = [];
    const layers: Partial<Record<TerrainLayerKind, Layer>> = {};
    let layer: TerrainLayerKind = "ortho";
    try {
      for (layer of ["ortho", "dtm"] as const) {
        const file = data[layer];
        if (!file) continue;
        const source = key + "/" + attempt + "/" + layer + ".tif";
        generated.push(source);
        await privateFiles.stage(key + "/upload/" + layer, source, file.bytes, signal);
        const tiff = await privateFiles.open(source, signal);
        try {
          const output = await prepareTerrainLayer(tiff, layer, field.geometry, signal);
          const outputKey = key + "/" + attempt + "/" + layer + ".png";
          generated.push(outputKey);
          await privateFiles.derived.put(outputKey, output.bytes, "image/png");
          layers[layer] = output.metadata;
        } finally {
          await tiff.close();
        }
      }
      const ready = await db.transaction(async tx => {
        await tx.execute(sql`select id from organizations where id=${organizationId} for update`);
        if (geometryHash((await ownField(tx, context, fieldId)).geometry) !== revision) throw changed();
        const [updated] = await tx.update(domainRecords).set({
          data: { ...processing, layers, state: "ready" }, version: claimed!.version + 1, updatedAt: new Date(),
        }).where(claim).returning();
        if (updated) await tx.insert(auditLog).values({ id: uid(), organizationId, actorId: context.actor.id,
          resourceId: row!.id, action: "terrain_dataset.ready" });
        return updated;
      });
      if (!ready) await Promise.allSettled(generated.map(name => privateFiles.remove(name)));
      else await Promise.allSettled((["ortho", "dtm"] as const).filter(item => data[item])
        .map(item => privateFiles.remove(key + "/upload/" + item)));
      return ready;
    } catch (error) {
      await Promise.allSettled(generated.map(name => privateFiles.remove(name)));
      const incomplete = error instanceof DomainError && error.code === "TERRAIN_UPLOAD_INCOMPLETE";
      const failure: Dataset = incomplete ? { ...data, state: "uploading" } : {
        ...processing,
        state: "failed",
        error: (layer === "ortho" ? "Ortomozaik" : "Arazi modeli") + " · " +
          (error instanceof DomainError ? error.message : "GeoTIFF işlenemedi. COG ve koordinat ayarlarını kontrol edin."),
      };
      const [updated] = await db.update(domainRecords).set({ data: failure, updatedAt: new Date(), version: claimed!.version + 1 })
        .where(claim).returning();
      if (incomplete) throw error;
      if (updated) await Promise.allSettled((["ortho", "dtm"] as const).filter(item => data[item])
        .map(item => privateFiles.remove(key + "/upload/" + item)));
      return updated;
    }
  }

  const work = processLayers(storage);
  if (options.background) {
    options.background(work.catch(() => {}));
    return reply({ dataset: publicDataset(claimed) }, 202);
  }
  const completed = await work;
  return completed ? reply({ dataset: publicDataset(completed) }) : reply({ dataset: publicDataset(claimed) }, 202);
}

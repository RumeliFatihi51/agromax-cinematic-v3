import { createHash } from "node:crypto";
import { validateGeometry } from "../shared/geometry.js";
import { fetchImage, fetchSpatialRaster, comparisonRange } from "./satellite.js";
import { parcelSatelliteStatus, openRasterImage } from "./parcel-satellite.js";
import { readOpenSentinel } from "./open-sentinel.js";
import { openSentinelMethod, openSentinelProvider } from "../shared/open-sentinel.js";
import { geometryHash } from "./analysis-jobs.js";
import { isISODate } from "../shared/dates.js";
export function prepareField(body, existing = {}) {
  const name = String(body.name ?? existing.name ?? "").trim();
  if (!name || name.length > 150)
    throw new Error("Tarla adı 1–150 karakter olmalı.");
  const next = {
    ...existing,
    name,
    crop: String(body.crop ?? existing.crop ?? "").slice(0, 100),
    location: String(body.location ?? existing.location ?? "").slice(0, 150),
    notes: String(body.notes ?? existing.notes ?? "").slice(0, 4000),
    updatedAt: new Date().toISOString(),
  };
  if (body.sowingDate !== undefined) {
    if (body.sowingDate !== "" && !isISODate(body.sowingDate))
      throw new Error("Geçerli bir ekim tarihi girin.");
    if (body.sowingDate) next.sowingDate = body.sowingDate;
    else delete next.sowingDate;
  }
  if (body.geometry) Object.assign(next, validateGeometry(body.geometry));
  else if (existing.geometry)
    Object.assign(next, validateGeometry(existing.geometry));
  else {
    const area = Number(body.area ?? existing.area);
    if (!Number.isFinite(area) || area <= 0)
      throw new Error("Çizilmiş sınır veya geçerli alan bilgisi gerekli.");
    Object.assign(next, { area, areaSource: "user" });
  }
  return next;
}
export async function fieldRoutes({
  req,
  body,
  session,
  db,
  reply,
  res,
  analysisService,
}) {
  if (req.url === "/api/satellite/status") {
    reply(200, parcelSatelliteStatus());
    return true;
  }
  const match = req.url.match(
    /^\/api\/records\/([a-f0-9]+)(?:\/(analysis|image|restore|revisions))?$/,
  );
  if (!match) return false;
  const [, id, operation] = match;
  const row = await db
    .prepare("SELECT * FROM records WHERE id=? AND user_id=?")
    .get(id, session.id);
  if (!row) {
    reply(404, { error: "Tarla bulunamadı." });
    return true;
  }
  if (row.kind !== "field") return false;
  const field = JSON.parse(row.body);
  async function updateField(next, action) {
    const version = Number(field.version || 1);
    if (body?.version !== undefined && body.version !== version)
      throw Object.assign(new Error("Parsel değişti. Yeniden yükleyerek tekrar deneyin."), { status: 409 });
    next.version = version + 1;
    next.geometryVersion = geometryHash(next.geometry);
    next.updatedAt = new Date().toISOString();
    await db.transaction(async tx => {
      const update = await tx.prepare("UPDATE records SET body=? WHERE id=? AND user_id=? AND body=?")
        .run(JSON.stringify(next), id, session.id, row.body);
      if (update.changes !== 1)
        throw Object.assign(new Error("Parsel değişti. Yeniden yükleyerek tekrar deneyin."), { status: 409 });
      const priorHash = geometryHash(field.geometry);
      const revision = tx.prepare("INSERT INTO field_revisions(field_id,user_id,version,action,geometry_hash,changed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(field_id,version) DO NOTHING");
      await revision.run(id, session.id, version, "snapshot", priorHash, field.updatedAt || field.createdAt || null);
      await revision.run(id, session.id, next.version, action, next.geometryVersion, next.updatedAt);
      if (next.geometryVersion !== priorHash)
        await tx.prepare("DELETE FROM analyses WHERE field_id=?").run(id);
    });
  }
  if (operation === "restore" && req.method === "POST") {
    const next = { ...field };
    delete next.deletedAt;
    try {
      if (field.deletedAt) await updateField(next, "restore");
      reply(200, { ...next, id, kind: "field" });
    } catch (error) {
      if (!error.status) throw error;
      reply(error.status, { error: error.message });
    }
    return true;
  }
  if (operation === "revisions" && req.method === "GET") {
    const revisions = await db.prepare("SELECT version,action,geometry_hash,changed_at FROM field_revisions WHERE field_id=? AND user_id=? ORDER BY version DESC LIMIT 100").all(id, session.id);
    reply(200, { revisions: revisions.length ? revisions.map(row => ({
      version: row.version, action: row.action, geometryVersion: row.geometry_hash, changedAt: row.changed_at,
    })) : [{ version: field.version || 1, action: "snapshot", geometryVersion: geometryHash(field.geometry),
      changedAt: field.updatedAt || field.createdAt || null }] });
    return true;
  }
  if (
    field.deletedAt &&
    !(operation === "image" && req.method === "POST" && body.analysisId)
  ) {
    reply(404, { error: "Tarla silinmiş." });
    return true;
  }
  if (!operation && req.method === "PATCH") {
    let next;
    try {
      next = prepareField(body, field);
    } catch (e) {
      reply(400, { error: e.message });
      return true;
    }
    try {
      await updateField(next, "update");
      reply(200, { ...next, id, kind: "field" });
    } catch (error) {
      if (!error.status) throw error;
      reply(error.status, { error: error.message });
    }
    return true;
  }
  if (!operation && req.method === "DELETE") {
    try {
      const next = { ...field, deletedAt: new Date().toISOString() };
      await updateField(next, "delete");
      reply(200, { ok: true, version: next.version });
    } catch (error) {
      if (!error.status) throw error;
      reply(error.status, { error: error.message });
    }
    return true;
  }
  if (operation === "analysis") {
    const cached = await db
      .prepare("SELECT body,geometry_hash FROM analyses WHERE field_id=?")
      .get(id);
    const hash = createHash("sha256")
      .update(JSON.stringify(field.geometry || null))
      .digest("hex");
    const saved = cached?.geometry_hash === hash ? JSON.parse(cached.body) : null;
    const status = parcelSatelliteStatus();
    const currentCache = saved?.range?.split === comparisonRange().split &&
      saved?.provider === status.provider &&
      saved?.method === (status.provider === openSentinelProvider ? openSentinelMethod : "s2-l2a-v3");
    if (req.method === "GET") {
      reply(200, {
        analysis: saved,
        status,
      });
      return true;
    }
    if (req.method === "POST") {
      if (!field.geometry) {
        reply(400, {
          error: "Uydu analizi için önce haritadan parsel sınırı çizin.",
        });
        return true;
      }
      if (!status.configured) {
        reply(503, {
          error:
            "Uydu analizi için açık arşiv veya yetkili Sentinel Hub bağlantısı gerekli.",
        });
        return true;
      }
      // A short cache avoids accidental double spending of provider quota.
      if (
        currentCache &&
        Date.now() - Date.parse(saved.fetchedAt) < 300000
      ) {
        reply(200, {
          analysis: saved,
          status,
        });
        return true;
      }
      try {
        const job = await analysisService.enqueue(session.id, id);
        reply(202, { job, status });
      } catch (e) {
        reply(e.status || 502, { error: e.message });
      }
      return true;
    }
  }
  if (operation === "image" && req.method === "POST") {
    if (!field.geometry) {
      reply(400, { error: "Parsel sınırı eksik." });
      return true;
    }
    try {
      const { analysis, geometry } = await imageAnalysis(
        db,
        session.id,
        id,
        body.analysisId,
        field,
      );
      const scene = analysis.scenes
        ?.filter((s) => s.properties?.datetime?.slice(0, 10) === body.date)
        .sort((a, b) =>
          b.properties.datetime.localeCompare(a.properties.datetime),
        )[0];
      if (!scene)
        throw Object.assign(
          new Error(
            "Görüntü için bu analizin katalogdaki çekim tarihlerinden birini seçin.",
          ),
          { status: 400 },
        );
      const day = analysis.observations.find(
        (o) =>
          Date.parse(scene.properties.datetime) >= Date.parse(o.from) &&
          Date.parse(scene.properties.datetime) < Date.parse(o.to),
      );
      const layer = body.layer || (analysis.provider === openSentinelProvider ? "NDVI" : "RGB");
      const open = analysis.provider === openSentinelProvider;
      let openRaster;
      if (open) {
        if (!Number.isFinite(day?.stats?.[layer]?.mean)) {
          reply(422, { error: "Bu tarih ve indeks için geçerli gözlem kaydı yok." });
          return true;
        }
        openRaster = await readOpenSentinel(geometry, scene.id, layer, analysis.resolution);
      }
      if (body.format === "values") {
        if (!body.analysisId || geometryHash(geometry) !== geometryHash(field.geometry)) {
          reply(409, { error: "Sayısal katman güncel parsel sınırına ait olmalı." });
          return true;
        }
        if (!Number.isFinite(day?.stats?.[body.layer]?.mean)) {
          reply(422, { error: "Bu tarih ve indeks için geçerli gözlem kaydı yok." });
          return true;
        }
        const raster = openRaster || await fetchSpatialRaster(geometry, layer, day);
        reply(200, { ...raster, geometryHash: geometryHash(geometry), date: body.date,
          analysisId: body.analysisId, source: analysis.source, analysisMethod: analysis.method });
        return true;
      }
      const scale = day?.stats?.[layer];
      const { image, bounds, legend, validPixels, totalPixels } =
        openRaster ? openRasterImage(openRaster) : await fetchImage(geometry, body.date, layer, {
          scale,
          timeRange: day ? { from: day.from, to: day.to } : undefined,
        });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Image-Bounds", JSON.stringify(bounds));
      res.setHeader(
        "X-Image-Legend",
        encodeURIComponent(JSON.stringify(legend)),
      );
      res.setHeader(
        "X-Image-Interval",
        JSON.stringify(day ? { from: day.from, to: day.to } : null),
      );
      res.setHeader("X-Valid-Pixels", validPixels);
      res.setHeader("X-Total-Pixels", totalPixels);
      res.statusCode = 200;
      res.end(image);
    } catch (e) {
      reply(e.status || 502, { error: e.message });
    }
    return true;
  }
  return false;
}
export async function imageAnalysis(db, userId, fieldId, analysisId, field) {
  if (
    !(await db
      .prepare(
        "SELECT id FROM records WHERE id=? AND user_id=? AND kind='field'",
      )
      .get(fieldId, userId))
  )
    throw Object.assign(new Error("Parsel bulunamadı."), { status: 404 });
  let analysis, geometry;
  if (analysisId) {
    const row = await db
      .prepare(
        "SELECT result,snapshot FROM analysis_jobs WHERE id=? AND user_id=? AND field_id=? AND state='completed'",
      )
      .get(String(analysisId), userId, fieldId);
    if (!row?.result)
      throw Object.assign(new Error("Analiz kaydı bulunamadı."), {
        status: 404,
      });
    analysis = JSON.parse(row.result);
    geometry = JSON.parse(row.snapshot).field.geometry;
  } else {
    const row = await db
      .prepare("SELECT body,geometry_hash FROM analyses WHERE field_id=?")
      .get(fieldId);
    const hash = createHash("sha256")
      .update(JSON.stringify(field.geometry || null))
      .digest("hex");
    if (!row || row.geometry_hash !== hash)
      throw Object.assign(
        new Error("Bu parsel sınırı için doğrulanmış analiz yok."),
        { status: 422 },
      );
    analysis = JSON.parse(row.body);
    geometry = field.geometry;
  }
  if (analysis.provider === openSentinelProvider && analysis.method === openSentinelMethod)
    return { analysis, geometry };
  if (
    analysis.method !== "s2-l2a-v3" ||
    analysis.provider !== process.env.SENTINEL_PROVIDER
  )
    throw Object.assign(
      new Error(
        "Bu analiz sürümü veya veri kaynağı mevcut görüntü işleme yöntemiyle eşleşmiyor.",
      ),
      { status: 422 },
    );
  return { analysis, geometry };
}

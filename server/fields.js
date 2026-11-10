import { createHash } from "node:crypto";
import { validateGeometry } from "../shared/geometry.js";
import { fetchImage, fetchSpatialRaster, comparisonRange } from "./satellite.js";
import { parcelSatelliteStatus, openRasterImage } from "./parcel-satellite.js";
import { readOpenSentinel } from "./open-sentinel.js";
import { openSentinelMethod, openSentinelProvider } from "../shared/open-sentinel.js";
import { geometryHash } from "./analysis-jobs.js";
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
    /^\/api\/records\/([a-f0-9]+)(?:\/(analysis|image|restore))?$/,
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
  if (operation === "restore" && req.method === "POST") {
    delete field.deletedAt;
    await db
      .prepare("UPDATE records SET body=? WHERE id=?")
      .run(JSON.stringify(field), id);
    reply(200, { ...field, id, kind: "field" });
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
    try {
      const next = prepareField(body, field);
      await db
        .prepare("UPDATE records SET body=? WHERE id=?")
        .run(JSON.stringify(next), id);
      if (JSON.stringify(next.geometry) !== JSON.stringify(field.geometry))
        await db.prepare("DELETE FROM analyses WHERE field_id=?").run(id);
      reply(200, { ...next, id, kind: "field" });
    } catch (e) {
      reply(400, { error: e.message });
    }
    return true;
  }
  if (!operation && req.method === "DELETE") {
    await db
      .prepare("UPDATE records SET body=? WHERE id=?")
      .run(
        JSON.stringify({ ...field, deletedAt: new Date().toISOString() }),
        id,
      );
    reply(200, { ok: true });
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

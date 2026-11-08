import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { localDate } from "../../shared/contracts/commercial";
import type { CommercialDb } from "../db/store";
import { requirePermission, type Context } from "../organizations/service";
import { ownField } from "../records/service";
import { observationCache } from "../db/schema";
import { fetchObservations, fetchRadarStatistics, satelliteStatus, ProviderError } from "../../server/satellite.js";
import { geometryHash } from "../../server/analysis-jobs.js";
import { DomainError } from "../core/errors";
import { landsatProduct, landsatSource, landsatMethod, landsatRasterEnabled, searchLandsat, stacSource } from "./landsat";
export const observationInput = z
  .object({
    fieldId: z.string().min(1).max(100),
    start: localDate,
    end: localDate,
    radarOrbit: z.enum(["ASCENDING", "DESCENDING"]).optional(),
    landsat: landsatProduct.optional(),
    processLatest: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.end >= v.start &&
      Date.parse(v.end) - Date.parse(v.start) <= 92 * 86400000,
    "Observation search must cover at most 93 days",
  ).refine((value) => !(value.radarOrbit && value.landsat) && (!value.processLatest || !!value.landsat),
    "Bir gözlem kaynağı seçin.");
export async function searchObservations(
  db: CommercialDb,
  ctx: Context,
  input: unknown,
) {
  const data = observationInput.parse(input),
    field = await ownField(db, ctx, data.fieldId);
  if (data.radarOrbit) {
    requirePermission(ctx, "calculate");
    if (Date.parse(data.end) - Date.parse(data.start) > 6 * 86400000)
      throw new DomainError("INVALID_RANGE", "Radar sorgusu en fazla yedi gün kapsar.");
    if (data.end >= new Date().toISOString().slice(0, 10))
      throw new DomainError("FUTURE_RANGE", "Radar sorgusu tamamlanmış UTC günleri gerektirir.");
  }
  if (data.processLatest) requirePermission(ctx, "calculate");
  if (!field.geometry)
    throw new DomainError(
      "GEOMETRY_REQUIRED",
      "Önce parsel sınırını çizin.",
      422,
    );
  if (data.start > new Date().toISOString().slice(0, 10))
    throw new DomainError("FUTURE_RANGE", "Gelecekteki çekimler aranamaz.");
  if (!data.landsat && !satelliteStatus().configured)
    throw new DomainError(
      "PROVIDER_UNAVAILABLE",
      "Uydu veri bağlantısı etkin değil.",
      503,
    );
  const hash = geometryHash(field.geometry),
    key = createHash("sha256")
      .update(
        JSON.stringify([
          ctx.organization.id,
          data,
          hash,
          process.env.SENTINEL_PROVIDER,
          data.landsat ? `${landsatMethod}:${landsatRasterEnabled()}` : data.radarOrbit ? "s1-grd-gamma0-terrain-v1" : "catalog-v1",
        ]),
      )
      .digest("hex");
  const [cached] = await db
    .select()
    .from(observationCache)
    .where(eq(observationCache.key, key));
  if (cached && cached.expiresAt > new Date())
    return { ...cached.body, cache: "hit" };
  const range = {
      from: data.start + "T00:00:00Z",
      to: new Date(Date.parse(data.end) + 86400000).toISOString(),
  };
  const provider = data.landsat ? "usgs-landsat" : data.radarOrbit ? "cdse-sentinel-1" : "sentinel-catalog";
  let landsat: Record<string, unknown> | undefined;
  if (data.landsat) {
    const { items, truncated } = await searchLandsat(field.geometry, range, data.landsat);
    const available = landsatRasterEnabled();
    let raster;
    if (data.processLatest && available && items[0]) {
      const { analyzeLandsatRaster } = await import("./landsat-raster");
      raster = await analyzeLandsatRaster(items[0], field.geometry as Parameters<typeof analyzeLandsatRaster>[1]);
    }
    landsat = {
      kind: "observation_metadata",
      source: landsatSource, sourceURL: stacSource, methodVersion: landsatMethod,
      fetchedAt: new Date().toISOString(),
      scenes: items.map(({ id, properties }) => ({
        id,
        properties: {
          datetime: properties.datetime,
          "eo:cloud_cover": properties["eo:cloud_cover"],
          platform: id.startsWith("LC08") ? "Landsat 8" : "Landsat 9",
        },
      })),
      raster, rasterAccess: available ? "configured" : "unavailable", truncated,
    };
  }
  let observation: Record<string, unknown>;
  try {
    observation = landsat ?? (data.radarOrbit
      ? await fetchRadarStatistics(field.geometry, range, data.radarOrbit)
      : {
          scenes: await fetchObservations(field.geometry, range),
          source: "Copernicus Sentinel-2 L2A catalog",
          sourceURL:
            "https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Catalog.html",
          kind: "observation_metadata",
          fetchedAt: new Date().toISOString(),
          methodVersion: "s2-catalog-v1",
        });
  } catch (error) {
    if (error instanceof ProviderError)
      throw new DomainError("SATELLITE_PROVIDER_ERROR", error.message, error.status);
    throw error;
  }
  const body = { fieldId: field.id, geometryVersion: hash, range, ...observation };
  await db
    .insert(observationCache)
    .values({
      key,
      organizationId: ctx.organization.id,
      fieldId: field.id,
      provider,
      geometryVersion: hash,
      body,
      expiresAt: new Date(Date.now() + 900000),
    })
    .onConflictDoUpdate({
      target: observationCache.key,
      set: {
        body,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + 900000),
      },
    });
  return { ...body, cache: "miss" };
}

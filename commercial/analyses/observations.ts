import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { localDate } from "../../shared/contracts/commercial";
import type { CommercialDb } from "../db/store";
import type { Context } from "../organizations/service";
import { ownField } from "../records/service";
import { observationCache } from "../db/schema";
import { fetchObservations, satelliteStatus } from "../../server/satellite.js";
import { geometryHash } from "../../server/analysis-jobs.js";
import { DomainError } from "../core/errors";
export const observationInput = z
  .object({
    fieldId: z.string().min(1).max(100),
    start: localDate,
    end: localDate,
  })
  .strict()
  .refine(
    (v) =>
      v.end >= v.start &&
      Date.parse(v.end) - Date.parse(v.start) <= 92 * 86400000,
    "Observation search must cover at most 93 days",
  );
export async function searchObservations(
  db: CommercialDb,
  ctx: Context,
  input: unknown,
) {
  const data = observationInput.parse(input),
    field = await ownField(db, ctx, data.fieldId);
  if (!field.geometry)
    throw new DomainError(
      "GEOMETRY_REQUIRED",
      "Önce parsel sınırını çizin.",
      422,
    );
  if (data.start > new Date().toISOString().slice(0, 10))
    throw new DomainError("FUTURE_RANGE", "Gelecekteki çekimler aranamaz.");
  if (!satelliteStatus().configured)
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
          "catalog-v1",
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
    },
    scenes = await fetchObservations(field.geometry, range);
  const body = {
    fieldId: field.id,
    geometryVersion: hash,
    range,
    scenes,
    source: "Copernicus Sentinel-2 L2A catalog",
    sourceURL:
      "https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Catalog.html",
    kind: "observation_metadata",
    fetchedAt: new Date().toISOString(),
    methodVersion: "s2-catalog-v1",
  };
  await db
    .insert(observationCache)
    .values({
      key,
      organizationId: ctx.organization.id,
      fieldId: field.id,
      provider: "sentinel-catalog",
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

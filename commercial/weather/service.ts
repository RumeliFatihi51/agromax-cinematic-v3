import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ownField } from "../records/service";
import type { CommercialDb } from "../db/store";
import type { Context } from "../organizations/service";
import { observationCache } from "../db/schema";
import { boundsOf } from "../../server/satellite.js";
import { fetchPower, historyInput } from "./power";
import { DomainError } from "../core/errors";
import { geometryHash } from "../../server/analysis-jobs.js";
export async function historicalWeather(
  db: CommercialDb,
  ctx: Context,
  fieldId: string,
  input: unknown,
) {
  const range = historyInput.parse(input),
    field = await ownField(db, ctx, fieldId);
  if (!field.geometry)
    throw new DomainError("GEOMETRY_REQUIRED", "Parsel sınırı gerekli.", 422);
  const hash = geometryHash(field.geometry),
    key = createHash("sha256")
      .update(
        JSON.stringify([ctx.organization.id, fieldId, hash, range, "power-v1"]),
      )
      .digest("hex");
  const [cached] = await db
    .select()
    .from(observationCache)
    .where(eq(observationCache.key, key));
  if (cached && cached.expiresAt > new Date())
    return { ...cached.body, cache: "hit" };
  const bounds = boundsOf(field.geometry),
    point = {
      lat: (bounds[1] + bounds[3]) / 2,
      lng: (bounds[0] + bounds[2]) / 2,
    };
  const data = await fetchPower(point, range);
  const body = {
    ...data,
    fieldId,
    geometryVersion: hash,
    pointMethod: "WGS84 parsel sınırlayıcı kutusunun orta noktası",
  };
  await db
    .insert(observationCache)
    .values({
      key,
      provider: "nasa-power",
      fieldId,
      organizationId: ctx.organization.id,
      geometryVersion: hash,
      body,
      expiresAt: new Date(Date.now() + 86400000),
    })
    .onConflictDoUpdate({
      target: observationCache.key,
      set: {
        body,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  return { ...body, cache: "miss" };
}

import { z } from "zod";
import { DomainError } from "../core/errors";

export const landsatProduct = z.enum(["reflectance", "temperature"]);
type Product = z.infer<typeof landsatProduct>;
export const landsatSource = "USGS Landsat 8/9 Collection 2 Level-2";
export const landsatMethod = "landsat-c2l2-native-grid-v1";
export const stacSource = "https://www.usgs.gov/landsat-missions/spatiotemporal-asset-catalog-stac";
const collection = { reflectance: "landsat-c2l2-sr", temperature: "landsat-c2l2-st" };
const itemSchema = z.object({
  id: z.string().regex(/^LC0[89]_L2S[PR]_[0-9_]+T[12]_(SR|ST)$/),
  collection: z.enum(["landsat-c2l2-sr", "landsat-c2l2-st"]),
  properties: z.object({
    datetime: z.iso.datetime(),
    "eo:cloud_cover": z.number().min(0).max(100).optional(),
    "proj:epsg": z.number().int().optional(),
  }),
  assets: z.record(z.string(), z.object({
    alternate: z.object({ s3: z.object({ href: z.string() }).optional() }).optional(),
  })),
});
export type LandsatItem = z.infer<typeof itemSchema>;

export async function searchLandsat(
  geometry: unknown,
  range: { from: string; to: string },
  product: Product,
  fetcher: typeof fetch = fetch,
) {
  const signal = AbortSignal.timeout(8000);
  let response: Response;
  try {
    response = await fetcher("https://landsatlook.usgs.gov/stac-server/search", {
      method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collections: [collection[product]],
        datetime: `${range.from}/${range.to}`, intersects: geometry, limit: 50,
        sortby: [{ field: "properties.datetime", direction: "desc" }],
      }),
    });
  } catch {
    throw new DomainError("PROVIDER_UNAVAILABLE", "USGS Landsat kataloğuna bağlanılamadı.", 502);
  }
  if (!response.ok)
    throw new DomainError("PROVIDER_UNAVAILABLE", "USGS Landsat kataloğu isteği tamamlanamadı.", response.status === 429 ? 429 : 502);
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data?.features) || data.features.length > 50)
    throw new DomainError("INVALID_PROVIDER_RESPONSE", "USGS katalog yanıtı doğrulanamadı.", 502);
  const items = (data.features as unknown[]).flatMap((feature) => {
    const result = itemSchema.safeParse(feature);
    if (!result.success || result.data.collection !== collection[product]) return [];
    const instant = Date.parse(result.data.properties.datetime);
    return instant >= Date.parse(range.from) && instant < Date.parse(range.to) ? [result.data] : [];
  }).sort((a, b) => Date.parse(b.properties.datetime) - Date.parse(a.properties.datetime));
  return {
    items,
    truncated: Array.isArray(data.links) && data.links.some((link: { rel?: string }) => link?.rel === "next"),
  };
}

export const landsatRasterEnabled = () => process.env.AGROMAX_LANDSAT_AWS_ENABLED === "true";

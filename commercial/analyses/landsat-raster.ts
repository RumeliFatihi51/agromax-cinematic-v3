import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromUrl } from "geotiff";
import proj4 from "proj4";
import { DomainError } from "../core/errors";
import { landsatMethod, type LandsatItem } from "./landsat";

type Point = [number, number];
type Polygons = Point[][][];
type Geometry = { type: "Polygon"; coordinates: Point[][] } | { type: "MultiPolygon"; coordinates: Polygons };
const requesterHeader = "x-amz-request-payer";

export function landsatPixel(qa: number, saturation: number, sample: number, nir?: number) {
  if (!Number.isInteger(qa) || qa < 0 || qa > 65535 || (qa & 63) !== 0 ||
    saturation !== 0 || !Number.isInteger(sample) || sample <= 0 || sample > 65535)
    return null;
  if (nir === undefined) return { surfaceTemperatureK: sample * 0.00341802 + 149 };
  if (sample > 65455 || !Number.isInteger(nir) || nir <= 0 || nir > 65455) return null;
  const red = sample * 0.0000275 - 0.2;
  const infrared = nir * 0.0000275 - 0.2;
  const ndvi = red >= 0 && infrared >= 0 && red + infrared > 0 ? (infrared - red) / (infrared + red) : null;
  return { red, infrared, ndvi };
}

function inside([x, y]: Point, ring: Point[]) {
  let included = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]!, [bx, by] = ring[j]!;
    if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay))
      included = !included;
  }
  return included;
}

export async function analyzeLandsatRaster(item: LandsatItem, geometry: Geometry) {
  const epsg = item.properties["proj:epsg"];
  if (!epsg || !/^(326|327)(0[1-9]|[1-5][0-9]|60)$/.test(String(epsg)))
    throw new DomainError("UNSUPPORTED_CRS", "Bu Landsat sahnesinin UTM koordinat sistemi desteklenmiyor.", 422);
  const temperature = item.collection === "landsat-c2l2-st";
  const bands = ["qa_pixel", "qa_radsat", ...(temperature ? ["lwir11"] : ["red", "nir08"])];
  const paths = bands.map((band) => {
    const asset = item.assets[band]?.alternate?.s3?.href;
    if (!asset || !/^s3:\/\/usgs-landsat\/collection02\/level-2\/standard\/[a-zA-Z0-9_/.-]+\.TIF$/i.test(asset))
      throw new DomainError("ASSET_UNAVAILABLE", "Landsat sahnesinin gerekli COG bantları eksik.", 422);
    return asset.slice("s3://usgs-landsat/".length);
  });
  const projection = `+proj=utm +zone=${epsg % 100} ${epsg >= 32700 ? "+south " : ""}+datum=WGS84 +units=m +no_defs`;
  const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates)
    .map((polygon) => polygon.map((ring) => ring.map((point) => proj4("EPSG:4326", projection, point) as Point)));
  const points = polygons.flat(2);
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
  const signal = AbortSignal.timeout(20_000);
  const s3 = new S3Client({ region: "us-west-2", maxAttempts: 1 });
  try {
    const images = await Promise.all(paths.map(async (Key) => {
      const url = await getSignedUrl(s3, new GetObjectCommand({
        Bucket: "usgs-landsat", Key, RequestPayer: "requester",
      }), { expiresIn: 120, unhoistableHeaders: new Set([requesterHeader]) });
      const tiff = await fromUrl(url, {
        allowFullFile: false, maxRanges: 0,
        headers: { [requesterHeader]: "requester" },
      }, signal);
      return tiff.getImage();
    }));
    const image = images[0]!;
    const grid = (entry: typeof image) => [
      entry.getGeoKeys()?.ProjectedCSTypeGeoKey,
      entry.getWidth(), entry.getHeight(), ...entry.getOrigin(), ...entry.getResolution(),
    ];
    const shape = grid(image);
    const [ox, oy] = image.getOrigin(), [dx, dy] = image.getResolution();
    if (shape[0] !== epsg || dx !== 30 || dy !== -30 ||
      images.some((entry) => grid(entry).some((value, i) => value !== shape[i])))
      throw new DomainError("INVALID_RASTER_GRID", "Landsat bantlarının 30 m ızgaraları uyuşmuyor.", 422);
    const x0 = Math.max(0, Math.floor((Math.min(...xs) - ox!) / dx));
    const y0 = Math.max(0, Math.floor((Math.max(...ys) - oy!) / dy));
    const x1 = Math.min(image.getWidth(), Math.ceil((Math.max(...xs) - ox!) / dx));
    const y1 = Math.min(image.getHeight(), Math.ceil((Math.min(...ys) - oy!) / dy));
    if (x1 <= x0 || y1 <= y0)
      throw new DomainError("NO_COVERAGE", "Bu sahne parseli kapsamıyor.", 422);
    if ((x1 - x0) * (y1 - y0) * points.length > 20_000_000)
      throw new DomainError("WINDOW_TOO_LARGE", "Parsel penceresi bu Landsat işlemi için çok büyük.", 422);
    const data = await Promise.all(images.map((entry) => entry.readRasters({
      window: [x0, y0, x1, y1], samples: [0], interleave: true, signal,
    })));
    let covered = 0, valid = 0;
    const sums = new Map<string, { count: number; sum: number }>();
    for (let row = y0; row < y1; row++) {
      for (let col = x0; col < x1; col++) {
        const point: Point = [ox! + (col + 0.5) * dx, oy! + (row + 0.5) * dy];
        if (!polygons.some(([shell, ...holes]) => inside(point, shell!) && !holes.some((hole) => inside(point, hole))))
          continue;
        covered++;
        const i = (row - y0) * (x1 - x0) + col - x0;
        const sample = landsatPixel(data[0]![i]!, data[1]![i]!, data[2]![i]!, data[3]?.[i]);
        if (!sample) continue;
        valid++;
        for (const [metric, value] of Object.entries(sample)) {
          if (value === null) continue;
          const current = sums.get(metric) ?? { count: 0, sum: 0 };
          sums.set(metric, { count: current.count + 1, sum: current.sum + value });
        }
      }
    }
    return {
      state: valid ? "available" : covered ? "masked" : "no_coverage",
      sceneId: item.id,
      date: item.properties.datetime,
      methodVersion: landsatMethod,
      gridMetres: 30,
      thermalNativeResolutionMetres: temperature ? 100 : null,
      coveredPixels: covered,
      validPixels: valid,
      means: Object.fromEntries([...sums].map(([metric, { count, sum }]) => [metric, { mean: sum / count, count }])),
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("ASSET_UNAVAILABLE", "Yetkili Landsat COG dosyaları okunamadı. S3 erişimi ve kota durumunu kontrol edin.", 503);
  } finally {
    s3.destroy();
  }
}

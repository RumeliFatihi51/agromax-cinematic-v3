import proj4 from "proj4";
import { setTimeout as delay } from "node:timers/promises";
import { containsPoint, geometryBounds, pixelBounds, rasterGrid, unproject } from "../shared/spatial.js";
import { openSentinelBands, openSentinelMethod, openSentinelMetrics, openSentinelProvider, openSentinelSource } from "../shared/open-sentinel.js";

const endpoint = "https://earth-search.aws.element84.com/v1";
const collection = "sentinel-2-c1-l2a";
const archive = "https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com";
const sceneId = /^S2[A-D]_T\d{2}[A-Z]{3}_\d{8}T\d{6}_L2A$/;
const monthPattern = /^20\d{2}-(?:0[1-9]|1[0-2])$/;
const assetFiles = { scl: "SCL", ...Object.fromEntries(Object.entries(openSentinelBands).map(([band, key]) => [key, band])) };
const sourceResolution = { red: 10, green: 10, blue: 10, nir: 10, coastal: 60, nir09: 60 };
// These formulas are fixed application constants, never provider or user input.
const calculate = new Map(openSentinelMetrics.map(metric => [metric.id, new Function("s", "return " + metric.formula)]));
const clearClasses = new Set([4, 5, 6]);
let active = 0;

function fail(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

async function limited(work) {
  if (active >= 6) throw fail("Uydu arşivi meşgul. Biraz sonra yeniden dene.", 429);
  active++;
  try { return await work(); }
  finally { active--; }
}

async function stac(path, signal) {
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(endpoint + path, { signal, redirect: "error", headers: { accept: "application/geo+json, application/json" } });
    } catch {
      if (signal.aborted || attempt) throw fail("Earth Search kataloğuna ulaşılamadı.");
    }
    if (response && (response.status < 500 && response.status !== 429 || attempt)) break;
    if (response?.body) await response.body.cancel();
    response = undefined;
    await delay(500, undefined, { signal });
  }
  if (!response.ok) throw fail("Earth Search isteği tamamlanamadı.", response.status === 404 ? 404 : response.status === 429 ? 429 : 502);
  try { return await response.json(); }
  catch { throw fail("Earth Search geçerli katalog verisi döndürmedi."); }
}

function publicScene(item) {
  const instant = item?.properties?.datetime;
  if (item?.collection !== collection || !sceneId.test(item?.id) ||
      typeof instant !== "string" || !Number.isFinite(Date.parse(instant))) return null;
  const metrics = openSentinelMetrics.filter(metric =>
    item.assets?.scl && metric.bands.every(band => item.assets?.[openSentinelBands[band]])).map(metric => metric.id);
  if (!metrics.length) return null;
  const cloud = item.properties["eo:cloud_cover"];
  return { id: item.id, date: new Date(instant).toISOString().slice(0, 10), instant,
    cloud: Number.isFinite(cloud) && cloud >= 0 && cloud <= 100 ? cloud : null,
    provider: openSentinelProvider, source: openSentinelSource, method: openSentinelMethod, available: metrics };
}

function overlap(left, right) {
  if (!Array.isArray(right) || right.length !== 4 || !right.every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(left[2], right[2]) - Math.max(left[0], right[0])) *
    Math.max(0, Math.min(left[3], right[3]) - Math.max(left[1], right[1]));
}

export async function searchOpenSentinel(geometry, month, signal) {
  if (typeof month !== "string" || !monthPattern.test(month)) throw fail("Geçerli bir arşiv ayı seç.", 400);
  const start = new Date(month + "-01T00:00:00Z");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCMilliseconds(-1);
  const bounds = geometryBounds(geometry);
  // The public catalog receives a rounded search envelope. Clipping and raster
  // sampling use the full private geometry inside AgroMax.
  const coarseBounds = bounds.map((value, i) =>
    Math.max(i % 2 ? -90 : -180, Math.min(i % 2 ? 90 : 180,
      (i < 2 ? Math.floor(value * 100) : Math.ceil(value * 100)) / 100)));
  const params = new URLSearchParams({ collections: collection, bbox: coarseBounds.join(","),
    datetime: start.toISOString() + "/" + end.toISOString(), limit: "48" });
  return limited(async () => {
    const timeout = AbortSignal.timeout(12000);
    const data = await stac("/search?" + params, signal ? AbortSignal.any([signal, timeout]) : timeout);
    if (!Array.isArray(data?.features)) throw fail("Earth Search gözlem listesi geçersiz.");
    const dates = new Map();
    for (const item of data.features.slice(0, 48)) {
      const scene = publicScene(item), area = overlap(bounds, item?.bbox);
      if (!scene || scene.date.slice(0, 7) !== month || !area) continue;
      const best = dates.get(scene.date);
      if (!best || area > best.area || area === best.area && (scene.cloud ?? 101) < (best.scene.cloud ?? 101))
        dates.set(scene.date, { scene, area });
    }
    return { observations: [...dates.values()].map(({ scene }) => scene).sort((a, b) => b.date.localeCompare(a.date)) };
  });
}

export function openSentinelValue(metric, samples) {
  if (!samples.every(value => Number.isFinite(value) && value >= 0)) return null;
  const [a, b, blue] = samples;
  const numerator = metric === "WDRVI" ? 0.1 * a - b : a - b;
  const denominator = metric === "EVI" ? a + 6 * b - 7.5 * blue + 1
    : metric === "WDRVI" ? 0.1 * a + b : a + b;
  if (Math.abs(denominator) <= 1e-8) return null;
  const value = (metric === "EVI" ? 2.5 : 1) * numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

async function readBand(item, band, epsg, locations, signal) {
  const asset = item.assets[band];
  const metadata = asset?.["raster:bands"]?.[0];
  const href = typeof asset?.href === "string" ? new URL(asset.href) : null;
  if (!href || href.origin !== archive || href.username || href.password || href.search || href.hash ||
      !href.pathname.startsWith("/" + collection + "/") ||
      !href.pathname.endsWith("/" + item.id + "/" + assetFiles[band] + ".tif") ||
      !Number.isFinite(metadata?.nodata) ||
      band !== "scl" && (!Number.isFinite(metadata.scale) || metadata.scale <= 0 || !Number.isFinite(metadata.offset)))
    throw fail("Uydu bandının kaynak veya yansıtım bilgisi doğrulanamadı.");
  const { fromUrl } = await import("geotiff");
  const tiff = await fromUrl(href.href, { allowFullFile: false, maxRanges: 0 }, signal);
  try {
    const image = await tiff.getImage();
    const [ox, oy] = image.getOrigin(), [dx, dy] = image.getResolution();
    const size = sourceResolution[band] ?? 20;
    if (image.getGeoKeys()?.ProjectedCSTypeGeoKey !== epsg || ![ox, oy].every(Number.isFinite) ||
        dx !== size || dy !== -size || image.getSamplesPerPixel() !== 1)
      throw fail("COG koordinat sistemi veya bant ızgarası doğrulanamadı.");
    const width = image.getWidth(), height = image.getHeight();
    let left = width, top = height, right = 0, bottom = 0;
    const indexes = locations.map(point => {
      if (!point) return null;
      const column = Math.floor((point[0] - ox) / dx), row = Math.floor((point[1] - oy) / dy);
      if (column < 0 || column >= width || row < 0 || row >= height) return null;
      left = Math.min(left, column); right = Math.max(right, column + 1);
      top = Math.min(top, row); bottom = Math.max(bottom, row + 1);
      return [column, row];
    });
    if (right <= left || bottom <= top) return locations.map(() => null);
    if ((right - left) * (bottom - top) > 1_048_576)
      throw fail("Bu sınır açık arşivde tek okumada işlenemeyecek kadar geniş.", 422);
    const pixels = await image.readRasters({ window: [left, top, right, bottom], samples: [0], interleave: true, signal });
    return indexes.map(point => {
      if (!point) return null;
      const value = pixels[(point[1] - top) * (right - left) + point[0] - left];
      if (!Number.isFinite(value) || value === metadata.nodata) return null;
      return band === "scl" ? value : value * metadata.scale + metadata.offset;
    });
  } finally {
    await tiff.close();
  }
}

export async function readOpenSentinelLayers(geometry, id, layers, parentSignal, minimumResolution = 20) {
  const metrics = layers.map(layer => openSentinelMetrics.find(candidate => candidate.id === layer));
  if (typeof id !== "string" || !sceneId.test(id) || !metrics.length || metrics.some(metric => !metric))
    throw fail("Arşiv sahnesi veya analiz katmanı geçersiz.", 400);
  return limited(async () => {
    const timeout = AbortSignal.timeout(25000);
    const signal = parentSignal ? AbortSignal.any([timeout, parentSignal]) : timeout;
    const item = await stac("/collections/" + collection + "/items/" + id, signal);
    const scene = publicScene(item);
    const epsg = item?.properties?.["proj:epsg"];
    if (!scene || scene.id !== id || layers.some(layer => !scene.available.includes(layer)) ||
        !/^(326|327)(0[1-9]|[1-5][0-9]|60)$/.test(String(epsg)) || !overlap(geometryBounds(geometry), item.bbox))
      throw fail("Sahne bu parseli kapsamıyor veya gereken bantlar bulunmuyor.", 422);
    const grid = rasterGrid(geometry, Math.max(minimumResolution, ...metrics.map(metric => metric.resolution)));
    const projection = proj4("EPSG:4326", "+proj=utm +zone=" + (epsg % 100) +
      (epsg >= 32700 ? " +south" : "") + " +datum=WGS84 +units=m +no_defs");
    const locations = Array.from({ length: grid.width * grid.height }, (_, index) => {
      const [west, south, east, north] = pixelBounds(grid, index);
      const coordinate = unproject([(west + east) / 2, (south + north) / 2]);
      return containsPoint(geometry, coordinate) ? projection.forward(coordinate) : null;
    });
    const names = ["scl", ...new Set(metrics.flatMap(metric => metric.bands.map(band => openSentinelBands[band])))];
    let samples;
    try {
      const bands = await Promise.all(names.map(band => readBand(item, band, epsg, locations, signal)));
      samples = Object.fromEntries(names.map((name, index) => [name, bands[index]]));
    } catch (error) {
      if (error.status) throw error;
      throw fail("Açık arşivdeki COG bantları okunamadı.");
    }
    const parcelPixels = locations.filter(Boolean).length;
    return Object.fromEntries(metrics.map(metric => [metric.id, {
      ...grid, parcelPixels, metric: metric.id, unit: "birimsiz", date: scene.date, capturedAt: scene.instant,
      sceneId: id, source: scene.source, provider: scene.provider, method: scene.method, mask: "SCL 4/5/6",
      values: samples.scl.map((code, index) => {
        if (!clearClasses.has(code)) return null;
        const inputs = Object.fromEntries(metric.bands.map(band => [band, samples[openSentinelBands[band]][index]]));
        if (!Object.values(inputs).every(value => Number.isFinite(value) && value >= 0)) return null;
        const result = calculate.get(metric.id)(inputs);
        return Number.isFinite(result) ? result : null;
      }),
    }]));
  });
}

export async function readOpenSentinel(geometry, id, layer, minimumResolution) {
  const raster = (await readOpenSentinelLayers(geometry, id, [layer], undefined, minimumResolution))[layer];
  if (!raster.values.some(Number.isFinite)) throw fail("Bu sahnede parsel için geçerli piksel yok. Başka bir tarih seç.", 422);
  return raster;
}

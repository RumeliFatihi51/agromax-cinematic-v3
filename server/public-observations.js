import proj4 from "proj4";
import { containsPoint, geometryBounds, pixelBounds, rasterGrid, unproject } from "../shared/spatial.js";
import { openSentinelValue } from "./open-sentinel.js";

const endpoint = "https://planetarycomputer.microsoft.com/api";
const sources = {
  radar: { collection: "sentinel-1-rtc", name: "Sentinel-1 RTC", host: "sentinel1euwestrtc.blob.core.windows.net", metres: 10, bands: ["vv", "vh"] },
  landsat: { collection: "landsat-c2-l2", name: "Landsat 8/9 L2", host: "landsateuwest.blob.core.windows.net", metres: 30,
    bands: ["red", "blue", "green", "coastal", "nir08", "swir16", "swir22", "qa_pixel", "qa_radsat"] },
  hlsL30: { collection: "hls2-l30", name: "NASA HLS L30 v2.0", host: "hls2euwest.blob.core.windows.net", metres: 30,
    optical: { coastal: "B01", blue: "B02", green: "B03", red: "B04", nir08: "B05", swir16: "B06", swir22: "B07" },
    bands: ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "Fmask"] },
  hlsS30: { collection: "hls2-s30", name: "NASA HLS S30 v2.0", host: "hls2euwest.blob.core.windows.net", metres: 30,
    optical: { coastal: "B01", blue: "B02", green: "B03", red: "B04", rededge1: "B05", rededge2: "B06",
      rededge3: "B07", nir: "B08", nir08: "B8A", swir16: "B11", swir22: "B12" },
    bands: ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "Fmask"] },
};
const opticalPairs = [
  ["NDVI", "nir08", "red"], ["NDMI", "nir08", "swir16"], ["NDWI", "green", "nir08"],
  ["MNDWI", "green", "swir16"], ["NBR", "nir08", "swir22"], ["NDRE", "nir08", "rededge1"],
];
const sourceLabel = source => source.name + " · Planetary Computer";
const accessTokens = new Map();

export function hlsReflectance(dn) {
  return Number.isInteger(dn) && dn > -9999 && dn < 12000 ? dn * 0.0001 : null;
}

export function hlsClear(fmask) {
  // Exclude cloud, adjacent to cloud/shadow, cloud shadow, snow/ice and high aerosol.
  return Number.isInteger(fmask) && fmask >= 0 && fmask < 255 && (fmask & 30) === 0 && (fmask & 192) !== 192;
}

function addOptical(add, optical) {
  for (const [name, value] of Object.entries(optical)) add(name, value);
  for (const [id, a, b] of opticalPairs) add(id, openSentinelValue(id, [optical[a], optical[b]]));
  add("EVI", openSentinelValue("EVI", [optical.nir08, optical.red, optical.blue]));
  add("WDRVI", openSentinelValue("WDRVI", [optical.nir08, optical.red]));
}

async function json(url, signal) {
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error("Uydu sağlayıcısı yanıtı " + response.status), { status: response.status });
  }
  return response.json();
}

async function accessToken(source, container, signal) {
  const account = source.host.split(".")[0];
  const key = account + "/" + container;
  const cached = accessTokens.get(key);
  if (cached?.expires > Date.now() + 120_000) return cached.token;
  if (cached?.pending) return cached.pending;
  const pending = json(endpoint + "/sas/v1/token/" + key, AbortSignal.timeout(8000)).then(value => {
    const expires = Date.parse(value["msft:expiry"]);
    if (expires <= Date.now() || !Number.isFinite(expires) || typeof value.token !== "string" ||
        !new URLSearchParams(value.token).has("sig"))
      throw new Error("Raster erişim anahtarı doğrulanamadı");
    accessTokens.set(key, { expires, token: value.token });
    return value.token;
  }).catch(error => {
    accessTokens.delete(key);
    throw error;
  });
  accessTokens.set(key, { pending });
  signal.throwIfAborted();
  return pending;
}

async function bandValues(asset, source, points, signal) {
  const href = new URL(asset.href);
  const container = href.pathname.split("/")[1];
  if (href.origin !== "https://" + source.host || href.username || href.password || href.search || href.hash ||
      !/^[a-z0-9-]{3,63}$/.test(container) || !/\.tiff?$/i.test(href.pathname))
    throw new Error("Geçersiz raster adresi");
  href.search = await accessToken(source, container, signal);
  signal.throwIfAborted();
  const { fromUrl } = await import("geotiff");
  const tiff = await fromUrl(href.href, { allowFullFile: false, maxRanges: 0 }, signal);
  try {
    const image = await tiff.getImage();
    const epsg = image.getGeoKeys()?.ProjectedCSTypeGeoKey;
    if (!/^(326|327)(0[1-9]|[1-5][0-9]|60)$/.test(String(epsg)) || image.getSamplesPerPixel() !== 1)
      throw new Error("Desteklenmeyen raster ızgarası");
    const projection = proj4("EPSG:4326", "+proj=utm +zone=" + (epsg % 100) +
      (epsg >= 32700 ? " +south" : "") + " +datum=WGS84 +units=m +no_defs");
    const [ox, oy] = image.getOrigin(), [dx, dy] = image.getResolution();
    if (dx !== source.metres || dy !== -source.metres) throw new Error("Beklenmeyen piksel çözünürlüğü");
    const width = image.getWidth(), height = image.getHeight();
    let left = width, top = height, right = 0, bottom = 0;
    const locations = points.map(point => {
      const [x, y] = projection.forward(point);
      const col = Math.floor((x - ox) / dx), row = Math.floor((y - oy) / dy);
      if (col < 0 || row < 0 || col >= width || row >= height) return null;
      left = Math.min(left, col); top = Math.min(top, row);
      right = Math.max(right, col + 1); bottom = Math.max(bottom, row + 1);
      return [col, row];
    });
    if (right <= left || bottom <= top) return points.map(() => null);
    if ((right - left) * (bottom - top) > 1_048_576) throw new Error("Parsel raster penceresi çok geniş");
    const samples = await image.readRasters({ window: [left, top, right, bottom], samples: [0], interleave: true, signal });
    const nodata = asset["raster:bands"]?.[0]?.nodata ?? image.getGDALNoData();
    return locations.map(location => {
      if (!location) return null;
      const [col, row] = location;
      const value = samples[(row - top) * (right - left) + col - left];
      return Number.isFinite(value) && value !== nodata ? value : null;
    });
  } finally { await tiff.close(); }
}

function summarize(samples, count, units) {
  return Object.fromEntries(Object.entries(samples).filter(([, values]) => values.length).map(([key, values]) =>
    [key, { mean: values.reduce((total, value) => total + value, 0) / values.length,
      min: Math.min(...values), max: Math.max(...values), count: values.length, coverage: values.length / count, unit: units[key] || "birimsiz" }]));
}

export async function readPublicObservation(kind, geometry, range, parentSignal) {
  const source = sources[kind];
  const timeout = AbortSignal.timeout(28000);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  const grid = rasterGrid(geometry, source.metres);
  const points = Array.from({ length: grid.width * grid.height }, (_, index) => {
    const [west, south, east, north] = pixelBounds(grid, index);
    return unproject([(west + east) / 2, (south + north) / 2]);
  }).filter(point => containsPoint(geometry, point));
  if (!points.length) return { state: "empty", source: sourceLabel(source) };
  const bbox = geometryBounds(geometry).map((value, index) =>
    (index < 2 ? Math.floor(value * 100) : Math.ceil(value * 100)) / 100);
  const query = new URLSearchParams({ collections: source.collection, bbox: bbox.join(","),
    datetime: range.from + "/" + range.to, limit: "15" });
  const data = await json(endpoint + "/stac/v1/search?" + query, signal);
  const items = data.features.filter(item => item.collection === source.collection &&
    Date.parse(item.properties?.datetime) >= Date.parse(range.from) &&
    Date.parse(item.properties?.datetime) < Date.parse(range.to) && source.bands.every(band => item.assets?.[band]));
  if (kind === "landsat" || source.optical) items.sort((a, b) => (a.properties["eo:cloud_cover"] ?? 101) -
    (b.properties["eo:cloud_cover"] ?? 101) || Date.parse(b.properties.datetime) - Date.parse(a.properties.datetime));
  let error;
  for (const item of items.slice(0, 3)) {
    try {
      const names = [...source.bands];
      if (kind === "landsat" && item.assets.lwir11) names.push("lwir11");
      const bands = Object.fromEntries(await Promise.all(names.map(async name =>
        [name, await bandValues(item.assets[name], source, points, signal)])));
      const values = {};
      const units = kind === "radar" ? { VV: "dB", VH: "dB", "VV/VH": "dB" } : { LST: "°C" };
      for (let i = 0; i < points.length; i++) {
        const add = (key, value) => { if (Number.isFinite(value)) (values[key] ??= []).push(value); };
        if (kind === "radar") {
          const vv = bands.vv[i], vh = bands.vh[i];
          if (vv > 0 && vh > 0) {
            add("VV", 10 * Math.log10(vv)); add("VH", 10 * Math.log10(vh)); add("VV/VH", 10 * Math.log10(vv / vh));
          }
          continue;
        }
        if (source.optical) {
          if (!hlsClear(bands.Fmask[i])) continue;
          addOptical(add, Object.fromEntries(Object.entries(source.optical).map(([name, band]) =>
            [name, hlsReflectance(bands[band][i])])));
          continue;
        }
        const qa = bands.qa_pixel[i], saturation = bands.qa_radsat[i];
        if (qa === null || (qa & 63) !== 0 || saturation !== 0) continue;
        const optical = Object.fromEntries(names.filter(name => !name.startsWith("qa_") && name !== "lwir11")
          .map(name => [name, bands[name][i] === null ? null : bands[name][i] * 0.0000275 - 0.2]));
        addOptical(add, optical);
        if (bands.lwir11?.[i] > 0) add("LST", bands.lwir11[i] * 0.00341802 + 149 - 273.15);
      }
      const metrics = summarize(values, points.length, units);
      if (Object.keys(metrics).length) return { state: "available", source: sourceLabel(source),
        sceneId: item.id, date: item.properties.datetime, orbit: item.properties["sat:orbit_state"],
        cloudCover: item.properties["eo:cloud_cover"] ?? null, nativeResolution: source.metres,
        method: source.optical ? "hls-v2-fmask-nearest-v1" : kind === "radar" ? "s1-rtc-power-db-nearest-v1" : "landsat-c2-l2-qa-nearest-v2",
        resolution: grid.resolution, metrics };
    } catch (cause) {
      signal.throwIfAborted();
      if ([401, 403, 429].includes(cause.status)) throw cause;
      error = cause;
    }
  }
  if (error) throw error;
  return { state: "empty", source: sourceLabel(source) };
}

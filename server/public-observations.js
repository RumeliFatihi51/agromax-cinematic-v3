import proj4 from "proj4";
import { containsPoint, geometryBounds, pixelBounds, rasterGrid, unproject } from "../shared/spatial.js";

const endpoint = "https://planetarycomputer.microsoft.com/api";
const sources = {
  radar: { collection: "sentinel-1-rtc", name: "Sentinel-1 RTC", host: "sentinel1euwestrtc.blob.core.windows.net", metres: 10, bands: ["vv", "vh"] },
  landsat: { collection: "landsat-c2-l2", name: "Landsat 8/9 L2", host: "landsateuwest.blob.core.windows.net", metres: 30,
    bands: ["red", "blue", "green", "coastal", "nir08", "swir16", "swir22", "qa_pixel", "qa_radsat"] },
};

async function json(url, signal) {
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok) throw new Error("Uydu sağlayıcısı yanıtı " + response.status);
  return response.json();
}

async function bandValues(asset, source, points, signal) {
  const href = new URL(asset.href);
  if (href.origin !== "https://" + source.host || href.username || href.password || href.search || href.hash ||
      !/\.tiff?$/i.test(href.pathname)) throw new Error("Geçersiz raster adresi");
  const signed = new URL((await json(endpoint + "/sas/v1/sign?href=" + encodeURIComponent(href.href), signal)).href);
  if (signed.origin !== href.origin || signed.pathname !== href.pathname || signed.username || signed.password)
    throw new Error("Raster imzası beklenen kaynağa ait değil");
  const { fromUrl } = await import("geotiff");
  const tiff = await fromUrl(signed.href, { allowFullFile: false, maxRanges: 0 }, signal);
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
  const bbox = geometryBounds(geometry).map((value, index) =>
    (index < 2 ? Math.floor(value * 100) : Math.ceil(value * 100)) / 100);
  const query = new URLSearchParams({ collections: source.collection, bbox: bbox.join(","),
    datetime: range.from + "/" + range.to, limit: "15" });
  const data = await json(endpoint + "/stac/v1/search?" + query, signal);
  const items = data.features.filter(item => item.collection === source.collection &&
    Number.isFinite(Date.parse(item.properties?.datetime)) && source.bands.every(band => item.assets?.[band]));
  if (kind === "landsat") items.sort((a, b) => (a.properties["eo:cloud_cover"] ?? 101) - (b.properties["eo:cloud_cover"] ?? 101));
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
        const qa = bands.qa_pixel[i], saturation = bands.qa_radsat[i];
        if (qa === null || (qa & 63) !== 0 || saturation !== 0) continue;
        const optical = Object.fromEntries(names.filter(name => !name.startsWith("qa_") && name !== "lwir11")
          .map(name => [name, bands[name][i] === null ? null : bands[name][i] * 0.0000275 - 0.2]));
        for (const [name, value] of Object.entries(optical)) add(name, value);
        for (const [id, a, b] of [["NDVI", "nir08", "red"], ["NDMI", "nir08", "swir16"],
          ["NDWI", "green", "nir08"], ["MNDWI", "green", "swir16"], ["NBR", "nir08", "swir22"]]) {
          const first = optical[a], second = optical[b];
          if (first !== null && second !== null && first >= 0 && second >= 0 && first + second > 0)
            add(id, (first - second) / (first + second));
        }
        if (bands.lwir11?.[i] > 0) add("LST", bands.lwir11[i] * 0.00341802 + 149 - 273.15);
      }
      const metrics = summarize(values, points.length, units);
      if (Object.keys(metrics).length) return { state: "available", source: source.name + " · Planetary Computer",
        sceneId: item.id, date: item.properties.datetime, orbit: item.properties["sat:orbit_state"],
        resolution: grid.resolution, metrics };
    } catch (cause) { error = cause; }
  }
  if (error) throw error;
  return { state: "empty", source: source.name + " · Planetary Computer" };
}

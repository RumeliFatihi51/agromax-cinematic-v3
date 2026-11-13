import { PNG } from "pngjs";
import { comparisonRange, fetchAnalysis, satelliteStatus, summarize } from "./satellite.js";
import { readOpenSentinelLayers, searchOpenSentinel } from "./open-sentinel.js";
import { openSentinelMethod, openSentinelMetrics, openSentinelProvider, openSentinelSource } from "../shared/open-sentinel.js";
import { metricFrame, unproject } from "../shared/spatial.js";

const archiveEnabled = () => process.env.AGROMAX_SENTINEL_OPEN_ANALYSIS === "true";
const archiveHealth = { lastSuccessAt: null, lastError: null };
const ids = openSentinelMetrics.map(metric => metric.id);
const opticalIds = openSentinelMetrics.filter(metric => metric.resolution < 60).map(metric => metric.id);
const coarseIds = openSentinelMetrics.filter(metric => metric.resolution === 60).map(metric => metric.id);
const dayMs = 86400000;
const failure = (message, status) => Object.assign(new Error(message), { status });

export function parcelSatelliteStatus() {
  const oauth = satelliteStatus();
  if (oauth.configured || !archiveEnabled()) return oauth;
  return { ...oauth, configured: true, provider: openSentinelProvider, source: openSentinelSource,
    metrics: ids.length, indices: openSentinelMetrics.filter(metric => !metric.id.startsWith("B")).length, qualityBands: ["SCL"], health: archiveHealth };
}

async function archiveAnalysis(geometry, signal) {
  const range = comparisonRange();
  const [from, split, to] = [range.from, range.split, range.to].map(Date.parse);
  const months = new Set([range.from, range.split, range.to].map(value => value.slice(0, 7)));
  const listings = await Promise.all([...months].map(month => searchOpenSentinel(geometry, month, signal)));
  const scenes = listings.flatMap(list => list.observations).filter(scene =>
    Date.parse(scene.instant) >= from && Date.parse(scene.instant) < to && ids.every(id => scene.available.includes(id)));
  if (!scenes.length) throw failure("Bu iki dönemde parseli kapsayan Sentinel-2 sahnesi bulunamadı.", 422);
  const byCloud = (a, b) => (a.cloud ?? 101) - (b.cloud ?? 101) || b.instant.localeCompare(a.instant);
  let providerError;
  async function samplePeriod(candidates) {
    const days = [];
    for (const scene of candidates.sort(byCloud).slice(0, 5)) {
      signal?.throwIfAborted();
      try {
        const [optical, coarse] = await Promise.all([
          readOpenSentinelLayers(geometry, scene.id, opticalIds, signal),
          readOpenSentinelLayers(geometry, scene.id, coarseIds, signal),
        ]);
        const layers = { ...optical, ...coarse };
        const outputs = {};
        for (const [id, raster] of Object.entries(layers)) {
          const values = raster.values.filter(Number.isFinite);
          const sampleCount = raster.parcelPixels;
          if (!values.length) continue;
          outputs[id] = { bands: { B0: { stats: { sampleCount, noDataCount: sampleCount - values.length,
            min: Math.min(...values), max: Math.max(...values),
            mean: values.reduce((total, value) => total + value, 0) / values.length } } } };
        }
        if (!Object.keys(outputs).length) continue;
        const start = Math.max(from, Date.parse(scene.date), Date.parse(scene.instant) >= split ? split : from);
        const end = Math.min(to, Date.parse(scene.date) + dayMs, Date.parse(scene.instant) < split ? split : to);
        days.push({ scene, interval: { from: new Date(start).toISOString(), to: new Date(end).toISOString() }, outputs });
        if (days.filter(day => day.outputs.NDVI &&
          1 - day.outputs.NDVI.bands.B0.stats.noDataCount / day.outputs.NDVI.bands.B0.stats.sampleCount >= 0.7).length >= 2) break;
      } catch (error) {
        signal?.throwIfAborted();
        if (error.status !== 422) providerError = error;
      }
    }
    return days;
  }
  const periods = await Promise.all([samplePeriod(scenes.filter(scene => Date.parse(scene.instant) < split)),
    samplePeriod(scenes.filter(scene => Date.parse(scene.instant) >= split))]);
  const days = periods.flat().sort((a, b) => a.interval.from.localeCompare(b.interval.from));
  if (!days.length) throw providerError || failure("Seçilen Sentinel-2 sahnelerinde geçerli parsel pikseli yok.", 422);
  return {
    ...summarize({ data: days }, range), range, fetchedAt: new Date().toISOString(),
    source: openSentinelSource, provider: openSentinelProvider, method: openSentinelMethod,
    resolution: 20, nativeResolution: "10 / 20 / 60 m · B01 ve B09 en az 60 m, diğer katmanlar en az 20 m",
    minimumCoverage: 0.7, mask: "SCL 4/5/6 ve bant NoData", availableMetrics: ids, qualityBands: ["SCL"],
    aggregation: "Dönem başına en az bulutlu en fazla 5 sahne adayından ilk 2 yeterli gözlem. En az %70 parsel kapsamlı gözlemler geçerli piksel sayısına göre ağırlıklandırılır.",
    scenes: days.map(({ scene }) => ({ id: scene.id, properties: { datetime: scene.instant, "eo:cloud_cover": scene.cloud } })),
  };
}

export async function fetchParcelAnalysis(geometry, options = {}) {
  if (satelliteStatus().configured || !archiveEnabled()) return fetchAnalysis(geometry, options);
  try {
    const result = await archiveAnalysis(geometry, options.signal);
    archiveHealth.lastSuccessAt = result.fetchedAt;
    archiveHealth.lastError = null;
    return result;
  } catch (error) {
    if (!options.signal?.aborted && error.status !== 422) archiveHealth.lastError = error.message;
    throw error;
  }
}

export function openRasterImage(raster) {
  const image = new PNG({ width: raster.width, height: raster.height });
  const values = raster.values.filter(Number.isFinite);
  if (!values.length) throw failure("Bu sahnede geçerli görüntü pikseli yok.", 422);
  const min = Math.min(...values), max = Math.max(...values);
  for (const [i, value] of raster.values.entries()) {
    if (!Number.isFinite(value)) continue;
    const t = max === min ? 0.5 : (value - min) / (max - min);
    image.data.set([48 + 137 * t, 102 + 121 * t, 140 - 55 * t, 255], i * 4);
  }
  const [west, south, east, north] = raster.bounds;
  const [left, bottom] = unproject([west, south]), [right, top] = unproject([east, north]);
  return { image: PNG.sync.write(image), bounds: [left, bottom, right, top],
    validPixels: values.length, totalPixels: raster.parcelPixels,
    legend: { min, max, unit: raster.unit, method: "Sahnedeki geçerli piksel aralığı",
      colors: ["#30668c", "#b9df55"] } };
}

export async function openTrueColorImage(geometry, sceneId, resolution) {
  const layers = await readOpenSentinelLayers(geometry, sceneId, ["B04", "B03", "B02"], undefined, resolution);
  return trueColorPng(layers);
}

export async function openLandscapeImage(geometry, requestedDate, exactScene) {
  const reference = requestedDate ? new Date(requestedDate + "T12:00:00Z") : new Date();
  if (requestedDate && (!/^20\d{2}-\d{2}-\d{2}$/.test(requestedDate) ||
    !Number.isFinite(reference.valueOf()) || reference.toISOString().slice(0, 10) !== requestedDate))
    throw failure("Geçerli bir görüntü tarihi seç.", 400);
  const frame = metricFrame(geometry);
  const padding = Math.min(1400, Math.max(300, frame.span * 2));
  const x = frame.width / 2 + padding;
  const y = frame.depth / 2 + padding;
  const ring = [[-x, y], [x, y], [x, -y], [-x, -y], [-x, y]].map(point => frame.coordinate(...point));
  if (ring.some(([lon, lat]) => Math.abs(lon) >= 180 || Math.abs(lat) >= 85))
    throw failure("Bu parsel için çevre görüntüsü oluşturulamadı.", 422);
  const landscape = { type: "Polygon", coordinates: [ring] };
  const signal = AbortSignal.timeout(30000);
  let candidates = exactScene ? [exactScene] : [];
  if (!exactScene) {
    const previous = new Date(reference);
    previous.setUTCDate(0);
    const months = [reference, previous].map(date => date.toISOString().slice(0, 7));
    const catalogues = await Promise.allSettled(months.map(month => searchOpenSentinel(geometry, month, signal)));
    if (catalogues.every(result => result.status === "rejected")) throw catalogues[0].reason;
    candidates = catalogues.flatMap(result => result.status === "fulfilled" ? result.value.observations : [])
      .filter(scene => scene.date <= reference.toISOString().slice(0, 10) && ["B04", "B03", "B02"].every(band => scene.available.includes(band)))
      .sort((a, b) => {
        const score = scene => (scene.cloud ?? 100) + (reference - Date.parse(scene.date)) / dayMs;
        return score(a) - score(b);
      }).slice(0, 2).map(scene => scene.id);
  }
  let rejected;
  for (const sceneId of candidates) {
    try {
      const layers = await readOpenSentinelLayers(landscape, sceneId, ["B04", "B03", "B02"], signal, 10, 256);
      if (requestedDate && exactScene && layers.B04.date !== requestedDate)
        throw failure("Görüntünün çekim tarihi seçili sahneyle eşleşmiyor.", 422);
      const image = trueColorPng(layers, true);
      if (image.validPixels / image.totalPixels < 0.35) throw failure("Çevre görüntüsünün büyük bölümü maskeli.", 422);
      return { ...image, date: layers.B04.date, resolution: layers.B04.resolution, sceneId };
    } catch (error) {
      if (signal.aborted || ![422, 404].includes(error.status)) throw error;
      rejected = error;
    }
  }
  throw rejected || failure("Bu parselin çevresi için açık uydu görüntüsü bulunamadı.", 404);
}

function trueColorPng(layers, fadeEdge = false) {
  const channels = [layers.B04, layers.B03, layers.B02];
  const [raster] = channels;
  const png = new PNG({ width: raster.width, height: raster.height });
  const toColor = reflectance => {
    const linear = Math.max(0, Math.min(1, reflectance / 0.28));
    return Math.round(255 * (linear < 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055));
  };
  let validPixels = 0;
  for (let i = 0; i < raster.values.length; i++) {
    const pixel = channels.map(channel => channel.values[i]);
    if (!pixel.every(Number.isFinite)) continue;
    const column = i % raster.width, row = Math.floor(i / raster.width);
    const edge = Math.min(column, row, raster.width - column - 1, raster.height - row - 1);
    const opacity = fadeEdge ? Math.min(1, edge / Math.max(2, Math.min(raster.width, raster.height) * 0.09)) : 1;
    png.data.set([...pixel.map(toColor), Math.round(opacity * 255)], i * 4);
    validPixels++;
  }
  if (!validPixels) throw failure("Bu sahnede doğal renk için ortak geçerli piksel yok.", 422);
  const [west, south, east, north] = raster.bounds;
  return { image: PNG.sync.write(png), bounds: [...unproject([west, south]), ...unproject([east, north])],
    validPixels, totalPixels: raster.parcelPixels, legend: null };
}

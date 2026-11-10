import proj4 from "proj4";
import { PNG } from "pngjs";
import { isISODate } from "../shared/dates.js";
import { polygons, project, rasterGrid } from "../shared/spatial.js";
import { boundedStatistics } from "./statistics-request.js";
import { meterProvider } from "./provider-meter.js";
import {
  metrics,
  indices,
  unavailable,
  availableMetrics,
  availableQualityBands,
  observationAngles,
} from "../shared/metrics.js";

const providers = {
  cdse: {
    token:
      "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
    api: "https://sh.dataspace.copernicus.eu/api/v1",
  },
  sentinelhub: {
    token:
      "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token",
    api: "https://services.sentinel-hub.com/api/v1",
  },
};
let access;
const health = { authenticatedAt: null, lastSuccessAt: null, lastError: null };
export function satelliteStatus() {
  return {
    configured: !!(
      providers[process.env.SENTINEL_PROVIDER] &&
      process.env.SENTINEL_CLIENT_ID &&
      process.env.SENTINEL_CLIENT_SECRET
    ),
    provider: process.env.SENTINEL_PROVIDER || null,
    clientIdPresent: !!process.env.SENTINEL_CLIENT_ID,
    secretPresent: !!process.env.SENTINEL_CLIENT_SECRET,
    metrics: availableMetrics(process.env.SENTINEL_PROVIDER).length,
    indices: indices.length,
    qualityBands: availableQualityBands(process.env.SENTINEL_PROVIDER),
    unavailableLayers:
      process.env.SENTINEL_PROVIDER === "cdse" ? ["WVP", "CLP", "CLM"] : [],
    unavailable,
    health,
  };
}
export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}
async function providerFetch(url, options, signal) {
  try {
    return await meterProvider(new URL(url).pathname.endsWith("/token") ? "oauth" : new URL(url).pathname.split("/").at(-1), () => fetch(url, {
      ...options,
      signal: signal
        ? AbortSignal.any([signal, options.signal])
        : options.signal,
    }));
  } catch (e) {
    if (signal?.aborted) throw signal.reason || e;
    const failure = new ProviderError(
      e.name === "TimeoutError"
        ? "Uydu sağlayıcısı zaman aşımına uğradı. Tekrar deneyin."
        : "Uydu sağlayıcısına bağlanılamadı. Bağlantıyı kontrol edin.",
      e.name === "TimeoutError" ? 504 : 502,
    );
    health.lastError = {
      at: new Date().toISOString(),
      message: failure.message,
    };
    throw failure;
  }
}
async function token(signal) {
  const cfg = providers[process.env.SENTINEL_PROVIDER];
  if (!satelliteStatus().configured)
    throw new ProviderError(
      "Copernicus client secret eksik. app/.env dosyasını tamamlayıp sunucuyu yeniden başlatın.",
      503,
    );
  if (access && access.expires > Date.now()) return access.token;
  const r = await providerFetch(
    cfg.token,
    {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.SENTINEL_CLIENT_ID,
        client_secret: process.env.SENTINEL_CLIENT_SECRET,
      }),
    },
    signal,
  );
  if (!r.ok)
    throw new ProviderError(
      `Uydu kimlik doğrulaması başarısız (${r.status}). ID, secret ve panel eşleşmesini kontrol edin.`,
      r.status === 429 ? 429 : 502,
    );
  const data = await r.json();
  if (!data.access_token)
    throw new ProviderError("Sağlayıcı geçerli erişim belirteci döndürmedi.");
  access = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in || 300) * 1000 - 30000,
  };
  health.authenticatedAt = new Date().toISOString();
  return access.token;
}
async function call(path, body, binary = false, signal) {
  const bearer = await token(signal);
  const r = await providerFetch(
    providers[process.env.SENTINEL_PROVIDER].api + path,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    },
    signal,
  );
  if (!r.ok) {
    if (r.status === 401) access = null;
    const error = new ProviderError(
      `Uydu sağlayıcısı isteği tamamlamadı (${r.status}). ${r.status === 429 ? "Kota veya hız sınırını kontrol edin." : "Hesap yetkisini ve servis durumunu kontrol edin."}`,
      r.status === 429 ? 429 : 502,
    );
    const payload = await r.json().catch(() => ({}));
    let detail = String(
      payload.error?.message ||
        payload.error?.description ||
        payload.description ||
        payload.message ||
        "",
    );
    for (const secret of [process.env.SENTINEL_CLIENT_SECRET, bearer].filter(
      Boolean,
    ))
      detail = detail.replaceAll(secret, "[redacted]");
    error.providerStatus = r.status;
    error.providerCode = payload.error?.code || payload.code || null;
    error.providerDetail = detail.slice(0, 1800);
    health.lastError = { at: new Date().toISOString(), message: error.message };
    throw error;
  }
  let value;
  try {
    value = binary ? Buffer.from(await r.arrayBuffer()) : await r.json();
  } catch {
    const error = new ProviderError(
      "Uydu sağlayıcısı geçerli bir yanıt döndürmedi.",
    );
    health.lastError = { at: new Date().toISOString(), message: error.message };
    throw error;
  }
  health.lastSuccessAt = new Date().toISOString();
  health.lastError = null;
  return value;
}
export function comparisonRange(now = new Date()) {
  // Calendar boundaries in Europe/Istanbul, expressed as UTC instants.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const val = (type) => Number(parts.find((p) => p.type === type).value);
  const y = val("year"),
    m = val("month") - 1;
  const start = (offset) =>
    new Date(Date.UTC(y, m + offset, 1) - 3 * 3600000).toISOString();
  return {
    from: start(-1),
    split: start(0),
    to: now.toISOString(),
    currentLabel: "Bu ay (bugüne kadar)",
    previousLabel: "Geçen ay (tam ay)",
  };
}
export function boundsOf(geometry) {
  const ps = geometry.coordinates.flat(
    geometry.type === "MultiPolygon" ? 2 : 1,
  );
  return [
    Math.min(...ps.map((p) => p[0])),
    Math.min(...ps.map((p) => p[1])),
    Math.max(...ps.map((p) => p[0])),
    Math.max(...ps.map((p) => p[1])),
  ];
}
function utmGeometry(geometry) {
  const b = boundsOf(geometry),
    lon = (b[0] + b[2]) / 2,
    lat = (b[1] + b[3]) / 2;
  const zone = Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
  const epsg = (lat >= 0 ? 32600 : 32700) + zone;
  const projection = `+proj=utm +zone=${zone} ${lat < 0 ? "+south " : ""}+datum=WGS84 +units=m +no_defs`;
  const ring = (r) => r.map((p) => proj4("EPSG:4326", projection, p));
  return {
    geometry: {
      type: geometry.type,
      coordinates:
        geometry.type === "Polygon"
          ? geometry.coordinates.map(ring)
          : geometry.coordinates.map((p) => p.map(ring)),
    },
    crs: `http://www.opengis.net/def/crs/EPSG/0/${epsg}`,
  };
}
export function statisticsScript(
  provider = process.env.SENTINEL_PROVIDER || "cdse",
  selected = availableMetrics(provider),
) {
  const quality = availableQualityBands(provider);
  const inputs = [
    ...new Set([...selected.flatMap((m) => m.bands), ...quality]),
  ];
  const clear = `s.dataMask===1 && [4,5,6].indexOf(s.SCL)>=0 && s.CLD<40${provider === "cdse" ? "" : " && s.CLM===0 && s.CLP/255<0.4"}`;
  const probabilities =
    provider === "cdse" ? ["s.CLD", "s.SNW"] : ["s.CLD", "s.SNW", "s.CLP/255"];
  return `//VERSION=3
function setup(){return {input:[{bands:${JSON.stringify(inputs)}}],output:[${selected.map((m) => `{id:'${m.id}',bands:1,sampleType:'FLOAT32'}`).join(",")},{id:'QUALITY',bands:${probabilities.length},sampleType:'FLOAT32'},{id:'SCL',bands:1,sampleType:'FLOAT32'},{id:'dataMask',bands:${JSON.stringify([...selected.map((m) => m.id), "QUALITY", "SCL"])}}],mosaicking:'SIMPLE'};}
function evaluatePixel(s){let values=[${selected.map((m) => m.formula).join(",")}];let clear=${clear};
let valid=values.map(v=>clear && isFinite(v));let out={dataMask:valid.map(v=>v?1:0).concat([s.dataMask,s.dataMask]),QUALITY:[${probabilities.join(",")}],SCL:[s.SCL]};${selected.map((m, i) => `out.${m.id}=[valid[${i}]?values[${i}]:0];`).join("")}return out;}`;
}
function finite(value) {
  return Number.isFinite(value) ? value : null;
}
export function summarize(raw, range) {
  const observations = (raw.data || []).map((day) => {
    const outputs = day.outputs || {};
    const stats = {};
    for (const metric of [...metrics, ...observationAngles]) {
      const s = outputs[metric.id]?.bands?.B0?.stats;
      if (
        s &&
        (!Number.isSafeInteger(s.sampleCount) ||
          !Number.isSafeInteger(s.noDataCount) ||
          s.sampleCount < 0 ||
          s.noDataCount < 0 ||
          s.noDataCount > s.sampleCount)
      )
        throw new ProviderError(
          "Sağlayıcı geçersiz piksel sayımı döndürdü; analiz kullanılamıyor.",
        );
      const valid = s ? s.sampleCount - s.noDataCount : 0;
      if (
        valid > 0 &&
        (!Number.isFinite(s.mean) ||
          !Number.isFinite(s.min) ||
          !Number.isFinite(s.max) ||
          s.min > s.max)
      )
        throw new ProviderError(
          "Sağlayıcı geçersiz istatistik döndürdü; analiz kullanılamıyor.",
        );
      stats[metric.id] =
        s && valid > 0 && Number.isFinite(s.mean)
          ? {
              mean: s.mean,
              min: finite(s.min),
              max: finite(s.max),
              stDev: finite(s.stDev),
              validPixels: valid,
              totalPixels: s.sampleCount,
              coverage: valid / s.sampleCount,
              percentiles: s.percentiles || {},
              histogram: outputs[metric.id]?.bands?.B0?.histogram || null,
            }
          : null;
    }
    return {
      from: day.interval.from,
      to: day.interval.to,
      stats,
      quality: outputs.QUALITY || null,
      classification: outputs.SCL || null,
    };
  });
  const aggregate = (list, id) => {
    const valid = list
      .map((o) => o.stats[id])
      .filter((s) => s && s.coverage >= 0.7);
    if (!valid.length) return null;
    const weight = valid.reduce((s, v) => s + v.validPixels, 0);
    return {
      mean: valid.reduce((s, v) => s + v.mean * v.validPixels, 0) / weight,
      min: Math.min(...valid.map((v) => v.min).filter(Number.isFinite)),
      max: Math.max(...valid.map((v) => v.max).filter(Number.isFinite)),
      observations: valid.length,
      meanCoverage: valid.reduce((s, v) => s + v.coverage, 0) / valid.length,
    };
  };
  const splitAt = Date.parse(range.split);
  const previousDays = observations.filter((o) => Date.parse(o.from) < splitAt);
  const currentDays = observations.filter((o) => Date.parse(o.from) >= splitAt);
  const comparison = Object.fromEntries(
    [...metrics, ...observationAngles].map((m) => {
      const previous = aggregate(previousDays, m.id),
        current = aggregate(currentDays, m.id);
      return [
        m.id,
        {
          current,
          previous,
          delta: current && previous ? current.mean - previous.mean : null,
        },
      ];
    }),
  );
  return { observations, comparison };
}
/** @param {any} geometry @param {{ signal?: AbortSignal, range?: ReturnType<typeof comparisonRange>, metricIds?: string[], catalog?: boolean, maximumRequests?:number }} options */
export async function fetchAnalysis(geometry, { signal, range: requestedRange, metricIds, catalog = true,maximumRequests=128 } = {}) {
  const range = requestedRange || comparisonRange(),
    projected = utmGeometry(geometry);
  const merged = new Map();
  const supported = availableMetrics(process.env.SENTINEL_PROVIDER);
  const selected = metricIds ? supported.filter((m) => metricIds.includes(m.id)) : supported;
  if (!selected.length || (metricIds && selected.length !== metricIds.length)) throw new ProviderError("Desteklenmeyen çıktı grubu.", 400);
  let baseline;
  let requestCount = 0;
  const budget = {requests:0,maximum:maximumRequests};
  // Bounded output groups avoid the provider's calculation-size limit. Every
  // requested metric must succeed; failures never publish a partial analysis.
  for (let offset = 0; offset < selected.length; offset += 8) {
    const batch = selected.slice(offset, offset + 8);
    signal?.throwIfAborted();
    const response = await boundedStatistics(
      payload=>call("/statistics",payload,false,signal),
      {
        input: {
          bounds: {
            geometry: projected.geometry,
            properties: { crs: projected.crs },
          },
          data: [
            {
              type: "sentinel-2-l2a",
              dataFilter: {
                mosaickingOrder: "mostRecent",
                maxCloudCoverage: 100,
              },
            },
          ],
        },
        aggregation: {
          timeRange: { from: range.from, to: range.to },
          aggregationInterval: { of: "P1D", lastIntervalBehavior: "SHORTEN" },
          resx: 20,
          resy: 20,
          evalscript: statisticsScript(process.env.SENTINEL_PROVIDER, batch),
        },
        calculations: {
          default: {
            statistics: { default: { percentiles: { k: [10, 50, 90] } } },
            histograms: { default: { nBins: 20 } },
          },
        },
      },
      {signal,budget},
    );
    if (response.status !== "OK" || !Array.isArray(response.data))
      throw new ProviderError(
        "Sağlayıcı analiz işlemini tamamlayamadı; eksik sonuç yayımlanmadı.",
      );
    const intervals = response.data
      .map((day) => `${day.interval?.from}/${day.interval?.to}`)
      .sort();
    if (new Set(intervals).size !== intervals.length)
      throw new ProviderError(
        "Sağlayıcı tekrarlanan günlük aralıklar döndürdü; sonuç kaydedilmedi.",
      );
    if (baseline && JSON.stringify(intervals) !== JSON.stringify(baseline))
      throw new ProviderError(
        "Sağlayıcı istekleri farklı günlük aralıklar döndürdü; tutarsız sonuç kaydedilmedi.",
      );
    baseline = intervals;
    for (const day of response.data) {
      if (
        !Number.isFinite(Date.parse(day.interval?.from)) ||
        !Number.isFinite(Date.parse(day.interval?.to)) ||
        Date.parse(day.interval.to) <= Date.parse(day.interval.from) ||
        day.error ||
        !day.outputs ||
        batch.some((m) => !day.outputs[m.id]?.bands?.B0?.stats) ||
        !day.outputs.QUALITY ||
        !day.outputs.SCL
      )
        throw new ProviderError(
          "Sağlayıcı eksik veya hatalı günlük analiz döndürdü; sonuç kaydedilmedi.",
        );
      const key = `${day.interval.from}/${day.interval.to}`;
      const entry = merged.get(key) || { interval: day.interval, outputs: {} };
      Object.assign(entry.outputs, day.outputs);
      merged.set(key, entry);
    }
    requestCount++;
  }
  const raw = {
    status: "OK",
    data: [...merged.values()].sort((a, b) =>
      a.interval.from.localeCompare(b.interval.from),
    ),
    requestCount:budget.requests,
    outputGroups:requestCount,
  };
  const scenes = catalog ? await fetchObservations(geometry, range, { signal }) : [];
  return {
    ...summarize(raw, range),
    ...analysisMetadata(range),
    scenes,
    raw,
  };
}
export async function fetchObservations(geometry, range, { signal } = {}) {
  const scenes = [];
  let next;
  const seen = new Set();
  do {
    const catalog = await call(
      "/catalog/1.0.0/search",
      {
        collections: ["sentinel-2-l2a"],
        datetime: `${range.from}/${range.to}`,
        intersects: geometry,
        limit: 100,
        ...(next !== undefined ? { next } : {}),
      },
      false,
      signal,
    );
    if (!Array.isArray(catalog.features))
      throw new ProviderError(
        "Sağlayıcı geçerli bir gözlem listesi döndürmedi.",
      );
    if (
      catalog.features.some(
        (s) =>
          typeof s.id !== "string" ||
          !s.id ||
          !Number.isFinite(Date.parse(s.properties?.datetime)) ||
          (s.properties?.["eo:cloud_cover"] !== undefined &&
            (!Number.isFinite(s.properties["eo:cloud_cover"]) ||
              s.properties["eo:cloud_cover"] < 0 ||
              s.properties["eo:cloud_cover"] > 100)),
      )
    )
      throw new ProviderError(
        "Sağlayıcı geçersiz gözlem metadatası döndürdü; sonuç kaydedilmedi.",
      );
    scenes.push(...catalog.features);
    next = catalog.context?.next;
    if (next !== undefined && next !== null) {
      if (seen.has(next) || seen.size >= 100)
        throw new ProviderError(
          "Katalog sayfalaması tamamlanamadı. Kısmi sonuç kaydedilmedi.",
        );
      seen.add(next);
    }
  } while (next !== undefined && next !== null);
  return scenes;
}

const radarScript = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "localIncidenceAngle", "shadowMask", "dataMask"] }],
    output: [
      { id: "default", bands: 3, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const valid = s.dataMask === 1 && s.shadowMask === 0 &&
    isFinite(s.VV) && s.VV > 0 && isFinite(s.VH) && s.VH > 0 &&
    isFinite(s.localIncidenceAngle) && s.localIncidenceAngle > 0 && s.localIncidenceAngle < 90;
  return {
    default: valid ? [s.VV, s.VH, s.localIncidenceAngle] : [0, 0, 0],
    dataMask: [valid ? 1 : 0]
  };
}`;

/** @param {any} geometry @param {{from:string,to:string}} range @param {"ASCENDING" | "DESCENDING"} orbit */
export async function fetchRadarStatistics(geometry, range, orbit) {
  const status = satelliteStatus();
  if (!status.configured || status.provider !== "cdse")
    throw new ProviderError("Sentinel-1 için CDSE bağlantısı gerekli.", 503);
  const projected = utmGeometry(geometry);
  const resolution = 20;
  const raw = await call("/statistics", {
    input: {
      bounds: { geometry: projected.geometry, properties: { crs: projected.crs } },
      data: [{
        type: "sentinel-1-grd",
        dataFilter: { acquisitionMode: "IW", polarization: "DV", resolution: "HIGH", orbitDirection: orbit },
        processing: { backCoeff: "GAMMA0_TERRAIN", orthorectify: true, demInstance: "COPERNICUS_30" },
      }],
    },
    aggregation: {
      timeRange: range,
      aggregationInterval: { of: "P1D" },
      resx: resolution,
      resy: resolution,
      evalscript: radarScript,
    },
  }, false, AbortSignal.timeout(20000));
  if (raw?.status !== "OK" || !Array.isArray(raw.data) || raw.data.length > 7)
    throw new ProviderError("Sentinel-1 istatistik yanıtı doğrulanamadı.");

  const seen = new Set();
  /** @type {{from:string,to:string,validPixels:number,sampleCount:number,vv:number|null,vh:number|null,incidenceDegrees:number|null}[]} */
  const observations = raw.data.map((row) => {
    const from = row?.interval?.from, to = row?.interval?.to;
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) ||
      Date.parse(from) < Date.parse(range.from) || Date.parse(to) > Date.parse(range.to) ||
      Date.parse(to) - Date.parse(from) !== 86400000 || seen.has(Date.parse(from)))
      throw new ProviderError("Sentinel-1 zaman aralığı doğrulanamadı.");
    seen.add(Date.parse(from));
    const samples = ["B0", "B1", "B2"].map((band) => row.outputs?.default?.bands?.[band]?.stats);
    const pixels = samples[0]?.sampleCount, masked = samples[0]?.noDataCount;
    if (!Number.isSafeInteger(pixels) || !Number.isSafeInteger(masked) ||
      masked < 0 || pixels < masked ||
      samples.some((s) => s?.sampleCount !== pixels || s?.noDataCount !== masked))
      throw new ProviderError("Sentinel-1 piksel kalite sayımı doğrulanamadı.");
    const validPixels = pixels - masked;
    const [vv, vh, incidence] = samples.map((s) => s.mean);
    if (validPixels && (![vv, vh, incidence].every(Number.isFinite) ||
      vv <= 0 || vh <= 0 || incidence <= 0 || incidence >= 90))
      throw new ProviderError("Sentinel-1 ölçüm birimleri veya değerleri geçersiz.");
    return {
      from, to, validPixels, sampleCount: pixels,
      vv: validPixels ? vv : null,
      vh: validPixels ? vh : null,
      incidenceDegrees: validPixels ? incidence : null,
    };
  }).sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  return {
    kind: "radar_statistics",
    source: "Copernicus Sentinel-1 GRD / CDSE",
    sourceURL: "https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S1GRD.html",
    methodVersion: "s1-grd-gamma0-terrain-v1",
    fetchedAt: new Date().toISOString(),
    gridMetres: resolution,
    sourcePixelSpacingMetres: 10,
    orbit,
    unit: "LINEAR_POWER",
    mask: "dataMask, radar gölgesi, VV/VH ve yerel geliş açısı",
    state: !observations.length ? "no_observations" :
      observations.some((row) => row.validPixels) ? "available" : "masked",
    observations,
  };
}

function analysisMetadata(range) {
  return {
    range,
    fetchedAt: new Date().toISOString(),
    source: "Copernicus Sentinel-2 L2A / Sentinel Hub",
    provider: process.env.SENTINEL_PROVIDER,
    resolution: 20,
    nativeResolution: "10 / 20 / 60 m; bant bazında belirtilir",
    method: "s2-l2a-v3",
    minimumCoverage: 0.7,
    mask: `SCL 4/5/6, CLD<40${process.env.SENTINEL_PROVIDER === "cdse" ? "" : ", CLM=0, CLP<0,40"}; her gösterge için ayrı sonlu değer maskesi. İşlem ızgarasının en az %70 geçerli piksel oranı.`,
    availableMetrics: availableMetrics(process.env.SENTINEL_PROVIDER).map(
      (m) => m.id,
    ),
    qualityBands: availableQualityBands(process.env.SENTINEL_PROVIDER),
    aggregation:
      "Günlük mozaiklerin geçerli piksel sayısına göre ağırlıklı dönem ortalaması. Dönemlerin tarih kapsamı ve gözlem sayısı birlikte değerlendirilmelidir; doğrudan nedensel yorum yapılamaz.",
  };
}
export function assembleAnalysis(parts, scenes) {
  if (!parts.length) throw new ProviderError("Analiz grupları eksik.");
  const range = parts[0].range, rows = new Map();
  let baseline;
  for (const part of parts) {
    if (JSON.stringify(part.range) !== JSON.stringify(range)) throw new ProviderError("Analiz tarihleri tutarsız.");
    const intervals = part.raw.data.map((d) => `${d.interval.from}/${d.interval.to}`).sort();
    if (baseline && JSON.stringify(intervals) !== JSON.stringify(baseline)) throw new ProviderError("Analiz aralıkları tutarsız.");
    baseline = intervals;
    for (const day of part.raw.data) {
      const key = `${day.interval.from}/${day.interval.to}`;
      const current = rows.get(key) || { interval: day.interval, outputs: {} };
      Object.assign(current.outputs, day.outputs); rows.set(key, current);
    }
  }
  const supported = availableMetrics(process.env.SENTINEL_PROVIDER);
  for (const row of rows.values()) if (supported.some((m) => !row.outputs[m.id]?.bands?.B0?.stats)) throw new ProviderError("Tamamlanmamış analiz yayımlanamaz.");
  const raw = { status: "OK", data: [...rows.values()].sort((a,b) => a.interval.from.localeCompare(b.interval.from)), requestCount: parts.reduce((s,p) => s + p.raw.requestCount, 0), outputGroups: parts.reduce((s,p) => s + p.raw.outputGroups, 0) };
  return { ...analysisMetadata(range), ...summarize(raw, range), scenes, raw };
}
export function imagePixels(image) {
  if (
    !Buffer.isBuffer(image) ||
    image.length < 24 ||
    image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    image.readUInt32BE(16) > 2048 ||
    image.readUInt32BE(20) > 2048
  )
    throw new ProviderError("Görüntü biçimi veya boyutu desteklenmiyor.");
  let decoded;
  try {
    decoded = PNG.sync.read(image);
  } catch {
    throw new ProviderError("Sağlayıcı geçerli PNG görüntüsü döndürmedi.");
  }
  const totalPixels = decoded.width * decoded.height;
  let validPixels = 0;
  for (let i = 3; i < decoded.data.length; i += 4)
    if (decoded.data[i] > 0) validPixels++;
  return {
    validPixels,
    totalPixels,
    width: decoded.width,
    height: decoded.height,
  };
}
export function imageScript(metric, scale) {
  return `//VERSION=3
function setup(){return {input:[{bands:${JSON.stringify([...new Set([...(metric?.bands || ["B02", "B03", "B04"]), "SCL", "CLD", "dataMask"])])}}],output:{bands:4,sampleType:'AUTO'}};}
function evaluatePixel(s){let mask=s.dataMask&&[4,5,6].indexOf(s.SCL)>=0&&s.CLD<40;if(!mask)return [0,0,0,0];${metric ? `let v=${metric.formula};if(!isFinite(v))return [0,0,0,0];let t=${scale.max === scale.min ? "0.5" : `Math.max(0,Math.min(1,(v-(${scale.min}))/(${scale.max}-(${scale.min}))))`};return [(48+137*t)/255,(102+121*t)/255,(140-55*t)/255,1];` : "return [2.5*s.B04,2.5*s.B03,2.5*s.B02,1];"}}`;
}

export function spatialRasterScript(metric) {
  const bands = [...new Set([...metric.bands, "SCL", "CLD", "dataMask"])];
  return `//VERSION=3
function setup(){return {input:[{bands:${JSON.stringify(bands)}}],output:{bands:2,sampleType:'FLOAT32'}};}
function evaluatePixel(s){
  if(!s.dataMask||[4,5,6].indexOf(s.SCL)<0||!(s.CLD<40))return [0,0];
  var value=${metric.formula};
  return isFinite(value)?[value,1]:[0,0];
}`;
}

export async function fetchSpatialRaster(geometry, layer, { from, to }) {
  const metric = availableMetrics(process.env.SENTINEL_PROVIDER).find(item => item.id === layer);
  if (!metric) throw new ProviderError("Bu indeks desteklenmiyor.", 400);
  const duration = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400000)
    throw new ProviderError("Gözlem aralığı geçersiz.", 422);

  // SCL and CLD are sampled on a 20 m grid. Never request a finer analytical grid.
  const grid = rasterGrid(geometry, Math.max(metric.resolution, 20));
  const coordinates = polygons(geometry).map(polygon => polygon.map(ring => ring.map(project)));
  const raster = await call("/process", {
    input: {
      bounds: { bbox: grid.bounds, geometry: {
        type: geometry.type,
        coordinates: geometry.type === "Polygon" ? coordinates[0] : coordinates,
      }, properties: {
        crs: "http://www.opengis.net/def/crs/EPSG/0/3857",
      } },
      data: [{
        type: "sentinel-2-l2a",
        dataFilter: { timeRange: { from, to }, mosaickingOrder: "mostRecent" },
        processing: { upsampling: "NEAREST", downsampling: "NEAREST" },
      }],
    },
    output: { width: grid.width, height: grid.height, responses: [
      { identifier: "default", format: { type: "image/tiff" } },
    ] },
    evalscript: spatialRasterScript(metric),
  }, true);
  let values;
  try {
    if (raster.length > 1_000_000) throw new Error("Unexpected TIFF size");
    const { fromArrayBuffer } = await import("geotiff");
    const tiff = await fromArrayBuffer(Uint8Array.from(raster).buffer);
    const image = await tiff.getImage();
    if (image.getWidth() !== grid.width || image.getHeight() !== grid.height ||
        image.getSamplesPerPixel() !== 2 || image.getGeoKeys()?.ProjectedCSTypeGeoKey !== 3857 ||
        image.getBoundingBox().some((value, index) => Math.abs(value - grid.bounds[index]) > 0.01))
      throw new Error("Unexpected grid");
    const [numbers, mask] = await image.readRasters();
    if (!(numbers instanceof Float32Array) || !(mask instanceof Float32Array))
      throw new Error("Unexpected raster samples");
    values = Array.from(numbers, (value, index) =>
      mask[index] === 1 && Number.isFinite(value) ? value : null);
  } catch {
    throw new ProviderError("Sağlayıcının sayısal raster biçimi doğrulanamadı.");
  }
  if (!values.some(Number.isFinite))
    throw new ProviderError("Bu gözlemde geçerli açık piksel bulunamadı.", 422);
  return { ...grid, values, metric: metric.id, unit: metric.unit, interval: { from, to },
    provider: process.env.SENTINEL_PROVIDER, method: "s2-l2a-spatial-v1" };
}
export async function fetchImage(
  geometry,
  date,
  layer,
  { scale, timeRange } = {},
) {
  if (!isISODate(date))
    throw new ProviderError("Görüntü tarihi geçersiz.", 400);
  const metric = availableMetrics(process.env.SENTINEL_PROVIDER).find(
    (m) => m.id === layer,
  );
  if (layer !== "RGB" && !metric)
    throw new ProviderError("Katman desteklenmiyor.", 400);
  if (
    metric &&
    (!Number.isFinite(scale?.min) ||
      !Number.isFinite(scale?.max) ||
      scale.max < scale.min)
  )
    throw new ProviderError(
      "Bu tarih ve katman için doğrulanmış istatistik aralığı yok. Önce analiz yapın veya başka bir tarih seçin.",
      422,
    );
  const legend = metric
    ? {
        min: scale.min,
        max: scale.max,
        unit: metric.unit,
        colors: ["#30668c", "#b9df55"],
        method:
          "Günlük geçerli piksellerin minimum–maksimum aralığı; istatistikler değişmez.",
      }
    : null;
  const b = boundsOf(geometry),
    width = 640,
    height = Math.max(
      32,
      Math.min(
        1000,
        Math.round(
          (width * (b[3] - b[1])) /
            ((b[2] - b[0]) * Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180)),
        ),
      ),
    );
  const evalscript = imageScript(metric, scale);
  const from = timeRange?.from || date + "T00:00:00Z",
    to = timeRange?.to || new Date(Date.parse(from) + 86400000).toISOString();
  if (
    !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) ||
    Date.parse(to) <= Date.parse(from) ||
    Date.parse(to) - Date.parse(from) > 86400000
  )
    throw new ProviderError("Görüntü zaman aralığı geçersiz.", 400);
  const image = await call(
    "/process",
    {
      input: {
        bounds: {
          bbox: b,
          geometry,
          properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
        },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: { from, to },
              mosaickingOrder: "mostRecent",
            },
          },
        ],
      },
      output: {
        width,
        height,
        responses: [{ identifier: "default", format: { type: "image/png" } }],
      },
      evalscript,
    },
    true,
  );
  const pixels = imagePixels(image);
  if (!pixels.validPixels)
    throw new ProviderError(
      "Seçilen çekimde parsel için geçerli açık piksel yok; görüntü gösterilmedi. Başka bir çekim tarihi seçin.",
      422,
    );
  return { image, bounds: b, legend, ...pixels };
}

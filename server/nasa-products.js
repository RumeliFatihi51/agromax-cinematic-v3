import { nasaProducts } from "../shared/nasa-products.js";
import { isISODate } from "../shared/dates.js";

const nasaHost = new Set(["data.lpdaac.earthdatacloud.nasa.gov", "nisar.asf.earthdatacloud.nasa.gov"]);
const day = 86400000;
const fail = (message, status = 502) => Object.assign(new Error(message), { status });
export const gibsRoot = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";
export const gibsCapabilities = gibsRoot + "wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities";
const cache = new Map();
function cached(key, load, freshness) {
  const now = Date.now();
  const saved = cache.get(key);
  if (saved?.until > now) return saved.promise;
  if (cache.size >= 128) cache.delete(cache.keys().next().value);
  const promise = load().catch(error => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
    throw error;
  });
  cache.set(key, { promise, until: now + freshness });
  return promise;
}

async function fetchNASA(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: "error" });
    if (response.ok) return response;
  } catch { /* Provider availability is surfaced below. */ }
  throw fail("NASA veri servisi şu anda yanıt vermiyor.");
}

export function parseGibsDates(xml) {
  const result = {};
  const byLayer = new Map(Object.entries(nasaProducts).filter(([, product]) => product.layer).map(([key,product]) => [product.layer,key]));
  for (const [, block] of xml.matchAll(/<Layer(?:\s[^>]*)?>([\s\S]*?)<\/Layer>/g)) {
    const layer = block.match(/<ows:Identifier>([^<]+)<\/ows:Identifier>/)?.[1];
    const key = byLayer.get(layer);
    if (!key) continue;
    const time = [...block.matchAll(/<Dimension(?:\s[^>]*)?>([\s\S]*?)<\/Dimension>/g)]
      .map(match => match[1]).find(value => /<ows:Identifier>Time<\/ows:Identifier>/.test(value));
    const latest = time?.match(/<Default>(\d{4}-\d{2}-\d{2})<\/Default>/)?.[1];
    if (isISODate(latest)) result[key] = latest;
  }
  if (!Object.keys(result).length) throw fail("NASA katman tarihleri doğrulanamadı.");
  return result;
}

export function nasaLayerStatus() {
  return cached("gibs", async () => ({
    latest: parseGibsDates(await (await fetchNASA(gibsCapabilities)).text()),
    checkedAt: new Date().toISOString(),
  }), 30 * 60000);
}

export function nasaAssets(row) {
  return (row.links ?? []).flatMap(link => {
    let url;
    try { url = new URL(link.href); } catch { return []; }
    if (url.protocol !== "https:" || !nasaHost.has(url.hostname) || url.port || url.username || url.password ||
        url.search || url.hash || link.inherited || !/\.(tif|h5|nc|png)$/i.test(url.pathname)) return [];
    const browse = /\.png$/i.test(url.pathname);
    if (browse && !(/\/lp-prod-public\//.test(url.pathname) || /_LATLON\.png$/i.test(url.pathname))) return [];
    return [{ name: url.pathname.split("/").at(-1), url: url.href, browse }];
  });
}

export function sceneFootprints(row) {
  return (row.polygons ?? []).flatMap(group => Array.isArray(group) ? group : []).flatMap(value => {
    if (typeof value !== "string") return [];
    const numbers = value.trim().split(/\s+/).map(Number);
    if (numbers.length < 8 || numbers.length % 2 || numbers.length > 4096 ||
        numbers.some((number, index) => !Number.isFinite(number) || Math.abs(number) > (index % 2 ? 180 : 90))) return [];
    const points = [];
    for (let i = 0; i < numbers.length; i += 2) points.push([numbers[i + 1], numbers[i]]);
    if (points.at(-1).some((coordinate, index) => coordinate !== points[0][index])) points.push(points[0]);
    if (points.length < 4 || points.some((point, i) => i && Math.abs(point[0] - points[i-1][0]) > 180)) return [];
    return [{ type: "Polygon", coordinates: [points] }];
  });
}

export async function searchNasaScenes(source, geometryBounds, end) {
  const product = Object.hasOwn(nasaProducts, source) ? nasaProducts[source] : null;
  if (!product?.collection) throw fail("NASA ürünü geçersiz.", 400);
  if (!isISODate(end) || end < "2018-01-01" || end > new Date().toISOString().slice(0,10))
    throw fail("Geçerli bir arama tarihi seç.", 400);
  const from = new Date(Date.parse(end) - 59 * day).toISOString().slice(0,10);
  const b = geometryBounds.map((value, i) => (i < 2 ? Math.floor(value * 100) : Math.ceil(value * 100)) / 100);
  if (b[2] - b[0] > 4 || b[3] - b[1] > 4) throw fail("Arama alanı çok geniş.", 422);
  const query = new URLSearchParams({ collection_concept_id: product.collection, bounding_box: b.join(","),
    temporal: from + "T00:00:00Z," + end + "T23:59:59Z", sort_key: "-start_date", page_size: "10" });
  return cached(query.toString(), async () => {
    const list = (await (await fetchNASA("https://cmr.earthdata.nasa.gov/search/granules.json?" + query)).json()).feed?.entry;
    if (!Array.isArray(list)) throw fail("NASA katalog yanıtı doğrulanamadı.");
    return { from, end, checkedAt: new Date().toISOString(), scenes: list.map(row => ({
      id: row.id, name: row.producer_granule_id || row.title, time: row.time_start, assets: nasaAssets(row), footprints: sceneFootprints(row),
    })) };
  }, 10 * 60000);
}

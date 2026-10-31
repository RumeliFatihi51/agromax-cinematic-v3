import { randomBytes } from "node:crypto";
import { validateGeometry } from "../shared/geometry.js";
const API = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const failure = (message, status = 502) =>
  Object.assign(new Error(message), { status });
const validTime = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
export function weatherPoint(geometry) {
  const { bbox } = validateGeometry(geometry);
  const truncate = (value) => Math.trunc(value * 10000) / 10000;
  return {
    lat: truncate((bbox[1] + bbox[3]) / 2),
    lon: truncate((bbox[0] + bbox[2]) / 2),
  };
}
export function normalizeForecast(payload, requested) {
  const { meta, timeseries } = payload?.properties || {};
  const coordinates = payload?.geometry?.coordinates;
  if (
    payload?.type !== "Feature" ||
    payload?.geometry?.type !== "Point" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !coordinates.slice(0, 2).every(Number.isFinite) ||
    Math.abs(coordinates[0] - requested.lon) > 0.002 ||
    Math.abs(coordinates[1] - requested.lat) > 0.002 ||
    !validTime(meta?.updated_at) ||
    !meta?.units ||
    !Array.isArray(timeseries) ||
    !timeseries.length ||
    timeseries.length > 500
  )
    throw failure("Meteoroloji yanıtının konumu veya yapısı doğrulanamadı.");
  if (
    meta.units.air_temperature !== "celsius" ||
    meta.units.wind_speed !== "m/s" ||
    meta.units.precipitation_amount !== "mm"
  )
    throw failure(
      "Meteoroloji birimleri beklenen veri sözleşmesiyle eşleşmiyor.",
    );
  const details = (values = {}) =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        let valid =
          Number.isFinite(value) && typeof meta.units[key] === "string";
        if (meta.units[key] === "%") valid &&= value >= 0 && value <= 100;
        if (
          /^(?:precipitation_amount|wind_speed|wind_speed_of_gust)$/.test(key)
        )
          valid &&= value >= 0;
        if (key === "wind_from_direction") valid &&= value >= 0 && value <= 360;
        return [key, valid ? value : null];
      }),
    );
  let previous = -Infinity;
  const points = timeseries.map((row) => {
    const time = Date.parse(row.time);
    if (!validTime(row.time) || time <= previous || !row.data?.instant?.details)
      throw failure("Meteoroloji zaman dizisi doğrulanamadı.");
    previous = time;
    const periods = [1, 6, 12].flatMap((hours) => {
      const period = row.data[`next_${hours}_hours`];
      return period
        ? [
            {
              hours,
              from: row.time,
              to: new Date(time + hours * 3600000).toISOString(),
              symbol:
                typeof period.summary?.symbol_code === "string"
                  ? period.summary.symbol_code
                  : null,
              values: details(period.details),
            },
          ]
        : [];
    });
    return {
      time: row.time,
      values: details(row.data.instant.details),
      periods,
    };
  });
  if (!points.some((point) => Number.isFinite(point.values.air_temperature)))
    throw failure("Sağlayıcı geçerli sıcaklık tahmini döndürmedi.");
  return {
    source: "MET Norway · Locationforecast 2.0",
    sourceUrl: "https://www.met.no/en",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    type: "forecast",
    method: "met-locationforecast-complete-v1",
    updatedAt: meta.updated_at,
    point: { lat: coordinates[1], lon: coordinates[0] },
    queryPoint: requested,
    modelElevationM: Number.isFinite(coordinates[2]) ? coordinates[2] : null,
    pointMethod:
      "Parsel çevreleyen dikdörtgeninin orta noktası; yerel istasyon ölçümü değildir.",
    units: meta.units,
    points,
  };
}
export async function createWeatherService(
  db,
  { fetcher = fetch, now = () => Date.now() } = {},
) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS weather_cache(key TEXT PRIMARY KEY,body TEXT,expires BIGINT NOT NULL DEFAULT 0,last_modified TEXT,fetched_at TEXT,checked_at TEXT,lease_owner TEXT,lease_until BIGINT NOT NULL DEFAULT 0,retry_after BIGINT NOT NULL DEFAULT 0)`,
  );
  const pending = new Map();
  const read = (key) =>
    db.prepare("SELECT * FROM weather_cache WHERE key=?").get(key);
  const envelope = (row) => ({
    ...JSON.parse(row.body),
    fetchedAt: row.fetched_at,
    checkedAt: row.checked_at,
    cacheExpiresAt: new Date(Number(row.expires)).toISOString(),
  });
  async function load(point) {
    const key = `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
    const cached = await read(key);
    if (cached?.body && Number(cached.expires) > now()) return envelope(cached);
    const owner = randomBytes(16).toString("hex");
    const claimed = await db.transaction(async (tx) => {
      await tx
        .prepare(
          "INSERT INTO weather_cache(key) VALUES(?) ON CONFLICT(key) DO NOTHING",
        )
        .run(key);
      return tx
        .prepare(
          "UPDATE weather_cache SET lease_owner=?,lease_until=? WHERE key=? AND lease_until<? AND expires<=? AND retry_after<=? RETURNING *",
        )
        .get(owner, now() + 45000, key, now(), now(), now());
    });
    if (!claimed) {
      const current = await read(key);
      if (current?.body && Number(current.expires) > now())
        return envelope(current);
      throw failure(
        Number(current?.retry_after) > now()
          ? "Meteoroloji servisi geçici olarak beklemeye alındı. Biraz sonra tekrar deneyin."
          : "Bu konumun tahmini hazırlanıyor. Biraz sonra tekrar deneyin.",
        503,
      );
    }
    let backoff = 60000;
    try {
      const url = new URL(API);
      url.searchParams.set("lat", point.lat.toFixed(4));
      url.searchParams.set("lon", point.lon.toFixed(4));
      const response = await fetcher(url, {
        headers: {
          "User-Agent": "Agromax/1.0 github.com/erdoganenestr/Agromax",
          ...(claimed.last_modified
            ? { "If-Modified-Since": claimed.last_modified }
            : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
      const retry = response.headers.get("retry-after");
      if (retry)
        backoff = /^\d+$/.test(retry)
          ? Math.max(60000, Number(retry) * 1000)
          : Math.max(60000, Date.parse(retry) - now() || 60000);
      if (response.status !== 304 && !response.ok)
        throw failure(
          `Meteoroloji sağlayıcısı HTTP ${response.status} döndürdü.`,
          response.status === 429 ? 429 : 502,
        );
      const expires = Date.parse(response.headers.get("expires"));
      const expiry =
        Number.isFinite(expires) && expires > now() ? expires : now() + 600000;
      let forecast;
      if (response.status === 304) {
        if (!claimed.body)
          throw failure(
            "Sağlayıcı önbellekte olmayan bir tahmine işaret etti.",
          );
        forecast = JSON.parse(claimed.body);
      } else {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw failure("Meteoroloji sağlayıcısının yanıtı okunamadı.");
        }
        forecast = normalizeForecast(payload, point);
      }
      if (
        Date.parse(forecast.updatedAt) > now() + 3600000 ||
        !forecast.points.some((p) => Date.parse(p.time) >= now())
      )
        throw failure("Sağlayıcı kullanılabilir güncel tahmin döndürmedi.");
      const stamp = new Date(now()).toISOString();
      await db
        .prepare(
          "UPDATE weather_cache SET body=?,expires=?,last_modified=?,fetched_at=?,checked_at=?,lease_owner=NULL,lease_until=0,retry_after=0 WHERE key=? AND lease_owner=?",
        )
        .run(
          JSON.stringify(forecast),
          expiry,
          response.headers.get("last-modified") ||
            claimed.last_modified ||
            null,
          response.status === 304 ? claimed.fetched_at : stamp,
          stamp,
          key,
          owner,
        );
      return envelope(await read(key));
    } catch (error) {
      await db
        .prepare(
          "UPDATE weather_cache SET lease_owner=NULL,lease_until=0,retry_after=? WHERE key=? AND lease_owner=?",
        )
        .run(now() + backoff, key, owner);
      if (error.status) throw error;
      throw failure(
        error.name === "TimeoutError"
          ? "Meteoroloji isteği zaman aşımına uğradı."
          : "Meteoroloji verisi alınamadı. Tekrar deneyin.",
        error.name === "TimeoutError" ? 504 : 502,
      );
    }
  }
  return {
    async forecast(userId, fieldId) {
      const row = await db
        .prepare(
          "SELECT body FROM records WHERE id=? AND user_id=? AND kind='field'",
        )
        .get(fieldId, userId);
      const field = row && JSON.parse(row.body);
      if (!field || field.deletedAt) throw failure("Parsel bulunamadı.", 404);
      if (!field.geometry)
        throw failure(
          "Meteoroloji için önce haritadan parsel sınırını çizin.",
          422,
        );
      const point = weatherPoint(field.geometry),
        key = `${point.lat},${point.lon}`;
      if (!pending.has(key))
        pending.set(
          key,
          load(point).finally(() => pending.delete(key)),
        );
      return { fieldId, fieldName: field.name, ...(await pending.get(key)) };
    },
  };
}

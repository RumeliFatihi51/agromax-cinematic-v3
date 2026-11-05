import { z } from "zod";
import { localDate } from "../../shared/contracts/commercial";
import { DomainError } from "../core/errors";
export const powerParameters = {
  T2M: { unit: "C", tr: "Ortalama sıcaklık", en: "Mean temperature" },
  T2M_MAX: { unit: "C", tr: "En yüksek sıcaklık", en: "Maximum temperature" },
  T2M_MIN: { unit: "C", tr: "En düşük sıcaklık", en: "Minimum temperature" },
  RH2M: { unit: "%", tr: "Bağıl nem", en: "Relative humidity" },
  WS2M: { unit: "m/s", tr: "2 m rüzgâr hızı", en: "Wind speed at 2 m" },
  ALLSKY_SFC_SW_DWN: {
    unit: "MJ/m^2/day",
    tr: "Kısa dalga güneş ışınımı",
    en: "Shortwave solar radiation",
  },
  PRECTOTCORR: {
    unit: "mm/day",
    tr: "Düzeltilmiş yağış",
    en: "Corrected precipitation",
  },
  PS: { unit: "kPa", tr: "Yüzey basıncı", en: "Surface pressure" },
} as const;
export const historyInput = z
  .object({ start: localDate, end: localDate })
  .strict()
  .refine(
    (v) =>
      v.start <= v.end &&
      Date.parse(v.end) - Date.parse(v.start) <= 365 * 86400000,
    "Date range must be at most 366 days",
  );
export function normalizePower(
  payload: unknown,
  point: { lat: number; lng: number },
  range: { start: string; end: string },
) {
  const data = z
    .object({
      header: z.object({
        fill_value: z.number(),
        time_standard: z.enum(["LST", "UTC"]),
        start: z.string(),
        end: z.string(),
        sources: z.array(z.string()),
        api: z.object({ version: z.string() }),
      }),
      geometry: z.object({ coordinates: z.array(z.number()).min(2) }),
      parameters: z.record(
        z.string(),
        z.object({ units: z.string(), longname: z.string() }),
      ),
      properties: z.object({
        parameter: z.record(z.string(), z.record(z.string(), z.number())),
      }),
    })
    .parse(payload);
  if (
    Math.abs(data.geometry.coordinates[0]! - point.lng) > 0.001 ||
    Math.abs(data.geometry.coordinates[1]! - point.lat) > 0.001 ||
    data.header.start !== range.start.replaceAll("-", "") ||
    data.header.end !== range.end.replaceAll("-", "")
  )
    throw new DomainError(
      "WRONG_PROVIDER_RANGE",
      "Sağlayıcının konumu veya tarih aralığı eşleşmiyor.",
      502,
    );
  for (const [key, parameter] of Object.entries(powerParameters))
    if (
      data.parameters[key]?.units !== parameter.unit ||
      !data.properties.parameter[key]
    )
      throw new DomainError(
        "INVALID_PROVIDER_UNIT",
        "Meteoroloji değişkenleri veya birimleri doğrulanamadı.",
        502,
      );
  const days = [];
  for (
    let at = Date.parse(range.start);
    at <= Date.parse(range.end);
    at += 86400000
  ) {
    const date = new Date(at).toISOString().slice(0, 10),
      key = date.replaceAll("-", "");
    const values = Object.fromEntries(
      Object.keys(powerParameters).map((id) => {
        const value = data.properties.parameter[id]![key];
        return [
          id,
          typeof value === "number" &&
          Number.isFinite(value) &&
          value !== data.header.fill_value
            ? value
            : null,
        ];
      }),
    );
    const valid = (id: string, min: number, max = Infinity) =>
      values[id] === null || (values[id]! >= min && values[id]! <= max);
    if (
      !valid("RH2M", 0, 100) ||
      !valid("WS2M", 0) ||
      !valid("ALLSKY_SFC_SW_DWN", 0) ||
      !valid("PRECTOTCORR", 0) ||
      !valid("PS", 0) ||
      (values.T2M_MIN !== null &&
        values.T2M_MAX !== null &&
        values.T2M_MIN! > values.T2M_MAX!)
    )
      throw new DomainError(
        "INVALID_PROVIDER_VALUE",
        "Sağlayıcı fiziksel aralığın dışında meteoroloji verisi döndürdü.",
        502,
      );
    days.push({ date, values });
  }
  return {
    source: "NASA POWER",
    sourceURL: "https://power.larc.nasa.gov/docs/services/api/temporal/",
    kind: "model_estimate" as const,
    timeStandard: data.header.time_standard,
    sources: data.header.sources,
    methodVersion: `power-daily-${data.header.api.version}`,
    point,
    range,
    fetchedAt: new Date().toISOString(),
    parameters: powerParameters,
    observations: days,
    nativeGrid:
      "Meteoroloji ve güneş ışınımı kaynaklarına göre değişen ızgara; parselde yerinde ölçüm değildir.",
  };
}
export async function fetchPower(
  point: { lat: number; lng: number },
  range: { start: string; end: string },
  request = fetch,
) {
  const dates = historyInput.parse(range);
  if (dates.end >= new Date().toISOString().slice(0, 10))
    throw new DomainError(
      "HISTORICAL_DATE_REQUIRED",
      "Geçmişte tamamlanmış günleri seçin.",
    );
  const url = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
  url.search = new URLSearchParams({
    parameters: Object.keys(powerParameters).join(","),
    community: "AG",
    latitude: String(point.lat),
    longitude: String(point.lng),
    start: dates.start.replaceAll("-", ""),
    end: dates.end.replaceAll("-", ""),
    format: "JSON",
    "time-standard": "LST",
  }).toString();
  const response = await request(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok)
    throw new DomainError(
      "WEATHER_PROVIDER_ERROR",
      `NASA POWER yanıtı alınamadı (${response.status}).`,
      response.status === 429 ? 429 : 502,
    );
  return normalizePower(await response.json(), point, dates);
}

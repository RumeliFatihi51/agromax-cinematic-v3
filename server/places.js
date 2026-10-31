const cache = new Map();
let nextRequestAt = 0;
export function normalizePlaces(payload) {
  if (!Array.isArray(payload?.features))
    throw new Error("Yer arama sağlayıcısı geçersiz yanıt verdi.");
  return payload.features
    .flatMap((feature) => {
      const coordinates = feature.geometry?.coordinates,
        p = feature.properties || {};
      if (
        feature.geometry?.type !== "Point" ||
        !Array.isArray(coordinates) ||
        coordinates.length < 2
      )
        return [];
      const [lng, lat] = coordinates;
      if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        Math.abs(lng) > 180 ||
        Math.abs(lat) > 85
      )
        return [];
      const name = String(
        p.name || p.street || p.city || p.county || "",
      ).trim();
      if (!name) return [];
      const address = [
        p.housenumber && p.street ? `${p.street} ${p.housenumber}` : p.street,
        p.district,
        p.city,
        p.county,
        p.state,
        p.country,
      ]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i && v !== name)
        .join(", ");
      const box = p.extent;
      const bbox =
        Array.isArray(box) &&
        box.length === 4 &&
        box.every(Number.isFinite) &&
        box[0] <= lng &&
        box[2] >= lng &&
        box[1] <= lat &&
        box[3] >= lat &&
        box[0] >= -180 &&
        box[2] <= 180 &&
        box[1] >= -85 &&
        box[3] <= 85
          ? box
          : null;
      return [
        {
          id: `${p.osm_type || "place"}-${p.osm_id || `${lat},${lng}`}`,
          name: name.slice(0, 200),
          address: address.slice(0, 500),
          lat,
          lng,
          bbox,
        },
      ];
    })
    .slice(0, 6);
}
export async function searchPlaces(query, { lat = 39, lng = 35 } = {}) {
  const q = String(query || "")
    .trim()
    .replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 200) {
    const e = new Error("Arama 2–200 karakter olmalı.");
    e.status = 400;
    throw e;
  }
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 85 ||
    Math.abs(lng) > 180
  ) {
    const e = new Error("Arama konumu geçersiz.");
    e.status = 400;
    throw e;
  }
  const endpoint = new URL(
    process.env.GEOCODING_URL || "https://photon.komoot.io/api/",
  );
  if (
    endpoint.protocol !== "https:" &&
    !(
      endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(endpoint.hostname)
    )
  )
    throw new Error("Yer arama servisi HTTPS kullanmalı.");
  const key = JSON.stringify([
      endpoint.href,
      q.toLocaleLowerCase("tr-TR"),
      lat.toFixed(2),
      lng.toFixed(2),
    ]),
    saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.data;
  if (Date.now() < nextRequestAt) {
    const e = new Error("Bir saniye bekleyip yeniden arayın.");
    e.status = 429;
    throw e;
  }
  nextRequestAt = Date.now() + 1100;
  endpoint.searchParams.set("q", q);
  endpoint.searchParams.set("limit", "6");
  endpoint.searchParams.set("lat", String(lat));
  endpoint.searchParams.set("lon", String(lng));
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "Agromax/0.1 (local agricultural parcel manager)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const e = new Error(
      response.status === 429
        ? "Yer arama servisi yoğun. Biraz sonra tekrar deneyin."
        : "Yer arama servisine ulaşılamadı. Tekrar deneyin.",
    );
    e.status = response.status === 429 ? 429 : 502;
    throw e;
  }
  const results = normalizePlaces(await response.json());
  const data = {
    results,
    attribution: "© OpenStreetMap katkıcıları · Photon",
    source: "Photon / OpenStreetMap",
  };
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(key, { data, expires: Date.now() + 3600000 });
  return data;
}

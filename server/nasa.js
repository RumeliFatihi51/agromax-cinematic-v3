import { createHash } from "node:crypto";

const DAY = 86400000;
const fingerprint = (value) =>
  createHash("sha256")
    .update(value || "")
    .digest("hex");
const failure = (message, status = 502) =>
  Object.assign(new Error(message), { status });
const definitions = {
  nasa: { key: "NASA_API_KEY", label: "NASA Open APIs" },
  earthdata: { key: "EARTHDATA_TOKEN", label: "NASA Earthdata · HLS" },
};
const readJson = async (response) => {
  if (!response.ok)
    throw failure(
      `Veri sağlayıcısı HTTP ${response.status} döndürdü.`,
      response.status,
    );
  try {
    return await response.json();
  } catch {
    throw failure("Veri sağlayıcısının yanıtı doğrulanamadı.");
  }
};

export async function createNasaService(
  db,
  { fetcher = fetch, now = () => new Date() } = {},
) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS integration_checks(provider TEXT PRIMARY KEY,credential_hash TEXT NOT NULL,checked_at TEXT NOT NULL,body TEXT NOT NULL)",
  );
  let pending;
  async function status() {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(definitions).map(async ([id, d]) => {
          const value = process.env[d.key];
          const record =
            value &&
            (await db
              .prepare(
                "SELECT credential_hash,checked_at,body FROM integration_checks WHERE provider=?",
              )
              .get(id));
          const check =
            record?.credential_hash === fingerprint(value)
              ? JSON.parse(record.body)
              : null;
          return [
            id,
            {
              label: d.label,
              configured: !!value,
              state: !value
                ? "missing_configuration"
                : check?.state || "not_verified",
              checkedAt: check ? record.checked_at : null,
              detail: check?.detail || null,
              evidence: check?.evidence || null,
            },
          ];
        }),
      ),
    );
  }
  async function send(url, options = {}) {
    try {
      return await fetcher(url, {
        ...options,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw failure(
        e.name === "TimeoutError"
          ? "Veri sağlayıcısı zaman aşımına uğradı."
          : "Veri sağlayıcısına bağlanılamadı.",
        e.name === "TimeoutError" ? 504 : 502,
      );
    }
  }
  async function verifyKey(key) {
    // This small documented API request checks gateway authentication only.
    // Its astronomy payload is discarded and never becomes agricultural data.
    const date = new Date(now().valueOf() - DAY).toISOString().slice(0, 10);
    const url = new URL("https://api.nasa.gov/neo/rest/v1/feed");
    Object.entries({ start_date: date, end_date: date, api_key: key }).forEach(
      ([k, v]) => url.searchParams.set(k, v),
    );
    const response = await send(url);
    const data = await readJson(response);
    if (
      !data.near_earth_objects ||
      typeof data.near_earth_objects !== "object" ||
      Array.isArray(data.near_earth_objects) ||
      !Number.isFinite(data.element_count)
    )
      throw failure(
        "NASA anahtar kontrolü beklenen servis yanıtını döndürmedi.",
      );
    return {
      state: "verified",
      detail:
        "NASA API anahtarı gerçek servis isteğiyle doğrulandı. Bu kontrol tarımsal veri üretmez.",
      evidence: { credentialCheckOnly: true, httpStatus: response.status },
    };
  }
  async function verifyEarthdata(token) {
    const start = new Date(now().valueOf() - 30 * DAY),
      end = new Date(start.valueOf() + DAY);
    const url = new URL("https://cmr.earthdata.nasa.gov/search/granules.json");
    Object.entries({
      short_name: "HLSL30",
      version: "2.0",
      page_size: "1",
      sort_key: "-start_date",
      temporal: `${start.toISOString().slice(0, 10)}T00:00:00Z,${end.toISOString().slice(0, 10)}T00:00:00Z`,
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    const catalog = await readJson(await send(url));
    const granule = catalog.feed?.entry?.[0];
    const asset = granule?.links?.find((link) => {
      try {
        const u = new URL(link.href);
        return (
          u.protocol === "https:" &&
          u.hostname === "data.lpdaac.earthdatacloud.nasa.gov" &&
          u.pathname.endsWith(".B04.tif")
        );
      } catch {
        return false;
      }
    });
    if (!asset || typeof granule.id !== "string")
      throw failure(
        "HLS erişim kontrolü için gerçek bant kaydı bulunamadı. Token geçerliliği doğrulanamadı.",
      );
    let response = await send(asset.href, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-3" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      let target;
      try {
        target = new URL(location);
      } catch {
        throw failure("Earthdata geçerli veri yönlendirmesi döndürmedi.");
      }
      if (target.hostname === "urs.earthdata.nasa.gov")
        throw failure(
          "Earthdata tokenı bu veri kaynağına erişim için kabul edilmedi. Tokenı ve uygulama yetkisini kontrol edin.",
          401,
        );
      if (
        target.protocol !== "https:" ||
        !(
          target.hostname.endsWith(".cloudfront.net") ||
          target.hostname.endsWith(".amazonaws.com")
        )
      )
        throw failure(
          "Earthdata beklenmeyen bir veri sunucusuna yönlendirdi; kimlik bilgileri iletilmedi.",
        );
      // Never forward the user's bearer token to a CDN or signed S3 URL.
      response = await send(target, {
        redirect: "manual",
        headers: { Range: "bytes=0-3" },
      });
    }
    if (![200, 206].includes(response.status)) {
      await response.body?.cancel();
      throw failure(
        `Earthdata bant erişimi HTTP ${response.status} döndürdü.`,
        response.status,
      );
    }
    const reader = response.body?.getReader();
    const first = await reader?.read();
    await reader?.cancel();
    const signature = first?.value
      ? Buffer.from(first.value).subarray(0, 4).toString("hex")
      : null;
    if (!["49492a00", "4d4d002a", "49492b00", "4d4d002b"].includes(signature))
      throw failure(
        "Earthdata yanıtında gerçek TIFF bant verisi doğrulanamadı.",
      );
    return {
      state: "verified",
      detail:
        "Korumalı HLS bant dosyasına erişim doğrulandı. HLS raster analizi henüz uygulanmadı; mevcut parsel sonuçları Sentinel-2 kaynağını kullanır.",
      evidence: {
        collection: "HLSL30 v2.0",
        granuleId: granule.id,
        asset: new URL(asset.href).pathname.split("/").at(-1),
        httpStatus: response.status,
        tiffSignature: signature,
        rasterAnalysisAvailable: false,
      },
    };
  }
  async function run() {
    await Promise.all(
      Object.entries(definitions).map(async ([id, d]) => {
        const value = process.env[d.key];
        if (!value) return;
        let check;
        try {
          check = await (id === "nasa"
            ? verifyKey(value)
            : verifyEarthdata(value));
        } catch (e) {
          check = {
            state: [401, 403].includes(e.status)
              ? "unauthorized"
              : e.status === 429
                ? "rate_limited"
                : "unavailable",
            detail: e.status ? e.message : "Veri kaynağı doğrulanamadı.",
            evidence: null,
          };
        }
        await db
          .prepare(
            "INSERT INTO integration_checks VALUES(?,?,?,?) ON CONFLICT(provider) DO UPDATE SET credential_hash=excluded.credential_hash,checked_at=excluded.checked_at,body=excluded.body",
          )
          .run(
            id,
            fingerprint(value),
            now().toISOString(),
            JSON.stringify(check),
          );
      }),
    );
    return status();
  }
  return {
    status,
    async verify() {
      const current = await status();
      const configured = Object.values(current).filter((s) => s.configured);
      if (
        configured.length &&
        configured.every(
          (s) =>
            s.state === "verified" &&
            now().valueOf() - Date.parse(s.checkedAt) < 300000,
        )
      )
        return Promise.resolve(current);
      if (!pending)
        pending = run().finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}

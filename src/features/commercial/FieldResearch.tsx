import { useEffect, useRef, useState, type FormEvent } from "react";
import { Star, Search, Satellite, LoaderCircle } from "lucide-react";
import { api, requestAnalysis } from "../../api";
import { metrics, observationAngles } from "../../../shared/metrics.js";
import { choose, type Locale } from "./i18n";
import type { ReportSnapshot } from "../../../commercial/reports/service";
import "./commercial.css";
type Scene = {
  id: string;
  properties: {
    datetime: string;
    "eo:cloud_cover"?: number;
    platform?: string;
  };
};
type RadarResult = Awaited<ReturnType<typeof import("../../../server/satellite.js").fetchRadarStatistics>>;
type CatalogResult = {
  kind: "observation_metadata";
  scenes: Scene[];
  source: string;
  fetchedAt: string;
  rasterAccess?: "configured" | "unavailable";
  truncated?: boolean;
  raster?: Awaited<ReturnType<typeof import("../../../commercial/analyses/landsat-raster").analyzeLandsatRaster>>;
};
const catalog = [...metrics, ...observationAngles];
export default function FieldResearch({
  fieldId,
  analysis,
  locale,
  favorites,
  onFavorites,
  canAnalyze = true,
  customAnalysisEnabled = true,
}: {
  fieldId: string;
  analysis: ReportSnapshot["analysis"] | null;
  locale: Locale;
  favorites: string[];
  onFavorites: (ids: string[]) => Promise<void>;
  canAnalyze?: boolean;
  customAnalysisEnabled?: boolean;
}) {
  const customRequest = useRef<AbortController | null>(null);
  const [customAnalysis, setCustomAnalysis] = useState<
      ReportSnapshot["analysis"] | null
    >(null),
    [analysisBusy, setAnalysisBusy] = useState(false),
    [job, setJob] = useState<{ id: string; state: string } | null>(null);
  useEffect(() => () => customRequest.current?.abort(), []);
  const [query, setQuery] = useState(""),
    [onlyFavorites, setOnlyFavorites] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<CatalogResult | RadarResult | null>(null),
    [source, setSource] = useState(""),
    [cloud, setCloud] = useState(100),
    [first, setFirst] = useState(""),
    [second, setSecond] = useState("");
  const t = (a: string, b: string) => choose(locale, a, b),
    observations = (customAnalysis || analysis)?.observations || [],
    a = observations.find((o) => o.from === first),
    b = observations.find((o) => o.from === second);
  const scenes = result && "scenes" in result ? result : null;
  const radar = result && "observations" in result ? result : null;
  const radarSelected = source === "ASCENDING" || source === "DESCENDING";
  const landsatSelected = source === "reflectance" || source === "temperature";
  const number = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? v.toLocaleString(locale, { maximumFractionDigits: 5 })
      : "—";
  const filtered = catalog.filter(
    (m) =>
      (!onlyFavorites || favorites.includes(m.id)) &&
      `${m.id} ${m.label} ${m.description}`
        .toLocaleLowerCase(locale)
        .includes(query.toLocaleLowerCase(locale)),
  );
  const valid = (o: typeof a, id: string) => {
    const stat = o?.stats[id];
    return stat && stat.coverage >= 0.7 ? stat.mean : null;
  };
  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const { processLatest, ...dates } = values;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await api("v1/observations/search", {
        ...dates,
        fieldId,
        ...(radarSelected ? { radarOrbit: source } : {}),
        ...(landsatSelected ? { landsat: source, ...(processLatest ? { processLatest: true } : {}) } : {}),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function favorite(id: string) {
    setError("");
    try {
      await onFavorites(
        favorites.includes(id)
          ? favorites.filter((v) => v !== id)
          : [...favorites, id],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }
  async function runCustom(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as {
      start: string;
      split: string;
      end: string;
    };
    const controller = new AbortController();
    customRequest.current?.abort();
    customRequest.current = controller;
    setAnalysisBusy(true);
    setError("");
    setCustomAnalysis(null);
    setJob(null);
    try {
      const result = await requestAnalysis(fieldId, {
        range: data,
        signal: controller.signal,
        onJob: setJob,
      });
      setCustomAnalysis(result.analysis);
      setFirst("");
      setSecond("");
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (customRequest.current === controller) setAnalysisBusy(false);
    }
  }
  async function cancelCustom() {
    if (!job) return;
    try {
      await api(`analyses/${job.id}/cancel`, {});
      customRequest.current?.abort();
      setAnalysisBusy(false);
      setJob(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }
  return (
    <div className="business-workspace">
      {customAnalysisEnabled && (
        <section className="business-settings-section">
          <h2>{t("Özel dönem analizi", "Custom period analysis")}</h2>
          <p>
            {t(
              "İki dönemi ayıran tarihi seç. İlk gün dahildir; bölme tarihi ikinci döneme aittir. Tarihler UTC'dir; en fazla 93 gün seçebilirsin.",
              "Select the boundary between two periods. The first date is included; the split date belongs to the second period. Dates use UTC; choose at most 93 days.",
            )}
          </p>
          <form onSubmit={runCustom}>
            <div className="business-form-grid">
              <label>
                {t("İlk dönemin başlangıcı", "Start of first period")}
                <input name="start" type="date" required />
              </label>
              <label>
                {t("İkinci dönemin başlangıcı", "Start of second period")}
                <input name="split" type="date" required />
              </label>
              <label>
                {t("Son gün (dahil)", "Last day (inclusive)")}
                <input
                  name="end"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
            </div>
            <button className="primary" disabled={!canAnalyze || analysisBusy}>
              {analysisBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Satellite size={16} />
              )}{" "}
              {analysisBusy
                ? t("Tüm çıktılar işleniyor…", "Processing all outputs…")
                : t("Dönemleri analiz et", "Analyze periods")}
            </button>
            {!canAnalyze && (
              <p>
                {t(
                  "Analiz başlatmak için uygun rol ve doğrulanmış e-posta gerekir.",
                  "Starting an analysis requires an authorized role and a verified email.",
                )}
              </p>
            )}
          </form>
          {job && (
            <p role="status">
              {t("Analiz kaydı", "Analysis record")}: {job.id} · {job.state}
            </p>
          )}
          {analysisBusy && job && (
            <button className="business-link-button" onClick={cancelCustom}>
              {t("İşi iptal et", "Cancel job")}
            </button>
          )}
          {customAnalysis && (
            <p className="business-action-status" role="status">
              {t(
                "Özel dönem analizi tamamlandı. Aşağıdaki karşılaştırma bu sonuca aittir; aylık özet değiştirilmedi.",
                "Custom period analysis completed. The comparison below uses this result; the monthly summary is unchanged.",
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      )}
      <section className="business-settings-section">
        <h2>
          <Satellite size={20} />{" "}
          {t("Bağımsız uydu gözlemi araması", "Independent observation search")}
        </h2>
        <p>
          {t(
            "Sentinel veya Landsat gözlemlerini ara. Tarihler UTC'dir.",
            "Search Sentinel or Landsat observations. Dates use UTC.",
          )}
        </p>
        <form onSubmit={search}>
          {customAnalysisEnabled && (
            <label>
              {t("Uydu ürünü", "Satellite product")}
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Sentinel-2 L2A</option>
                <option value="ASCENDING" disabled={!canAnalyze}>{t("Sentinel-1 · Yükselen yörünge", "Sentinel-1 · Ascending orbit")}</option>
                <option value="DESCENDING" disabled={!canAnalyze}>{t("Sentinel-1 · Alçalan yörünge", "Sentinel-1 · Descending orbit")}</option>
                <option value="reflectance">{t("Landsat 8/9 · Yüzey yansıtımı", "Landsat 8/9 · Surface reflectance")}</option>
                <option value="temperature">{t("Landsat 8/9 · Yüzey sıcaklığı", "Landsat 8/9 · Surface temperature")}</option>
              </select>
            </label>
          )}
          <div className="business-form-grid">
            <label>
              {t("Başlangıç", "Start")}
              <input
                key={radarSelected ? "radar-start" : "optical-start"}
                type="date"
                name="start"
                required
                defaultValue={new Date(Date.now() - (radarSelected ? 7 : 60) * 86400000)
                  .toISOString()
                  .slice(0, 10)}
              />
            </label>
            <label>
              {t("Bitiş", "End")}
              <input
                key={radarSelected ? "radar-end" : "optical-end"}
                type="date"
                name="end"
                required
                defaultValue={new Date(Date.now() - (radarSelected ? 86400000 : 0)).toISOString().slice(0, 10)}
              />
            </label>
          </div>
          {landsatSelected && canAnalyze && <label>
            <span><input name="processLatest" type="checkbox" style={{ width: "auto" }} /> {t("Erişim varsa en güncel Landsat sahnesini işle", "Process the newest Landsat scene when access is available")}</span>
          </label>}
          <button className="secondary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Search size={16} />
            )}{" "}
            {radarSelected ? t("Radar istatistiklerini al", "Get radar statistics") : t("Çekimleri ara", "Search acquisitions")}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {radar && (
          <>
            <p>{radar.source} · {radar.orbit} · {radar.gridMetres} m · {radar.methodVersion}</p>
            {radar.state !== "available" && <p role="status">
              {radar.state === "masked"
                ? t("Geçerli radar pikseli bulunamadı.", "No valid radar pixels.")
                : t("Bu aralıkta radar gözlemi bulunamadı.", "No radar observations in this interval.")}
            </p>}
            {radar.observations.length > 0 && (
              <div className="business-table-scroll">
                <table className="research-table">
                  <thead><tr>
                    <th>{t("Gün (UTC)", "Day (UTC)")}</th><th>VV γ₀</th><th>VH γ₀</th>
                    <th>{t("Yerel geliş açısı", "Local incidence angle")} (°)</th>
                    <th>{t("Geçerli / toplam piksel", "Valid / total pixels")}</th>
                  </tr></thead>
                  <tbody>{radar.observations.map((day) => <tr key={day.from}>
                    <td>{day.from.slice(0, 10)}</td><td>{number(day.vv)}</td><td>{number(day.vh)}</td>
                    <td>{number(day.incidenceDegrees)}</td><td>{day.validPixels} / {day.sampleCount}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
            <p className="business-muted">{t(
              "VV ve VH doğrusal geri saçılım gücüdür. Radar gölgesi dışlanır. Toprak nemi ölçümü için ayrı saha verisi gerekir.",
              "VV and VH are linear backscatter power. Radar shadow is excluded. Soil moisture requires independent field data.",
            )}</p>
          </>
        )}
        {scenes && (
          <>
            <label>
              {t(
                "En yüksek karo bulutluluğu (%)",
                "Maximum tile cloud cover (%)",
              )}
              <select
                value={cloud}
                onChange={(e) => setCloud(Number(e.target.value))}
              >
                {[10, 20, 40, 60, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="business-table-scroll">
              <table className="research-table">
                <thead>
                  <tr>
                    <th>{t("Çekim (UTC)", "Acquisition (UTC)")}</th>
                    <th>{t("Karo bulutluluğu (%)", "Tile cloud cover (%)")}</th>
                    <th>{t("Platform / kayıt", "Platform / record")}</th>
                  </tr>
                </thead>
                <tbody>
                  {scenes.scenes
                    .filter((s) =>
                      s.properties["eo:cloud_cover"] === undefined
                        ? cloud === 100
                        : s.properties["eo:cloud_cover"]! <= cloud,
                    )
                    .map((s) => (
                      <tr key={s.id}>
                        <td>{s.properties.datetime}</td>
                        <td>{number(s.properties["eo:cloud_cover"])}</td>
                        <td>
                          {s.properties.platform || "—"}
                          <br />
                          <small>{s.id}</small>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {scenes.scenes.length === 0 && (
              <p>
                {t(
                  "Bu tarih aralığında katalog kaydı bulunamadı.",
                  "No catalog records in this date range.",
                )}
              </p>
            )}
            <p className="business-muted">
              {scenes.source} · {scenes.fetchedAt}
              <br />
              {t(
                "Karo bulutluluğu parselin geçerli piksel oranı değildir. Eksik bulut metadatası yalnızca %100 filtresinde gösterilir.",
                "Tile cloud cover is not parcel pixel coverage. Missing cloud metadata is shown only with the 100% filter.",
              )}
            </p>
            {scenes.truncated && <p>{t("İlk 50 sahne gösteriliyor. Daha dar bir tarih aralığı seçin.", "The first 50 scenes are shown. Select a narrower date range.")}</p>}
            {scenes.rasterAccess === "unavailable" && <p role="status">{t("USGS katalog kaydı mevcut. Piksel işleme için yetkili COG erişimi gerekiyor.", "USGS catalog is available. Pixel processing requires authorized COG access.")}</p>}
            {scenes.raster && (
              <section>
                <h3>{t("Parsel penceresi", "Parcel window")}</h3>
                <p>{scenes.raster.sceneId} · {scenes.raster.gridMetres} m · {scenes.raster.validPixels} / {scenes.raster.coveredPixels} {t("geçerli piksel", "valid pixels")}</p>
                {scenes.raster.thermalNativeResolutionMetres && <p>{t("Termal kaynak çözünürlüğü", "Native thermal resolution")}: {scenes.raster.thermalNativeResolutionMetres} m</p>}
                {scenes.raster.state === "available" ? <dl>
                  {Object.entries(scenes.raster.means).map(([metric, value]) => <div key={metric}><dt>{metric}</dt><dd>{number(value.mean)}</dd></div>)}
                </dl> : <p>{t("Parsel penceresinde kullanılabilir piksel yok.", "No usable pixels in the parcel window.")}</p>}
              </section>
            )}
          </>
        )}
      </section>
      <section className="business-settings-section">
        <h2>{t("İki gözlemi karşılaştır", "Compare two observations")}</h2>
        {customAnalysis || analysis ? (
          <>
            <p>
              {(customAnalysis || analysis)!.source} ·{" "}
              {(customAnalysis || analysis)!.method}
            </p>
            <div className="business-form-grid">
              <label>
                {t("İlk gözlem (UTC)", "First observation (UTC)")}
                <select
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                >
                  <option value="">{t("Seç", "Select")}</option>
                  {observations.map((o) => (
                    <option key={o.from} value={o.from}>
                      {o.from}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("İkinci gözlem (UTC)", "Second observation (UTC)")}
                <select
                  value={second}
                  onChange={(e) => setSecond(e.target.value)}
                >
                  <option value="">{t("Seç", "Select")}</option>
                  {observations.map((o) => (
                    <option key={o.from} value={o.from}>
                      {o.from}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t("Gösterge ara", "Search metrics")}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="NDVI, NDMI, B08…"
              />
            </label>
            <button
              className="business-link-button"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites((v) => !v)}
            >
              <Star size={16} />
              {onlyFavorites
                ? t("Tüm göstergeler", "All metrics")
                : t("Yalnızca favoriler", "Favorites only")}
            </button>
            <div className="business-table-scroll">
              <table className="research-table">
                <thead>
                  <tr>
                    <th>{t("Favori", "Favorite")}</th>
                    <th>{t("Gösterge / birim", "Metric / unit")}</th>
                    <th>{t("İlk", "First")}</th>
                    <th>{t("İkinci", "Second")}</th>
                    <th>{t("İkinci − ilk", "Second − first")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const av = valid(a, m.id),
                      bv = valid(b, m.id);
                    return (
                      <tr key={m.id}>
                        <td>
                          <button
                            aria-label={`${m.id}: ${t("favoriyi değiştir", "toggle favorite")}`}
                            aria-pressed={favorites.includes(m.id)}
                            onClick={() => favorite(m.id)}
                          >
                            <Star
                              size={17}
                              fill={
                                favorites.includes(m.id) ? "#e7b842" : "none"
                              }
                            />
                          </button>
                        </td>
                        <td title={m.description}>
                          {m.id}
                          <br />
                          <small>{m.unit}</small>
                        </td>
                        <td>{number(av)}</td>
                        <td>{number(bv)}</td>
                        <td>
                          {number(av !== null && bv !== null ? bv - av : null)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="business-muted">
              {t(
                "Karşılaştırma en az %70 geçerli piksel oranı ister; eksik veya az kaliteli gözlemlerde sayı gösterilmez. Farklar yüzde değil gösterge birimindedir.",
                "Comparison requires at least 70% valid pixels. Missing or low-quality observations show no number. Differences use metric units, not percentages.",
              )}
            </p>
          </>
        ) : (
          <p>
            {t(
              "Karşılaştırmak için önce sayısal uydu analizini tamamla.",
              "Complete a numerical satellite analysis before comparing observations.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}

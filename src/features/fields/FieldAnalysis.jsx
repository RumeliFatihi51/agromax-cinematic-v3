import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Satellite,
  CalendarDays,
  ShieldCheck,
  Info,
  Download,
} from "lucide-react";
import ObservationPlot from "./ObservationPlot";
import { api, requestAnalysis } from "../../api";
import { useAreaFormat } from "../../components/PreferenceProvider";
import {
  indices,
  metrics,
  unavailable,
  observationAngles,
  metricAvailability,
} from "../../../shared/metrics";
import SatelliteScene, { sceneDatesFor } from "./SatelliteScene";
import { openSentinelMetrics, openSentinelProvider } from "../../../shared/open-sentinel";
export const number = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString("tr-TR", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })
    : "—";
export const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("tr-TR", {
        timeZone: "Europe/Istanbul",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function FieldAnalysis({
  field,
  onBack,
  onEdit,
  onAnalysis,
  initialAnalysis = null,
  archiveId,
  embedded = false,
  selectedMetric,
  onSelectMetric,
  satellite,
  canAnalyze = true,
  onConnections,
}) {
  const areaFormat = useAreaFormat();
  const Heading = embedded ? "h2" : "h1";
  const request = useRef(null);
  const [analysis, setAnalysis] = useState(initialAnalysis),
    [status, setStatus] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [localMetric, setMetricId] = useState("NDVI"),
    [selectedDate, setSelectedDate] = useState(""),
    [mapMetric, setMapMetric] = useState(null),
    [group, setGroup] = useState("Tümü"),
    [job, setJob] = useState(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
      api("satellite/status")
        .then(setStatus)
        .catch((e) => setError(e.message));
      return;
    }
    let active = true;
    setAnalysis(null);
    setError("");
    api("records/" + field.id + "/analysis")
      .then((data) => {
        if (active) {
          setAnalysis(data.analysis);
          setStatus(data.status);
          onAnalysis?.(field.id, data.analysis);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [field.id, initialAnalysis]);
  const connection = status ?? satellite;
  const openSource = connection?.provider === openSentinelProvider;
  async function retryConnection() {
    try {
      setError("");
      setStatus(await api("satellite/status"));
    } catch (error) {
      setError(error.message);
    }
  }
  async function refresh() {
    if (!connection?.configured || !canAnalyze || busy || !field.geometry) return;
    setBusy(true);
    setError("");
    request.current?.abort();
    request.current = new AbortController();
    try {
      const data = await requestAnalysis(field.id, {
        signal: request.current.signal,
        onJob: setJob,
      });
      setAnalysis(data.analysis);
      setStatus(data.status);
      onAnalysis?.(field.id, data.analysis);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const sceneDates = sceneDatesFor(analysis);
  const imageDate = sceneDates.includes(selectedDate) ? selectedDate : sceneDates[0];
  const catalog = [...metrics, ...observationAngles];
  const metricId = catalog.some((metric) => metric.id === selectedMetric) ? selectedMetric : localMetric;
  const provider = analysis?.provider || status?.provider || "cdse";
  const availability = (id) => provider === openSentinelProvider
    ? openSentinelMetrics.some(metric => metric.id === id) ? null : "Bu katman açık Sentinel-2 arşivi analizinde yok."
    : metricAvailability(id, provider);
  const layers = provider === openSentinelProvider ? openSentinelMetrics.map(({ id }) => ({ id, label: id })) : [
    { id: "RGB", label: "Doğal renk (RGB)" },
    ...catalog.filter(({ id }) => !availability(id))
      .map(({ id }) => ({ id, label: id })),
  ];
  function selectMetric(id) {
    if (onSelectMetric) onSelectMetric(id);
    else setMetricId(id);
    if (layers.some((layer) => layer.id === id)) setMapMetric(id);
  }
  const metric = catalog.find((m) => m.id === metricId),
    comparison = analysis?.comparison?.[metricId];
  const observations =
    analysis?.observations?.filter((o) => o.stats[metricId]) || [];
  const canCompare = comparison?.current && comparison?.previous;
  const filteredMetrics = catalog.filter(
    (m) => group === "Tümü" || m.group === group,
  );
  const exportCsv = () => {
    const rows = [
      [
        "Gösterge",
        "Bu ay ortalama",
        "Geçen ay ortalama",
        "Mutlak fark",
        "Geçerli gözlem bu ay",
        "Geçerli gözlem önceki ay",
      ],
      ...catalog.map((m) => {
        const c = analysis?.comparison?.[m.id];
        return [
          m.id,
          c?.current?.mean ?? "",
          c?.previous?.mean ?? "",
          c?.delta ?? "",
          c?.current?.observations ?? "",
          c?.previous?.observations ?? "",
        ];
      }),
    ];
    download(
      "\uFEFF" + rows.map((r) => r.join(";")).join("\r\n"),
      "agromax-analiz.csv",
      "text/csv;charset=utf-8",
    );
  };
  return (
    <div className="analysis-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={17} />
        {initialAnalysis ? "Analiz geçmişine dön" : "Tarlalara dön"}
      </button>
      <header className="analysis-heading">
        <div>
          <span className="eyebrow">PARSEL ANALİZİ</span>
          <Heading>{field.name}</Heading>
          <p>
            {field.crop || "Ürün belirtilmedi"} ·{" "}
            {areaFormat.format(field.area)} ·{" "}
            {field.location || "Konum belirtilmedi"}
          </p>
        </div>
        <div>
          {onEdit && (
            <button className="secondary" onClick={onEdit}>
              Sınırı düzenle
            </button>
          )}
          {!initialAnalysis && (
            <button
              className="primary"
              onClick={refresh}
              disabled={!connection?.configured || !canAnalyze || busy || !field.geometry}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} />
              {busy
                ? job?.state === "queued"
                  ? "Kuyrukta…"
                  : "Gerçek veriler işleniyor…"
                : "Uydu verilerini güncelle"}
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {initialAnalysis && (
        <div className="data-warning">
          Geçmiş analiz kaydı · {(archiveId || analysis.historyId)?.slice(0, 8)} · Bu ekran,
          analizin kaydedildiği parsel sınırını ve sonuç sürümünü gösterir.
        </div>
      )}
      {busy && job && (
        <div className="data-warning" role="status">
          İşlem kaydı: {job.id.slice(0, 8)} ·{" "}
          {job.state === "queued" ? "Kuyrukta" : "İşleniyor"}. Sayfadan
          ayrılsanız da işlem analiz geçmişinde takip edilir.
        </div>
      )}
      {!field.geometry && (
        <div className="data-warning">
          <Info size={19} /> Bu kayıtta sınır bulunmuyor. Uydu analizi için
          “Sınırı düzenle” ile parselinizi çizin.
        </div>
      )}
      {!initialAnalysis && connection && !connection.configured && (
        <div className="data-warning">
          <Satellite size={20} />
          <div>
            <strong>{connection.unavailable ? "Uydu bağlantı durumu alınamadı." : "Uydu analizi için kaynak ayarı gerekli."}</strong>
            <p>
              Bağlantı hazır olduğunda yeni bir uydu analizi başlatabilirsin.
            </p>
            {onConnections && <button className="text-button" onClick={onConnections}>Veri bağlantılarını aç</button>}
            <button className="text-button" onClick={retryConnection}>Bağlantıyı yeniden kontrol et</button>
          </div>
        </div>
      )}
      {!initialAnalysis && openSource && <div className="data-warning" role="status">
        <Satellite size={20} />
        <div><strong>Analiz kaynağı · Sentinel‑2 L2A / Earth Search</strong>
          <p>{analysis?.provider === openSentinelProvider
            ? "Son doğrulanmış parsel analizi " + date(analysis.fetchedAt) + "."
            : "Açık uydu arşivi seçili. İlk ölçüm için uydu verilerini güncelle."}
          </p></div>
      </div>}
      <div className="analysis-top-grid">
        <SatelliteScene
          field={field} analysis={analysis} archiveId={archiveId} dates={sceneDates} day={imageDate}
          onDay={setSelectedDate} layer={layers.some(({ id }) => id === (mapMetric || metricId)) ? (mapMetric || metricId) : layers[0]?.id} layers={layers}
          onLayer={(id) => id === "RGB" ? setMapMetric(id) : selectMetric(id)}
          compact={false}
        />
        <aside className="panel evidence-card" aria-label="Analiz kaynağı ve yöntem">
          <span className="stat-icon purple">
            <ShieldCheck size={22} />
          </span>
          <span className="eyebrow">KAYNAK DOSYASI</span>
          <h2>Ölçümün dayanağı</h2>
          <dl>
            <dt>Kaynak</dt>
            <dd>{analysis?.source || "Henüz veri alınmadı"}</dd>
            <dt>Son işleme</dt>
            <dd>
              {analysis
                ? new Date(analysis.fetchedAt).toLocaleString("tr-TR", {
                    timeZone: "Europe/Istanbul",
                  })
                : "—"}
            </dd>
            <dt>Bu ay</dt>
            <dd>
              {analysis
                ? `${date(analysis.range.split)} – ${date(analysis.range.to)} (kısmi ay)`
                : "—"}
            </dd>
            <dt>Geçen ay</dt>
            <dd>
              {analysis
                ? `${date(analysis.range.from)} – ${date(new Date(Date.parse(analysis.range.split) - 1))} (tam ay)`
                : "—"}
            </dd>
            <dt>Analiz ızgarası</dt>
            <dd>
              {analysis
                ? "20 m UTM · bantların doğal çözünürlüğü 10/20/60 m"
                : "—"}
            </dd>
            <dt>Yöntem</dt>
            <dd>{analysis?.method || "—"}</dd>
            <dt>Koordinat sistemi</dt>
            <dd>{field.geometry ? "EPSG:4326 · GeoJSON" : "—"}</dd>
            <dt>Parsel kaydı</dt>
            <dd>{date(field.createdAt)}</dd>
          </dl>
          <p>
            Bu göstergeler uydu yansıtımından türetilir. Hastalık, gübre
            eksikliği veya toprak nem yüzdesi teşhisi değildir.
          </p>
          {analysis && <small>{analysis.mask}</small>}
        </aside>
      </div>
      <section className="analysis-trend" aria-labelledby="analysis-trend-title">
        <div>
          <span className="eyebrow">ZAMAN SERİSİ</span>
          <h2 id="analysis-trend-title">{metric.id} · {metric.label}</h2>
          <p>Çekim tarihi harita ve grafikte birlikte seçilir. Kapsama eşiğini geçen ölçümler ayrı noktalar olarak görünür.</p>
        </div>
        <ObservationPlot observations={observations} metric={metric} selectedDate={imageDate} showEmpty />
      </section>
      {field.notes && (
        <section className="panel metric-explanation">
          <h2>Tarla notların</h2>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {field.notes}
          </p>
        </section>
      )}
      <section className="panel comparison-panel">
        <div className="panel-head">
          <div>
            <h2>Geçen aya göre ne değişti?</h2>
            <p>
              İndekslerde değişim indeks puanı, bantlarda kendi birimi ve
              açılarda derece cinsindendir. Yüzde değişim veya otomatik
              “iyi/kötü” sınıflaması değildir.
            </p>
          </div>
          <select
            aria-label="Gösterge grubu"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            {["Tümü", ...new Set(catalog.map((m) => m.group))].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="analysis-table-wrap">
          <table className="analysis-table">
            <thead>
              <tr>
                <th>Gösterge</th>
                <th>Bu ay ort.</th>
                <th>Geçen ay ort.</th>
                <th>Fark</th>
                <th>Gözlem (bu / önceki)</th>
                <th>Doğal çöz.</th>
              </tr>
            </thead>
            <tbody>
              {filteredMetrics.map((m) => {
                const c = analysis?.comparison?.[m.id];
                return (
                  <tr
                    key={m.id}
                    className={metricId === m.id ? "selected" : ""}
                    onClick={() => selectMetric(m.id)}
                  >
                    <td>
                      <button
                        className="metric-link"
                        aria-pressed={metricId === m.id}
                        onClick={(event) => { event.stopPropagation(); selectMetric(m.id); }}
                      >
                        {m.id}
                      </button>
                      <small>
                        {m.label} · {m.unit}
                      </small>
                    </td>
                    <td>{number(c?.current?.mean)}</td>
                    <td>{number(c?.previous?.mean)}</td>
                    <td>
                      <span
                        className={
                          Number.isFinite(c?.delta) ? "delta-value" : ""
                        }
                      >
                        {Number.isFinite(c?.delta)
                          ? `${c.delta > 0 ? "+" : ""}${number(c.delta)}`
                          : availability(m.id)
                            ? "Kaynakta sunulmuyor"
                            : "Veri yetersiz"}
                      </span>
                    </td>
                    <td>
                      {c?.current?.observations ?? "—"} /{" "}
                      {c?.previous?.observations ?? "—"}
                    </td>
                    <td>{m.resolution} m</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-actions">
          <span>
            {catalog.length} tanımlı katman · {status?.metrics ?? "—"} kaynakta
            desteklenen · {indices.length} indeks · İki dönemde de yeterli
            kaliteli gözlem gerekir.
          </span>
          <button
            className="text-button"
            disabled={!analysis}
            onClick={exportCsv}
          >
            <Download size={15} />
            CSV indir
          </button>
          <button
            className="text-button"
            disabled={!analysis}
            onClick={() =>
              download(
                JSON.stringify(analysis, null, 2),
                "agromax-kaynakli-analiz.json",
                "application/json",
              )
            }
          >
            <Download size={15} />
            Kaynak JSON
          </button>
        </div>
      </section>
      <section className="panel metric-detail">
        <div className="panel-head">
          <div>
            <span className="eyebrow">GÖSTERGEYİ TANIYIN</span>
            <h2>
              {metric.id} · {metric.label}
            </h2>
          </div>
          <CalendarDays size={20} />
        </div>
        <div className="metric-explanation">
          <p>{metric.description}</p>
          {availability(metricId) && (
            <p className="data-warning">
              {availability(metricId)}
            </p>
          )}
          <code>{metric.formula.replaceAll("s.", "")}</code>
          <p>
            {canCompare
              ? `Bu ayın kaliteli gözlemlerinden hesaplanan ortalama ${number(comparison.current.mean)}, önceki ay ${number(comparison.previous.mean)}. Mutlak fark ${number(comparison.delta)} (${metric.unit}). Gözlem tarihleri, örtü evresi ve iki dönemin farklı kapsamı birlikte değerlendirilmelidir.`
              : "İki dönemde de en az %70 geçerli piksel kapsamına sahip gözlem bulunmadan karşılaştırma üretilemez. Eksik veri sıfır olarak gösterilmez."}
          </p>
        </div>
        {observations.length > 0 ? (
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Günlük mozaik aralığı</th>
                  <th>Ortalama</th>
                  <th>Min.</th>
                  <th>Maks.</th>
                  <th>Std. sapma</th>
                  <th>P10 / P50 / P90</th>
                  <th>Kapsam</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((o) => {
                  const s = o.stats[metricId];
                  return (
                    <tr key={o.from}>
                      <td>{date(o.from)}</td>
                      <td>{number(s.mean)}</td>
                      <td>{number(s.min)}</td>
                      <td>{number(s.max)}</td>
                      <td>{number(s.stDev)}</td>
                      <td>
                        {number(
                          s.percentiles?.["10.0"] ?? s.percentiles?.["10"],
                        )}{" "}
                        /{" "}
                        {number(
                          s.percentiles?.["50.0"] ?? s.percentiles?.["50"],
                        )}{" "}
                        /{" "}
                        {number(
                          s.percentiles?.["90.0"] ?? s.percentiles?.["90"],
                        )}
                      </td>
                      <td>
                        {(s.coverage * 100).toFixed(1)}%{" "}
                        {s.coverage < 0.7 ? "· Ortalamaya alınmadı" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <Satellite size={28} />
            <h3>
              {analysis
                ? "Bu gösterge için geçerli ölçüm yok"
                : "Henüz doğrulanmış gözlem yok"}
            </h3>
            <p>
              {analysis
                ? availability(metricId) ||
                  "Seçilen aralıkta veri eksik, bulutlu veya hesaplama için yetersiz olabilir. Eksik ölçüm sıfır kabul edilmez."
                : "Gerçek uydu analizi tamamlandığında günlük ölçümler burada yer alacak."}
            </p>
          </div>
        )}
      </section>
      <section className="panel coverage-panel">
        <div className="panel-head">
          <div>
            <h2>Diğer veri kaynakları</h2>
            <p>Optik bantlardan çıkarılamayan bilgiler ayrıca izlenir.</p>
          </div>
        </div>
        <div className="source-needs">
          {unavailable.map(([title, source, text]) => (
            <div key={title}>
              <strong>{title}</strong>
              <span>{source}</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
      {analysis && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Çekim kaydı ve kalite izi</h2>
              <p>
                Bulut yüzdesi sahne düzeyindedir; parselin geçerli piksel
                kapsamından farklıdır.
              </p>
            </div>
          </div>
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Çekim zamanı</th>
                  <th>Sahne ID</th>
                  <th>Bulut (%)</th>
                  <th>Platform</th>
                </tr>
              </thead>
              <tbody>
                {analysis.scenes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.properties?.datetime}</td>
                    <td>{s.id}</td>
                    <td>{s.properties?.["eo:cloud_cover"] ?? "—"}</td>
                    <td>{s.properties?.platform || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analysis.catalogTruncated && (
            <p className="data-warning">
              Katalog ilk 100 kayıtla sınırlı; istatistikler tüm istek dönemini
              işler.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

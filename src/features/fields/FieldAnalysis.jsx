import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Satellite,
  CalendarDays,
  ShieldCheck,
  Info,
  Download,
  Image as ImageIcon,
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
import ParcelMap from "./ParcelMap";
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
}) {
  const areaFormat = useAreaFormat();
  const request = useRef(null);
  const imageRequest = useRef(null);
  const [analysis, setAnalysis] = useState(initialAnalysis),
    [status, setStatus] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [metricId, setMetricId] = useState("NDVI"),
    [image, setImage] = useState(null),
    [imageDate, setImageDate] = useState(""),
    [layer, setLayer] = useState("RGB"),
    [imageBusy, setImageBusy] = useState(false),
    [group, setGroup] = useState("Tümü"),
    [job, setJob] = useState(null);
  useEffect(
    () => () => {
      request.current?.abort();
      imageRequest.current?.abort();
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
  useEffect(
    () => () => {
      if (image?.url) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  async function refresh() {
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
  async function loadImage() {
    setImageBusy(true);
    setError("");
    imageRequest.current?.abort();
    const controller = new AbortController();
    imageRequest.current = controller;
    try {
      const response = await fetch("/api/records/" + field.id + "/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: imageDate,
          layer,
          analysisId: analysis?.historyId,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const e = await response.json();
        throw new Error(e.error);
      }
      const blob = await response.blob();
      controller.signal.throwIfAborted();
      setImage({
        url: URL.createObjectURL(blob),
        bounds: JSON.parse(response.headers.get("X-Image-Bounds")),
        date: imageDate,
        layer,
        legend: JSON.parse(
          decodeURIComponent(response.headers.get("X-Image-Legend") || "null"),
        ),
        validPixels: Number(response.headers.get("X-Valid-Pixels")),
        totalPixels: Number(response.headers.get("X-Total-Pixels")),
        interval: JSON.parse(
          response.headers.get("X-Image-Interval") || "null",
        ),
      });
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setImageBusy(false);
    }
  }
  const sceneDates = [
    ...new Set(
      (analysis?.scenes || [])
        .map((s) => s.properties?.datetime?.slice(0, 10))
        .filter(Boolean),
    ),
  ]
    .sort()
    .reverse();
  const catalog = [...metrics, ...observationAngles];
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
      <div className="analysis-heading">
        <div>
          <span className="eyebrow">PARSELİNİZİN HİKÂYESİ</span>
          <h2>{field.name}</h2>
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
              disabled={busy || !field.geometry}
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
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {initialAnalysis && (
        <div className="data-warning">
          Geçmiş analiz kaydı · {analysis.historyId?.slice(0, 8)} · Bu ekran,
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
      {status && !status.configured && (
        <div className="data-warning">
          <Satellite size={20} />
          <div>
            <strong>Copernicus bağlantısı tamamlanmayı bekliyor.</strong>
            <p>
              Veri kaynağının sunucu yapılandırması eksik. Bağlantı
              tamamlanmadan uydu sonucu üretilemez.
            </p>
          </div>
        </div>
      )}
      <div className="analysis-top-grid">
        <section className="panel field-image">
          <div className="panel-head">
            <div>
              <h2>Tarlanın görünümü</h2>
              <p>
                {image
                  ? `${image.date} · ${image.layer} · Sentinel-2 L2A`
                  : "Parsel sınırı ve gerçek harita altlığı"}
              </p>
            </div>
            <ImageIcon size={19} />
          </div>
          {field.geometry ? (
            <ParcelMap
              key={field.id}
              geometry={field.geometry}
              image={image}
              height={350}
            />
          ) : (
            <div className="empty">Parsel sınırı bekleniyor.</div>
          )}
          <div className="image-controls">
            <select
              aria-label="Görüntü tarihi"
              value={imageDate}
              onChange={(e) => setImageDate(e.target.value)}
            >
              <option value="">Çekim tarihi seçin</option>
              {sceneDates.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select
              aria-label="Uydu görüntü katmanı"
              value={layer}
              onChange={(e) => setLayer(e.target.value)}
            >
              <option value="RGB">Doğal renk (RGB)</option>
              {catalog
                .filter(
                  (m) => !metricAvailability(m.id, status?.provider || "cdse"),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
            </select>
            <button
              className="secondary"
              disabled={!imageDate || imageBusy}
              onClick={loadImage}
            >
              {imageBusy ? "Yükleniyor…" : "Görüntüyü getir"}
            </button>
          </div>
          {image?.legend && (
            <p className="image-legend">
              <span
                style={{ background: "linear-gradient(90deg,#30668c,#b9df55)" }}
              />{" "}
              {number(image.legend.min)} → {number(image.legend.max)} ·{" "}
              {image.legend.unit}. {image.legend.method} Görüntü SCL 4/5/6 ve
              CLD&lt;40 maskesiyle gösterilir.
            </p>
          )}
        </section>
        <section className="panel evidence-card">
          <span className="stat-icon purple">
            <ShieldCheck size={22} />
          </span>
          <h2>Her değerin arkasında bir kaynak.</h2>
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
        </section>
      </div>
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
                    onClick={() => setMetricId(m.id)}
                  >
                    <td>
                      <button
                        className="metric-link"
                        onClick={() => setMetricId(m.id)}
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
                          : metricAvailability(m.id, status?.provider || "cdse")
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
          {metricAvailability(metricId, status?.provider || "cdse") && (
            <p className="data-warning">
              {metricAvailability(metricId, status?.provider || "cdse")}
            </p>
          )}
          <code>{metric.formula.replaceAll("s.", "")}</code>
          <p>
            {canCompare
              ? `Bu ayın kaliteli gözlemlerinden hesaplanan ortalama ${number(comparison.current.mean)}, önceki ay ${number(comparison.previous.mean)}. Mutlak fark ${number(comparison.delta)} (${metric.unit}). Gözlem tarihleri, örtü evresi ve iki dönemin farklı kapsamı birlikte değerlendirilmelidir.`
              : "İki dönemde de en az %70 geçerli piksel kapsamına sahip gözlem bulunmadan karşılaştırma üretilemez. Eksik veri sıfır olarak gösterilmez."}
          </p>
        </div>
        <ObservationPlot observations={observations} metric={metric} />
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
                ? metricAvailability(metricId, status?.provider || "cdse") ||
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

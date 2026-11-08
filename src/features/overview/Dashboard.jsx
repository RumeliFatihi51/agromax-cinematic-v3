import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight, Box, CalendarDays, ClipboardCheck, CloudSun, FileText,
  Layers3, Map, Plus, SlidersHorizontal, Sprout, TriangleAlert, Wind,
} from "lucide-react";
import { api, fetchAnalysisImage } from "../../api";
import { useAreaFormat } from "../../components/PreferenceProvider";
import ParcelMap from "../fields/ParcelMap";
import FieldEditor from "../fields/FieldEditor";
import ParcelBrief from "./ParcelBrief";
import FilizPanel from "./FilizPanel";
import { TextReveal, useDashboardEntrance } from "../../motion/entrance";
import "./dashboard.css";

const indices = ["NDVI", "NDRE", "NDMI", "NDWI"];
const modules = [
  ["twin", Box, "Dijital İkiz", "Parselinizin dinamik modeli"],
  ["scenarios", SlidersHorizontal, "Senaryo Laboratuvarı", "Sulama, gübre ve maliyet senaryolarını karşılaştırın"],
  ["prescriptions", Map, "Reçete Haritası", "Uygulama planınızı ve inceleme taslaklarını oluşturun"],
  ["mrv", FileText, "Raporlar ve MRV", "Analiz, müdahale ve doğrulama kayıtları"],
];
const fmt = (value) => Number.isFinite(value) ? value.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "—";

export default function Dashboard({
  user, fields, tasks, notifications, workspace, onCreate, onSelect, onNavigate, onTask, onToggle,
  createRequest = 0, onCreateHandled, onSaved,
}) {
  const area = useAreaFormat();
  const host = useRef(null);
  useDashboardEntrance(host);
  const [editing, setEditing] = useState(false);
  const [geometry, setGeometry] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [jobs, setJobs] = useState(null);
  const selected = fields.find((field) => field.id === selectedId)
    || fields.find((field) => field.geometry) || fields[0];
  useEffect(() => {
    if (!createRequest) return;
    setEditing(true);
    setGeometry(null);
    setDrawing(false);
    setNotice("");
    onCreateHandled?.();
  }, [createRequest, onCreateHandled]);
  useEffect(() => {
    const controller = new AbortController();
    api("analyses", undefined, "GET", { signal: controller.signal })
      .then(({ jobs }) => { if (!controller.signal.aborted) setJobs(jobs); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const recent = jobs?.filter(({ state, finishedAt }) =>
    state === "completed" && Date.parse(finishedAt) >= Date.now() - 7 * 86400000);
  const attention = notifications?.filter(({ type, readAt }) =>
    !readAt && /^(analysis\.failed|risk\.|investigation\.)/.test(type));
  const pending = tasks.filter((task) => !task.done);
  const stats = [
    [Layers3, fields.length, "Parsel", "Toplam " + area.format(fields.reduce((sum, field) => sum + (field.area || 0), 0)), "fields"],
    [ClipboardCheck, recent?.length, "Güncel analiz", "Son 7 günde tamamlanan", "history"],
    [TriangleAlert, attention?.length, "Dikkat gerektiren olay", "Okunmamış uyarılar", "notifications"],
    [CalendarDays, pending.length, "Bekleyen görev", pending[0]?.name || "Saha planı ve kontroller", "tasks"],
  ];
  const finish = (record) => {
    if (record) {
      onSaved(record);
      setSelectedId(record.id);
      setNotice(record.name + " kaydedildi.");
    }
    setEditing(false);
  };

  return (
    <div className="dashboard-v3" ref={host}>
      <header className="dashboard-hero">
        <div className="dashboard-hero-media" aria-hidden="true">
          <img src="/visuals/agromax-landscape-editorial-v1.webp" alt="" fetchPriority="high" />
        </div>
        <div className="dashboard-greeting">
          <p data-enter>Merhaba, {user.name.split(" ")[0]}</p>
          <TextReveal lines={["Arazilerinizdeki", "güncel durum"]} />
          <p data-enter>Uydu gözlemleri, model analizleri ve saha verilerine göre öncelikli gelişmeler burada.</p>
        </div>
        <WeatherStrip key={selected?.id} field={selected} onOpen={() => onNavigate("weather")} />
      </header>
      {notice && <p className="dashboard-notice" role="status">{notice}</p>}
      {editing ? (
        <section className="dashboard-editor fw-overview-section" aria-label="Yeni parsel">
          <ParcelMap fields={fields} height={700} editable editSession={createRequest}
            onChange={setGeometry} onDrawing={setDrawing}>
            <FieldEditor field={null} geometry={geometry} drawing={drawing}
              onCancel={() => finish()} onSaved={finish} />
          </ParcelMap>
        </section>
      ) : (
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <section className="dashboard-stats" aria-label="İşletme özeti">
              {stats.map(([Icon, value, label, detail, page]) => (
                <button className="dashboard-kpi" data-enter key={page} onClick={() => onNavigate(page)}>
                  <span className="dashboard-kpi-icon"><Icon size={23} aria-hidden="true" /></span>
                  <span><strong>{value ?? "—"}</strong><span>{label}</span><small>{detail}</small></span>
                </button>
              ))}
            </section>
            <div className="dashboard-observation" data-enter>
              <ObservationWorkspace field={selected} fields={fields}
                onSelect={(field) => setSelectedId(field.id)}
                onOpen={onSelect} onNavigate={onNavigate} onCreate={onCreate} />
            </div>
            <nav className="dashboard-modules" aria-label="Araştırma ve operasyon araçları" data-enter>
              {modules.map(([id, Icon, title, summary]) => (
                <button className="dashboard-module" data-module={id} key={id} onClick={() => onNavigate(id, selected?.id)}>
                  <Icon size={25} aria-hidden="true" /><strong>{title}</strong><span>{summary}</span>
                  <ArrowUpRight className="module-arrow" size={16} aria-hidden="true" />
                </button>
              ))}
            </nav>
            <div className="dashboard-actions">
              <button className="secondary" onClick={onCreate}><Plus size={16} /> Parsel çiz</button>
              <button className="secondary" onClick={onTask}><Plus size={16} /> Görev ekle</button>
            </div>
            {pending.length > 0 && <details className="dashboard-agenda">
              <summary>Sıradaki işler · {pending.length}</summary>
              <ul>{pending.slice(0, 4).map((task) => <li key={task.id}><label>
                <input type="checkbox" checked={!!task.done} onChange={() => onToggle(task)} />
                <span>{task.name} <small>{task.date}</small></span>
              </label></li>)}</ul>
            </details>}
          </div>
          <FilizPanel key={selected?.id} field={selected} workspace={workspace}
            onOpenField={() => onSelect(selected)} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

function WeatherStrip({ field, onOpen }) {
  const [state, setState] = useState({ data: null, error: false });
  useEffect(() => {
    if (!field?.geometry) return;
    const controller = new AbortController();
    api("weather?fieldId=" + encodeURIComponent(field.id), undefined, "GET", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ data, error: false }); })
      .catch(() => { if (!controller.signal.aborted) setState({ data: null, error: true }); });
    return () => controller.abort();
  }, [field?.id, Boolean(field?.geometry)]);
  const point = state.data?.points?.find(({ time }) => Date.parse(time) >= Date.now());
  const rain = point?.periods?.find(({ hours }) => hours === 1);
  return (
    <button className="dashboard-weather" onClick={onOpen} data-enter>
      <CloudSun size={31} aria-hidden="true" />
      {point ? <>
        <span><strong>{fmt(point.values.air_temperature)} °C</strong><small>{field.name} · Tahmin</small></span>
        <span><strong>{fmt(rain?.values.precipitation_amount)} mm</strong><small>1 saatlik yağış</small></span>
        <span><strong><Wind size={19} /> {fmt(point.values.wind_speed)} m/s</strong><small>MET Norway</small></span>
      </> : <span><strong>Hava durumu</strong><small>{!field?.geometry ? "Sınırı olan bir parsel gerekli" :
        state.error ? "Tahmin alınamadı" : state.data ? "Güncel tahmin yok" : "Tahmin alınıyor…"}</small></span>}
    </button>
  );
}

function ObservationWorkspace({ field, fields, onSelect, onOpen, onNavigate, onCreate }) {
  const [metric, setMetric] = useState("NDVI");
  const [record, setRecord] = useState(null);
  const [imageError, setImageError] = useState("");
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState(null);
  const fieldId = field?.id;
  const current = record?.fieldId === fieldId ? record : null;
  const analysis = current?.analysis;
  const loaded = !fieldId || !!current;
  const dates = [...new Set((analysis?.scenes || [])
    .map((scene) => scene.properties?.datetime?.slice(0, 10)).filter(Boolean))].sort().reverse();
  const date = (selection?.fieldId === fieldId && dates.includes(selection?.date) ? selection.date : dates[0]);
  const visibleImage = image?.fieldId === fieldId ? image : null;
  const legend = visibleImage?.legend;

  useEffect(() => {
    if (!fieldId) return;
    const controller = new AbortController();
    api("records/" + fieldId + "/analysis", undefined, "GET", { signal: controller.signal })
      .then(({ analysis }) => { if (!controller.signal.aborted) setRecord({ fieldId, analysis }); })
      .catch((e) => { if (!controller.signal.aborted) setRecord({ fieldId, error: e.message }); });
    return () => controller.abort();
  }, [fieldId]);

  useEffect(() => {
    if (!date || !field?.geometry) {
      setImage(null);
      setBusy(false);
      setImageError("");
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setImageError("");
    fetchAnalysisImage(field.id, { date, layer: metric, analysisId: analysis?.historyId, signal: controller.signal })
      .then((image) => {
        if (controller.signal.aborted) URL.revokeObjectURL(image.url);
        else setImage({ ...image, fieldId });
      })
      .catch((e) => { if (!controller.signal.aborted) setImageError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [field?.id, Boolean(field?.geometry), date, metric, analysis?.historyId]);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  return <>
    <section className="dashboard-map fw-overview-section" aria-label="Parsel uydu haritası">
      <ParcelMap fields={fields} height="var(--dashboard-map-height)" activeFieldId={field?.id} onSelect={onSelect}
        image={visibleImage} compact animateImagery />
      <div className="dashboard-map-tools">
        <div className="dashboard-indices" role="group" aria-label="Uydu indeksi">
          {indices.map((id) => <button key={id} aria-pressed={metric === id}
            onClick={() => setMetric(id)}>{id}</button>)}
          <button aria-label="Diğer göstergeler" disabled={!field} onClick={() => onOpen(field)}>···</button>
        </div>
        {fields.length > 1 && <select aria-label="Haritada parsel seç" value={field.id}
          onChange={(event) => onSelect(fields.find(({ id }) => id === event.target.value))}>
          {fields.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>}
      </div>
      {!field && <button className="dashboard-map-empty secondary" onClick={onCreate}><Plus size={16} /> İlk parselinizi çizin</button>}
      <div className="dashboard-layer-info" aria-live="polite">
        <strong>{visibleImage ? visibleImage.layer + " · " + visibleImage.date : "Uydu altlığı"}</strong>
        {legend?.min != null && legend?.max != null && <>
          <div className="dashboard-legend-ramp" aria-hidden="true"
            style={{ backgroundImage: "linear-gradient(90deg," + (legend.colors || ["#30668c", "#b9df55"]).join(",") + ")" }} />
          <span>{Number(legend.min).toFixed(2)} – {Number(legend.max).toFixed(2)} {legend.unit}</span>
        </>}
        {busy && <span>{metric} katmanı alınıyor…</span>}
        {imageError && <span>{imageError}</span>}
        {!busy && !imageError && field && !date && <span>{loaded ? "Kayıtlı uydu katmanı yok" : "Analiz yükleniyor…"}</span>}
      </div>
    </section>
    <ParcelBrief key={fieldId} field={field} analysis={analysis} loaded={loaded} error={current?.error}
      metric={metric} dates={dates} date={date} onDate={(date) => setSelection({ fieldId, date })}
      onOpen={onOpen} onNavigate={onNavigate} />
  </>;
}

import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Box, Compass, Crosshair, Layers3, Map as MapIcon, Maximize, Minus, Plus } from "lucide-react";
import { api, fetchAnalysisImage } from "../../api";
import { useAreaFormat } from "../../components/PreferenceProvider";
import { availableMetrics } from "../../../shared/metrics";
import { openSentinelMetrics, openSentinelProvider } from "../../../shared/open-sentinel";
import { changeOutliers, compareRasters, containsPoint, metricFrame, pixelIndex } from "../../../shared/spatial";
import ParcelMap from "../fields/ParcelMap";
import { colorScale, rgb } from "./colors";
import { loadTerrain, slopeAspect } from "./terrain";
import { useContextImagery } from "./imagery";
import { cropModel } from "./crops";
import "./spatial.css";

export const ParcelScene = lazy(() => import("./ParcelScene"));
const GeospatialMap = lazy(() => import("./GeospatialMap"));
const FieldStudy = lazy(() => import("./FieldStudy"));
const RegionalInsights = lazy(() => import("./RegionalInsights"));
const PixelArea = lazy(() => import("./RegionalInsights").then(module => ({ default: module.PixelArea })));
const noMarkers = [];
const comparisons = ["blend", "difference", "outliers"];
const number = (value, precision = 3) => Number.isFinite(value)
  ? value.toLocaleString("tr-TR", { maximumFractionDigits: precision }) : "—";
const dateLabel = (value) => new Date(value).toLocaleDateString("tr-TR", {
  timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
});

export class SpatialBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const change = () => setMatches(media.matches);
    media.addEventListener("change", change);
    change();
    return () => media.removeEventListener("change", change);
  }, [query]);
  return matches;
}

function openArchivePath(fieldId, geometryHash, path, params) {
  const query = new URLSearchParams({ geometry: geometryHash, ...params });
  return "platform/fields/" + fieldId + "/spatial/earth-search" + path + "?" + query;
}

function useOpenCatalog(fieldId, geometryHash, month) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!month) return;
    const controller = new AbortController();
    api(openArchivePath(fieldId, geometryHash, "", { month }), undefined, "GET", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ month, ...data }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ month, error: error.message }); });
    return () => controller.abort();
  }, [fieldId, geometryHash, month]);
  return month && result?.month === month ? result : null;
}

function useRaster(fieldId, geometryHash, observation, layer, enabled) {
  const date = observation?.date, id = observation?.id;
  const isOpen = observation?.provider === openSentinelProvider && Array.isArray(observation.available);
  const key = enabled && date && id ? [fieldId, geometryHash, id, date, layer].join("/") : "";
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map());
  useEffect(() => {
    if (!key) return;
    const hit = cache.current.get(key);
    if (hit) {
      setResult({ key, retry, data: hit });
      return;
    }
    const controller = new AbortController();
    const request = isOpen
      ? api(openArchivePath(fieldId, geometryHash, "/raster", { scene: id, layer }), undefined, "GET", { signal: controller.signal })
      : api("records/" + encodeURIComponent(fieldId) + "/image",
        { format: "values", date, layer, analysisId: id }, "POST", { signal: controller.signal });
    request
      .then(data => {
        if (controller.signal.aborted) return;
        if (cache.current.size >= 6) cache.current.delete(cache.current.keys().next().value);
        cache.current.set(key, data);
        setResult({ key, retry, data });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ key, retry, error: error.message });
      });
    return () => controller.abort();
  }, [key, fieldId, geometryHash, id, date, layer, isOpen, retry]);
  const fresh = result?.key === key && result?.retry === retry;
  return { ...(fresh ? result : {}), loading: !!key && !fresh, retry: () => {
    cache.current.delete(key);
    setRetry(n => n + 1);
  } };
}

function Timeline({ observations, layer, active, onSelect }) {
  const series = observations.filter(item => Number.isFinite(item.metrics[layer])).toReversed();
  if (!series.length) return null;
  const values = series.map(item => item.metrics[layer]);
  const times = series.map(item => Date.parse(item.date));
  const min = Math.min(...values), max = Math.max(...values);
  const points = series.map((item, index) => [
    12 + (series.length === 1 ? 100 : (times[index] - times[0]) / (times.at(-1) - times[0]) * 200),
    48 - (min === max ? 17 : (item.metrics[layer] - min) / (max - min) * 36),
  ]);
  return <section className="spatial-timeline" aria-label="Gözlem zaman çizelgesi">
    <div>
      <small className="spatial-eyebrow">GÖZLEM ARŞİVİ</small>
      <h3>{layer} · Parsel ortalaması</h3>
      <p>{series.length} kayıtlı tarih · Aralık {number(min)} – {number(max)}</p>
    </div>
    <svg viewBox="0 0 224 58" role="img" aria-label={layer + " ortalamalarının zaman serisi"}>
      <path d="M12 12H212 M12 30H212 M12 48H212" className="spatial-chart-grid" />
      <polyline points={points.map(point => point.join(",")).join(" ")} className="spatial-chart-line" />
      {points.map(([x, y], i) => <circle key={series[i].date} cx={x} cy={y}
        r={series[i].date === active ? 5 : 2.5} />)}
    </svg>
    <div className="spatial-date-strip">
      {series.map(item => <button type="button" key={item.date} aria-pressed={active === item.date}
        onClick={() => onSelect(item.date)} title={layer + " " + number(item.metrics[layer])}>
        {dateLabel(item.date)}
      </button>)}
    </div>
  </section>;
}

function OpenTimeline({ observations, active, onSelect }) {
  if (!observations.length) return null;
  return <section className="spatial-timeline" aria-label="Açık arşiv çekim tarihleri">
    <div>
      <small className="spatial-eyebrow">SENTINEL-2 L2A / AÇIK ARŞİV</small>
      <h3>Çekim tarihleri</h3>
      <p>{observations.length} sahne · Bulut oranı sahnenin tamamı içindir.</p>
    </div>
    <div className="spatial-date-strip">
      {observations.toReversed().map(item => <button type="button" key={item.id}
        aria-pressed={item.date === active} onClick={() => onSelect(item.date)}>
        {dateLabel(item.date)}{Number.isFinite(item.cloud) ? " · %" + number(item.cloud, 0) + " bulut" : ""}
      </button>)}
    </div>
  </section>;
}

function hasMetric(observation, layer) {
  return observation?.available?.includes(layer) || Number.isFinite(observation?.metrics?.[layer]);
}

export default function SpatialWorkbench(props) {
  const [study, setStudy] = useState(false);
  const compact = useMedia("(max-width: 700px)");
  const poster = <img className="spatial-study-poster" src="/visuals/spatial-field-study.webp" alt="Temsili buğday tarlası" />;
  if (study && props.variant === "twin") return <SpatialBoundary fallback={
    <section className="spatial-workbench">{poster}<button className="secondary" onClick={() => setStudy(false)}>Parsel modeline dön</button></section>
  }><Suspense fallback={poster}><FieldStudy compact={compact} onBack={() => setStudy(false)} /></Suspense></SpatialBoundary>;
  return <ParcelWorkbench {...props} onStudy={props.variant === "twin" ? () => setStudy(true) : null} />;
}

function ParcelWorkbench({ field, context, variant, selection = {}, onSelection, onStudy,
  onNavigate, onField, zones = noMarkers, activeZone, onZone, markerText, highlight = false,
  waterBalance, observationsOnField = noMarkers, zonePlan }) {
  const area = useAreaFormat();
  const isMap = variant === "satellite" || variant === "intelligence";
  const observed = variant === "twin" || isMap;
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const compact = useMedia("(max-width: 700px)");
  const [view, setView] = useState("3d");
  const [command, setCommand] = useState(null);
  const [boundary, setBoundary] = useState(true);
  const [topography, setTopography] = useState(true);
  const [basemap, setBasemap] = useState(true);
  const [trueColor, setTrueColor] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [showObservations, setShowObservations] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [layerEnabled, setLayerEnabled] = useState(isMap || selection.source === openSentinelProvider);
  const [mode, setMode] = useState("surface");
  const [opacity, setOpacity] = useState(0.83);
  const [blend, setBlend] = useState(0.5);
  const [range, setRange] = useState(null);
  const [rangeError, setRangeError] = useState("");
  const [showDistribution, setShowDistribution] = useState(false);
  const [reviewRegion, setReviewRegion] = useState(null);
  const [exaggeration, setExaggeration] = useState(1);
  const [previousDate, setPreviousDate] = useState("");
  const [comparisonMonth, setComparisonMonth] = useState("");
  const [point, setPoint] = useState(null);
  const northArrow = useRef(null);
  const [catalog, setCatalog] = useState(null);
  const [dem, setDem] = useState(null);
  const [imagery, setImagery] = useState(null);
  const stage = useRef(null);
  const [full, setFull] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const contextImagery = useContextImagery(frame, !isMap && view === "3d" && basemap, compact);
  const cropAsset = variant === "twin" ? cropModel(field.crop) : null;
  const isOpen = selection.source === openSentinelProvider;
  const openMonth = selection.month || new Date().toISOString().slice(0, 7);
  const openCatalog = useOpenCatalog(field.id, context.geometryHash, observed && isOpen ? openMonth : "");
  const earlierCatalog = useOpenCatalog(field.id, context.geometryHash,
    observed && isOpen && comparisons.includes(mode) && comparisonMonth !== openMonth ? comparisonMonth : "");
  const twinZones = useMemo(() => showZones && zonePlan
    ? zonePlan.payload.zones.map((zone, index) => ({ ...zone, id: zonePlan.id + ":" + index }))
    : noMarkers, [showZones, zonePlan]);
  const markers = useMemo(() => showObservations ? observationsOnField
    .filter(record => record.status !== "archived").slice(0, compact ? 30 : 80)
    .map(record => ({ id: record.id, coordinate: record.payload.coordinate, name: record.name,
      date: record.payload.observedAt, notes: record.payload.notes })) : noMarkers,
    [observationsOnField, showObservations, compact]);

  useEffect(() => {
    if (!observed) return;
    const controller = new AbortController();
    api("platform/fields/" + field.id + "/spatial", undefined, "GET", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setCatalog(data); })
      .catch(error => { if (!controller.signal.aborted) setCatalog({ error: error.message }); });
    return () => controller.abort();
  }, [field.id, observed]);

  useEffect(() => {
    if (isMap || !topography || view !== "3d") return;
    const controller = new AbortController();
    const timeout = AbortSignal.timeout(12000);
    loadTerrain(frame, AbortSignal.any([controller.signal, timeout]))
      .then(data => { if (!controller.signal.aborted) setDem(data); })
      .catch(() => { if (!controller.signal.aborted) setDem({ error: true }); });
    return () => controller.abort();
  }, [frame, isMap, topography, view]);

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function fullscreen() {
    setFullscreenError("");
    try {
      if (full) await document.exitFullscreen();
      else await stage.current.requestFullscreen();
    } catch { setFullscreenError("Bu tarayıcı tam ekran görünümünü açamadı."); }
  }

  const currentCatalog = isOpen ? openCatalog : catalog;
  const observations = currentCatalog?.observations || [];
  const activeDate = isOpen ? selection.archiveDate : selection.date;
  const observation = observations.find(item => item.date === activeDate) || observations[0];
  const metrics = (observation?.provider === openSentinelProvider ? openSentinelMetrics : availableMetrics(observation?.provider))
    .filter(item => hasMetric(observation, item.id));
  const layer = metrics.some(item => item.id === selection.layer) ? selection.layer : metrics[0]?.id;
  const alternatives = (isOpen && comparisonMonth && comparisonMonth !== openMonth
    ? earlierCatalog?.observations || [] : observations)
    .filter(item => item.date !== observation?.date && item.provider === observation?.provider &&
      item.method === observation?.method && hasMetric(item, layer));
  const previous = alternatives.find(item => item.date === previousDate);
  const renderMode = view === "2d" && mode === "columns" ? "surface" : mode;
  const primary = useRaster(field.id, context.geometryHash, observation, layer, layerEnabled && !!layer &&
    (view === "3d" || isMap && view === "2d" && !mapUnavailable));
  const compare = useRaster(field.id, context.geometryHash, previous, layer, isMap && layerEnabled && !!layer &&
    !mapUnavailable && view !== "fallback" && comparisons.includes(renderMode));
  const delta = useMemo(() => primary.data && compare.data ? compareRasters(primary.data, compare.data) : null,
    [primary.data, compare.data]);
  const outliers = useMemo(() => renderMode === "outliers" && delta ? changeOutliers(delta) : null, [renderMode, delta]);
  const raster = renderMode === "difference" ? delta : renderMode === "outliers" ? outliers : primary.data;
  const reference = renderMode === "blend" && delta ? compare.data : null;
  const baseline = useMemo(() => raster ? colorScale(raster, reference, ["difference", "outliers"].includes(renderMode)) : null,
    [raster, reference, renderMode]);
  const scale = useMemo(() => baseline && range?.layer === layer && range?.mode === renderMode
    ? { ...baseline, min: range.min, max: range.max } : baseline, [baseline, layer, range, renderMode]);
  const rgbKey = trueColor && observation && !isOpen &&
    (view === "3d" || isMap && view === "2d" && !mapUnavailable)
    ? observation.id + observation.date : "";
  useEffect(() => {
    if (!rgbKey) return;
    const controller = new AbortController();
    let bitmap, url;
    fetchAnalysisImage(field.id, { date: observation.date, analysisId: observation.id, layer: "RGB", signal: controller.signal })
      .then(async data => {
        url = data.url;
        try {
          bitmap = await createImageBitmap(await (await fetch(url, { signal: controller.signal })).blob());
          if (controller.signal.aborted) bitmap.close();
          else setImagery({ bitmap, bounds: data.bounds, key: rgbKey });
        } finally { URL.revokeObjectURL(url); }
      }).catch(error => { if (!controller.signal.aborted) setImagery({ error: error.message, key: rgbKey }); });
    return () => {
      controller.abort();
      bitmap?.close();
      if (url) URL.revokeObjectURL(url);
    };
  }, [field.id, observation, rgbKey]);

  function chooseDate(value) {
    setPoint(null);
    onSelection?.({ ...selection, [isOpen ? "archiveDate" : "date"]: value });
  }

  function selectPoint(value) {
    setPoint({ ...value, zone: twinZones.find(zone => containsPoint(zone.geometry, value.coordinate)) });
    if (!onZone) return;
    const zone = zones.find(item => item.contains(value.coordinate));
    onZone(zone?.id || "");
  }

  const mapFallback = <div className="spatial-fallback">
    <ParcelMap geometry={field.geometry} height="100%" compact />
  </div>;
  const fallback = <div className="spatial-fallback">
    <p role="status">3D açılamadı. Kayıtlı sınır 2D haritada gösteriliyor.</p>
    <ParcelMap geometry={field.geometry} height="100%" compact />
  </div>;
  const terrain = topography && Number.isFinite(dem?.reference) ? dem : null;
  const height = terrain && point?.x !== undefined ? terrain.sample(point.x, point.z) : null;
  const relief = terrain && point?.x !== undefined ? slopeAspect(terrain, point.x, point.z) : null;
  const sampledIndex = point && raster ? pixelIndex(raster, point.coordinate) : -1;
  const sampledValue = point && raster ? (renderMode === "columns" ? point.value :
    raster.values[sampledIndex]) : null;
  const previousValue = point && reference ? reference.values[pixelIndex(reference, point.coordinate)] : null;
  const datedImagery = imagery?.key === rgbKey && imagery.bitmap ? imagery : null;
  const title = isMap ? variant === "intelligence" ? "Sahada gözlemi konumlandır" : "Yörüngeden parsele"
    : variant === "prescriptions" ? "Uygulama bölgeleri" : "Parselin üç boyutlu atlası";
  return <section className="spatial-workbench" data-spatial={variant} aria-label={variant === "twin" ? "Parsel modeli ve kaynakları" : title}>
    <header className="spatial-workbench-header">
      <div><small className="spatial-eyebrow">{isMap ? "YÖRÜNGE ARŞİVİ / COĞRAFİ İNCELEME" : "ARAZİ ATLASI / PARSEL MODELİ"}</small>
        <h2>{title}</h2>
        <p>{field.name} <span>·</span> {area.format(field.area)} <span>·</span> {field.crop || "Ürün belirtilmedi"}</p>
        {variant === "twin" && <p>{[field.location, waterBalance && "FAO-56 su dengesi pilotu"].filter(Boolean).join(" · ")}</p>}
      </div>
      <div className="spatial-header-actions">
      {onStudy && <button className="secondary spatial-study-link" type="button" onClick={onStudy}>Temsili tarla etüdü</button>}
      <div className="spatial-view-toggle" role="group" aria-label="Harita görünümü">
        <button type="button" aria-pressed={view === "2d"} onClick={() => {
          setView("2d"); setCommand({ type: "top" }); setPoint(null);
        }}><MapIcon size={16} /> 2D</button>
        <button type="button" aria-pressed={view === "3d"} onClick={() => {
          setMapUnavailable(false); setView("3d"); setCommand({ type: "tilt" }); setPoint(null);
        }}><Box size={16} /> 3D</button>
      </div>
      </div>
    </header>
    {observed && <div className="spatial-control-deck">
      <label>Veri kaynağı<select aria-describedby="spatial-archive-hint" value={isOpen ? openSentinelProvider : "recorded"}
        onChange={event => {
          setPoint(null); setPreviousDate(""); setComparisonMonth("");
          if (event.target.value === openSentinelProvider) setLayerEnabled(true);
          onSelection?.({ ...selection, source: event.target.value });
        }}>
        <option value="recorded">Kayıtlı analizler</option>
        <option value={openSentinelProvider}>Açık Sentinel-2 arşivi</option>
      </select></label>
      {isOpen && <label>Arşiv ayı<input type="month" value={openMonth} onChange={event => {
        if (!/^20\d{2}-\d{2}$/.test(event.target.value)) return;
        setPreviousDate(""); setPoint(null);
        onSelection?.({ ...selection, month: event.target.value, archiveDate: "" });
      }} /></label>}
      <label>Gözlem tarihi<select value={observation?.date || ""} onChange={e => chooseDate(e.target.value)} disabled={!observations.length}>
        {!observations.length && <option value="">{currentCatalog ? "Kayıt yok" : "Arşiv yükleniyor…"}</option>}
        {observations.map(item => <option key={item.date} value={item.date}>{dateLabel(item.date)}</option>)}
      </select></label>
      <label>Analiz katmanı<select value={layer || ""} disabled={!metrics.length} onChange={e => {
        setPoint(null); onSelection?.({ ...selection, layer: e.target.value });
      }}>
        {!metrics.length && <option value="">Veri yok</option>}
        {metrics.map(item => <option key={item.id} value={item.id}>{item.id} · {item.label}</option>)}
      </select></label>
      {isMap && <label>Gösterim<select value={mode} onChange={e => { setMode(e.target.value); setPoint(null); }}>
        <option value="surface">Arazi üstü · Renk yüzeyi</option><option value="columns">Analitik sütunlar</option>
        <option value="blend">Önce / sonra · Saydamlık</option><option value="difference">Önce / sonra · Fark</option>
        <option value="outliers">Farktan inceleme hücreleri</option>
      </select></label>}
      {isMap && isOpen && comparisons.includes(mode) && <label>Karşılaştırma ayı
        <input type="month" value={comparisonMonth || openMonth} onChange={event => {
          setComparisonMonth(event.target.value); setPreviousDate(""); setPoint(null);
        }} />
      </label>}
      {isMap && comparisons.includes(mode) && <label>Karşılaştırma tarihi
        <select value={previous?.date || ""} onChange={e => { setPreviousDate(e.target.value); setPoint(null); }}>
          <option value="">Bir tarih seçin</option>
          {alternatives.map(item => <option key={item.date} value={item.date}>{dateLabel(item.date)}</option>)}
        </select>
      </label>}
    </div>}
    {observed && <p className="spatial-status" id="spatial-archive-hint">
      Açık arşiv, yuvarlanmış arama alanını Earth Search’e gönderir. İncelemeler analiz geçmişine eklenmez.
    </p>}
    <div className="spatial-stage" ref={stage}>
      {view === "2d" && (!isMap || mapUnavailable) ? mapFallback : view === "fallback" ? fallback : <SpatialBoundary fallback={fallback}>
        <Suspense fallback={<div className="spatial-loading" role="status">Görünüm hazırlanıyor…</div>}>
          {isMap ? <GeospatialMap {...{ field, frame, command, boundary, raster, comparison: reference, scale,
            opacity, blend, mode: renderMode, terrain: topography && view === "3d", flat: view === "2d",
            exaggeration, basemap, reduced, highlight, markers, onPoint: selectPoint,
            imagery: datedImagery, selection: point?.coordinate,
            reviewGeometry: reviewRegion && reviewRegion.raster === raster ? reviewRegion.geometry : null }}
            onError={() => { setMapUnavailable(true); setView("fallback"); }} /> :
            <ParcelScene {...{ field, frame, terrain, exaggeration, raster, scale, opacity, boundary, command,
              imagery: datedImagery, selection: point?.coordinate,
              zones: variant === "twin" ? twinZones : zones, activeZone: point?.zone?.id || activeZone,
              contextImagery: contextImagery?.canvas, cropAsset: showCrop ? cropAsset : null, markers,
              onCamera: position => {
                if (northArrow.current) northArrow.current.style.transform =
                  "rotate(" + Math.atan2(position[0], position[2]) * 180 / Math.PI + "deg)";
              },
              onContextLoss: () => setView("fallback"),
              onPoint: selectPoint, reduced, compact, fallback }} />}
        </Suspense>
      </SpatialBoundary>}
      {view !== "2d" && view !== "fallback" && <div className="spatial-camera" role="group" aria-label="Kamera kontrolleri">
        {[[Compass, "north", "Kuzeye dön"], [Crosshair, "fit", "Parsele sığdır"], [Plus, "in", "Yakınlaştır"],
          [Minus, "out", "Uzaklaştır"]].map(([Icon, type, label]) =>
          <button type="button" key={type} title={label} aria-label={label} onClick={() => setCommand({ type })}><Icon size={17} /></button>)}
        <button type="button" title="Tam ekran" aria-label={full ? "Tam ekrandan çık" : "Tam ekran"} onClick={fullscreen}><Maximize size={17} /></button>
      </div>}
      {view !== "2d" && view !== "fallback" && <details className="spatial-layers">
        <summary><Layers3 size={17} /> Katmanlar</summary>
        <div>
          <label><input type="checkbox" checked={boundary} onChange={e => setBoundary(e.target.checked)} /> Parsel sınırı</label>
          <label><input type="checkbox" checked={basemap}
            onChange={e => setBasemap(e.target.checked)} /> Esri uydu altlığı</label>
          {!isOpen && observed && <label><input type="checkbox" checked={trueColor}
            disabled={!observation}
            onChange={e => setTrueColor(e.target.checked)} /> Sentinel-2 doğal renk</label>}
          {cropAsset && <label><input type="checkbox" checked={showCrop}
            onChange={e => setShowCrop(e.target.checked)} /> Temsili bitki modeli</label>}
          {observed && <label><input type="checkbox" checked={showObservations && observationsOnField.length > 0}
            disabled={!observationsOnField.length} onChange={e => setShowObservations(e.target.checked)} /> Saha gözlemleri</label>}
          {variant === "twin" && <label><input type="checkbox" checked={showZones}
            disabled={!zonePlan} onChange={e => { setShowZones(e.target.checked); setPoint(null); }} /> Reçete bölgeleri</label>}
          <label><input type="checkbox" checked={topography && renderMode !== "columns"} disabled={renderMode === "columns"}
            onChange={e => setTopography(e.target.checked)} /> Yükseklik modeli</label>
          {observed && <label><input type="checkbox" checked={layerEnabled} disabled={!layer}
            onChange={e => setLayerEnabled(e.target.checked)} /> {layer || "İndeks yüzeyi"}</label>}
          <label>Katman saydamlığı <input aria-label="Katman saydamlığı" type="range" min="0" max="1" step="0.01"
            value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></label>
          {topography && renderMode !== "columns" && <label>Düşey abartı · {exaggeration}×
            <input aria-label="Düşey abartı" type="range" min="1" max="3" step="0.5" value={exaggeration}
              onChange={e => setExaggeration(Number(e.target.value))} /></label>}
          {mode === "blend" && <label>Karşılaştırma saydamlığı<input aria-label="Karşılaştırma saydamlığı"
            type="range" min="0" max="1" step="0.01" value={blend} onChange={e => setBlend(Number(e.target.value))} /></label>}
        </div>
      </details>}
      {!isMap && view === "3d" && <div className="spatial-coordinate-tag">
        <span>{terrain ? "DEM · " + exaggeration + "×" : "DÜZ REFERANS"}</span>
        <span><span className="spatial-north" ref={northArrow}>↑</span> K · {number(frame.span, 0)} m parsel açıklığı</span>
      </div>}
      {contextImagery?.canvas && <a className="spatial-esri-attribution" href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"
        target="_blank" rel="noreferrer">Esri World Imagery · Esri, Vantor, Earthstar Geographics, GIS User Community</a>}
      {fullscreenError && <p className="spatial-map-notice" role="status">{fullscreenError}</p>}
    </div>
    <div className="spatial-readout">
      <div>
        <small className="spatial-eyebrow">{raster ? "GÖRÜNTÜLENEN VERİ" : "GÖRÜNÜM KAYNAĞI"}</small>
        <strong>{raster ? raster.metric + " · " + raster.source : isMap ? "Kayıtlı sınır / görsel altlık" : "Kayıtlı parsel geometrisi"}</strong>
        <p>{raster ? dateLabel(raster.date) + " · yaklaşık " + raster.resolution.map(v => number(v, 1)).join(" × ") + " m · " +
          raster.values.filter(Number.isFinite).length + " geçerli hücre · " + raster.method +
            (previous && comparisons.includes(renderMode) ? " · Karşılaştırma " + dateLabel(previous.date) : "")
          : topography && view === "3d" ? isMap ? "Topoğrafya · Mapzen Terrain Tiles" : terrain ?
            "Mapzen DEM · yaklaşık " + number(terrain.resolution, 0) + " m döşeme aralığı" +
              (terrain.sources.length ? " · " + terrain.sources.join(", ") : "") + " · Düşey abartı " + exaggeration + "×"
            : dem ? "Yükseklik verisi alınamadı. Düz referans yüzeyi." : "Yükseklik verisi yükleniyor. Düz referans yüzeyi."
            : "Düz referans yüzeyi."}</p>
        {markerText && <p>{markerText}</p>}
        {showZones && zonePlan && <p>{zonePlan.name} · v{zonePlan.version} · Kullanıcı reçete taslağı</p>}
        {raster && <p>Yakın komşu örnekleme · {raster.mask || "bulut ve NoData maskeli"} · {
          raster.provider === openSentinelProvider ? raster.sceneId : raster.provider === "cdse" ? "Copernicus Data Space" : "Sentinel Hub"}</p>}
        {raster?.capturedAt && <p>Çekim {raster.capturedAt.slice(0, 19).replace("T", " ")} UTC</p>}
        {datedImagery && <p>Sentinel‑2 doğal renk · {dateLabel(observation.date)}</p>}
        {showCrop && cropAsset && <p>Bitki konumu, gelişim evresi ve görsel boyutu temsilidir.</p>}
        {contextImagery?.unavailable && <p>Esri altlığı alınamadı. Şematik yüzey gösteriliyor.</p>}
      </div>
      {raster && scale && <div className="spatial-legend" aria-label="Renk skalası">
        <span>{renderMode === "columns" ? "Sütun yüksekliği indeks ölçeğidir." :
          comparisons.includes(renderMode) && renderMode !== "blend" ? "Güncel − karşılaştırma" : "Piksel değeri"} · {raster.unit}</span>
        <i style={{ background: "linear-gradient(90deg," + scale.palette.map(rgb).join(",") + ")" }} />
        <div><span>{number(scale.min)}</span><span>{number((scale.min + scale.max) / 2)}</span><span>{number(scale.max)}</span></div>
      </div>}
      {point && <div className="spatial-point-readout" role="status">
        <small className="spatial-eyebrow">SEÇİLEN NOKTA</small>
        <button type="button" className="text-button spatial-clear-point" onClick={() => setPoint(null)}>Seçimi temizle</button>
        <strong>{point.coordinate.toReversed().map(v => number(v, 5)).join(" / ")}</strong>
        <p>{raster ? raster.metric + " " + (Number.isFinite(sampledValue) ? number(sampledValue) + " " + raster.unit : "· geçerli piksel yok") : ""}
          {Number.isFinite(height) ? " · " + number(height, 1) + " m" : ""}
          {relief ? " · eğim " + number(relief.slope, 1) + "° · bakı " + (relief.aspect === null ? "düz" : number(relief.aspect, 0) + "°") : ""}</p>
        {reference && <p>{dateLabel(reference.date)} · {Number.isFinite(previousValue) ?
          number(previousValue) + " " + reference.unit : "Geçerli piksel yok"}</p>}
        {Number.isFinite(point.squareMeters) ? <p>Parsel içindeki hücre alanı · {number(point.squareMeters, 1)} m²</p>
          : Number.isFinite(sampledValue) && <Suspense fallback={null}>
            <PixelArea raster={raster} geometry={field.geometry} index={sampledIndex} />
          </Suspense>}
        {point.marker && <><strong>{point.marker.name}</strong>
          <p>{dateLabel(point.marker.date)} · Kullanıcı saha kaydı</p><p>{point.marker.notes}</p></>}
        {point.zone && <p>{point.zone.name} · {number(point.zone.rate)} {zonePlan.payload.unit === "m3/ha" ?
          "m³/ha" : zonePlan.payload.unit} · Kullanıcı taslağı</p>}
      </div>}
    </div>
    {!!markers.length && <div className="spatial-control-deck"><label>Saha gözlemi noktaları
      <select value={point?.marker?.id || ""} onChange={event => {
        const marker = markers.find(item => item.id === event.target.value);
        if (!marker) { setPoint(null); return; }
        const [x, z] = frame.local(marker.coordinate);
        setPoint({ marker, coordinate: marker.coordinate, x, z });
        setCommand({ type: "focus", coordinate: marker.coordinate, local: [x / frame.span, z / frame.span] });
      }}>
        <option value="">Bir saha kaydı seçin</option>
        {markers.map(marker => <option key={marker.id} value={marker.id}>{marker.name} · {dateLabel(marker.date)}</option>)}
      </select></label></div>}
    {(currentCatalog?.error || earlierCatalog?.error) && <p className="spatial-status" role="alert">{currentCatalog?.error || earlierCatalog?.error}</p>}
    {isOpen && currentCatalog?.observations?.length === 0 && <p className="spatial-status">
      Bu ay parseli kapsayan arşiv sahnesi bulunamadı. Başka bir ay seç.
    </p>}
    {!isOpen && catalog?.observations?.length === 0 && <div className="spatial-status">
      <p>Güncel sınıra ait kayıtlı Sentinel-2 gözlemi yok. Raster katmanı için parsel analizini tamamlayın.</p>
      <button className="text-button" onClick={onField}>Parsel analizini aç <ArrowUpRight size={15} /></button>
      <button className="text-button" onClick={() => onNavigate("integrations")}>Veri bağlantıları <ArrowUpRight size={15} /></button>
    </div>}
    {(primary.loading || compare.loading) && <p className="spatial-status" role="status">Sağlayıcıdan sayısal gözlem katmanı alınıyor…</p>}
    {(primary.error || compare.error || imagery?.key === rgbKey && imagery?.error) && <div className="spatial-status" role="alert">
      <p>{primary.error || compare.error || imagery.error}</p>
      {(primary.error || compare.error) && <button className="text-button" onClick={primary.error ? primary.retry : compare.retry}>Katmanı yeniden dene</button>}
      <button className="text-button" onClick={() => onNavigate("integrations")}>Veri bağlantıları <ArrowUpRight size={15} /></button>
    </div>}
    {compare.data && primary.data && !delta && <p className="spatial-status">Bu iki gözlemin kaynak veya örnekleme ızgaraları eşleşmiyor.</p>}
    {delta && mode === "difference" && !delta.values.some(Number.isFinite) &&
      <p className="spatial-status">İki tarihte de geçerli olan ortak piksel bulunamadı.</p>}
    {renderMode === "outliers" && delta && <div className="spatial-status">
      <p>{outliers ? outliers.values.filter(Number.isFinite).length + " / " + outliers.screen.samples +
        " ortak hücre, fark dağılımının medyanından MAD eşiğinin (3,5) üzerinde sapıyor."
        : "İnceleme katmanı için en az 16 ortak hücre ve sıfırdan farklı dağılım gerekiyor."}</p>
      <p>Bu hücreler saha kontrolü için adaydır. Tarımsal risk seviyesi veya müdahale önerisi üretmez.</p>
      {outliers?.values.some(Number.isFinite) && <button className="text-button" onClick={() => onNavigate("investigation", field.id)}>
        Saha incelemesine geç <ArrowUpRight size={15} /></button>}
    </div>}
    {renderMode === "columns" && <p className="spatial-status">Analitik sütunlar düz referanstan yükselir. Topoğrafyayı görmek için arazi üstü moduna dönün.</p>}
    {raster && scale && <details className="spatial-distribution">
      <summary>Görüntüleme aralığı</summary>
      <form className="spatial-range" key={layer + renderMode} onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const min = Number(form.get("min")), max = Number(form.get("max"));
        if (min < max) { setRange({ layer, mode: renderMode, min, max }); setRangeError(""); }
        else setRangeError("Alt değer üst değerden küçük olmalı.");
      }}>
        <label>Alt değer<input name="min" type="number" step="any" required defaultValue={scale.min} /></label>
        <label>Üst değer<input name="max" type="number" step="any" required defaultValue={scale.max} /></label>
        <button className="secondary" type="submit">Uygula</button>
        <button className="text-button" type="reset" onClick={() => { setRange(null); setRangeError(""); }}>Varsayılan aralık</button>
      </form>
      {rangeError && <p role="alert">{rangeError}</p>}
      <p>Renk aralığı ekrandaki gösterimi değiştirir. Kaynak piksel değerleri korunur.</p>
    </details>}
    {isMap && raster && scale && <details className="spatial-distribution" onToggle={event => setShowDistribution(event.currentTarget.open)}>
      <summary>{raster.screen ? "İnceleme bölgeleri ve alan" : "Değer aralıklarına göre alan"}</summary>
      {showDistribution && <Suspense fallback={<p role="status">Hücre alanları hazırlanıyor…</p>}>
        <RegionalInsights key={[raster.provider, raster.date, raster.metric, renderMode, previous?.date].join("/")}
          {...{ raster, scale, geometry: field.geometry, earlierDate: previous?.date }}
          onFocus={(coordinate, geometry) => {
            setPoint(null); setReviewRegion({ raster, geometry });
            setCommand({ type: "region", geometry, coordinate });
            stage.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "instant" : "smooth" });
          }} />
      </Suspense>}
    </details>}
    {observed && (isOpen
      ? <OpenTimeline observations={observations} active={observation?.date} onSelect={chooseDate} />
      : <Timeline {...{ observations, layer, active: observation?.date, onSelect: chooseDate }} />)}
    <footer className="spatial-footer">
      <span>Sınır <code>{context.geometryHash.slice(0, 12)}</code></span>
      {isOpen && <a href="https://registry.opendata.aws/sentinel-2-l2a-cogs/" target="_blank" rel="noreferrer">
        Earth Search veri kaynağı <ArrowUpRight size={14} /></a>}
      {!isMap && <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Yükseklik kaynağı <ArrowUpRight size={14} /></a>}
      {showCrop && cropAsset && <a href="/visuals/spatial-models.txt" target="_blank" rel="noreferrer">Bitki modeli lisansı <ArrowUpRight size={14} /></a>}
      {observed && <button className="text-button" onClick={() => onNavigate("temporal", field.id)}>Arazi hafızası <ArrowUpRight size={15} /></button>}
      {variant === "twin" && <button className="text-button" onClick={() => onNavigate("prescriptions", field.id)}>Yönetim bölgeleri <ArrowUpRight size={15} /></button>}
    </footer>
  </section>;
}

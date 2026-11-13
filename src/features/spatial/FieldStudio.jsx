import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Compass, Droplets, Crosshair, Layers3, Maximize, Mountain, Plus, Minus, ScanLine, Sprout, X } from "lucide-react";
import { api, fetchAnalysisImage } from "../../api";
import { availableMetrics, indices } from "../../../shared/metrics";
import { openSentinelMetrics, openSentinelProvider } from "../../../shared/open-sentinel";
import { compareRasters, containsPoint, metricFrame, pixelIndex } from "../../../shared/spatial";
import { useAreaFormat } from "../../components/PreferenceProvider";
import ParcelMap from "../fields/ParcelMap";
import { mapboxEnabled } from "../fields/basemaps";
import { colorFor, colorScale, rgb } from "./colors";
import { GeospatialMap, SpatialBoundary, useMedia, useOpenCatalog, useRaster } from "./SpatialWorkbench";
import { useDroneTerrain } from "./DroneTerrain";
import { useDroneTerrainSource, useTerrainSample } from "./map-terrain";
import { condition } from "../weather/weather-format";
import StudioReference from "./StudioReference";
import { SceneCards, SceneLeaders, WeatherBand, sceneSlots } from "./StudioOverlay";
import "./field-studio.css";
import "./studio-composition.css";

const DraftEditor = lazy(() => import("../platform/PlatformWorkspace").then(module => ({ default: module.DraftEditor })));
const PixelArea = lazy(() => import("./RegionalInsights").then(module => ({ default: module.PixelArea })));
const noItems = [];
const anchorOffsets = [[-0.25, -0.24], [-0.04, -0.12], [0.24, 0.12], [0.25, -0.2], [-0.24, 0.25]];
const format = (value, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString("tr-TR", { maximumFractionDigits: digits }) : "Veri yok";
const shortDate = value => value ? new Date(value.length === 10 ? value + "T12:00:00Z" : value)
  .toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" }) : "Veri yok";
const known = (observation, metric) => observation?.available?.includes(metric) || Number.isFinite(observation?.metrics?.[metric]);

function useFieldResource(path, fallback) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, undefined, "GET", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult({ path, value }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ path, error: error.message }); });
    return () => controller.abort();
  }, [path, revision]);
  const current = result?.path === path ? result : null;
  return { value: current?.value ?? fallback, error: current?.error, loading: !!path && !current,
    refresh: () => setRevision(value => value + 1) };
}

function WeatherStrip({ forecast, loading, error }) {
  const point = forecast?.points.find(item => Date.parse(item.time) >= Date.now() - 3600000);
  const period = point?.periods.find(item => item.hours === 1) || point?.periods[0];
  const { Icon, label } = condition(period?.symbol);
  return <WeatherBand Icon={Icon} condition={label} status={loading ? "Yükleniyor…" : error ? "Bağlantı hatası" : "Tahmin yok"}
    values={point && {
      temperature: point.values.air_temperature, rain: period?.values.precipitation_amount,
      humidity: point.values.relative_humidity, cloud: point.values.cloud_area_fraction, wind: point.values.wind_speed,
    }} />;
}

function useNaturalImage(fieldId, observation, enabled) {
  const [result, setResult] = useState(null);
  const id = enabled && observation?.provider !== openSentinelProvider ? observation?.id : null;
  const date = observation?.date;
  useEffect(() => {
    if (!id || !date) return;
    const controller = new AbortController();
    let bitmap;
    fetchAnalysisImage(fieldId, { date, analysisId: id, layer: "RGB", signal: controller.signal })
      .then(async image => {
        try {
          const response = await fetch(image.url, { signal: controller.signal });
          bitmap = await createImageBitmap(await response.blob());
          if (controller.signal.aborted) bitmap.close();
          else setResult({ fieldId, id, date, bounds: image.bounds, bitmap });
        } finally { URL.revokeObjectURL(image.url); }
      }).catch(() => {});
    return () => { controller.abort(); bitmap?.close(); };
  }, [fieldId, id, date]);
  return id && result?.id === id && result?.date === date && result?.fieldId === fieldId ? result : null;
}

function Sparkline({ values }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  return <svg viewBox="0 0 110 24" className="field-studio-sparkline" role="img" aria-label="Kayıtlı parsel ortalaması eğilimi">
    <polyline points={values.map((value, index) => [3 + 104 * index / (values.length - 1),
      min === max ? 12 : 21 - (value - min) * 18 / (max - min)].join(",")).join(" ")} />
  </svg>;
}

export default function FieldStudio({ fields, tasks, initialFieldId, initialMetric, commercial, canWrite, onNavigate, onCreateTask, onToggleTask, onCreateField }) {
  const drawn = useMemo(() => fields.filter(field => field.geometry), [fields]);
  const [fieldId, setFieldId] = useState(initialFieldId || "");
  const [view, setView] = useState(initialFieldId || initialMetric ? "live" : "reference");
  const field = drawn.find(item => item.id === fieldId) || drawn[0];
  return <section className="field-studio" aria-label="3D Saha Stüdyosu">
    {view === "reference" || !field ? <StudioReference empty={!field}
      onLive={() => field ? setView("live") : onCreateField()} /> :
      <StudioScene key={field.id + ":" + (initialMetric || "")} {...{ field, drawn, tasks, initialMetric, commercial, canWrite, onNavigate, onCreateTask, onToggleTask }}
        onField={setFieldId} onReference={() => setView("reference")} />}
  </section>;
}

function StudioScene({ field, drawn, tasks, initialMetric, commercial, canWrite, onNavigate, onCreateTask, onToggleTask, onField, onReference }) {
  const area = useAreaFormat();
  const compact = useMedia("(max-width: 760px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const bundle = useFieldResource("platform/fields/" + field.id);
  const recorded = useFieldResource("platform/fields/" + field.id + "/spatial");
  const weather = useFieldResource("weather?fieldId=" + encodeURIComponent(field.id));
  const geometryVersion = bundle.value?.context.geometryHash || recorded.value?.geometryHash;
  const dataMatches = !!geometryVersion && (!recorded.value || recorded.value.geometryHash === geometryVersion);
  const [command, setCommand] = useState(null);
  const [panel, setPanel] = useState("");
  const water = useFieldResource(commercial && panel === "water" ? "v1/fields/" + field.id + "/water-balance" : null);
  const [editor, setEditor] = useState(null);
  const [mode, setMode] = useState(initialMetric ? "surface" : "natural");
  const [source, setSource] = useState("recorded");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [date, setDate] = useState("");
  const [earlier, setEarlier] = useState("");
  const [layer, setLayer] = useState(initialMetric || "NDVI");
  const [opacity, setOpacity] = useState(0.76);
  const [point, setPoint] = useState(null);
  const [lost, setLost] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [fullError, setFullError] = useState("");
  const stage = useRef(null);
  const firstPanelButton = useRef(null);
  const [scenePoints, setScenePoints] = useState({});
  const [beforeDate, setBeforeDate] = useState("");
  const [rates, setRates] = useState(null);
  const [ratePending, setRatePending] = useState(false);
  const [rateMessage, setRateMessage] = useState("");
  const seasonResource = useFieldResource(commercial ? "v1/records/season?fieldId=" + field.id : null);
  const open = useOpenCatalog(field.id, geometryVersion, source === "archive" && geometryVersion ? month : "");
  const catalog = source === "archive" ? open : dataMatches ? recorded.value : null;
  const observations = catalog?.observations || noItems;
  const active = observations.find(item => item.date === date) || observations[0];
  const supported = active?.provider === openSentinelProvider ? openSentinelMetrics : availableMetrics(active?.provider);
  const metrics = supported.filter(item => known(active, item.id));
  const metric = metrics.find(item => item.id === layer) || metrics.find(item => item.id === "NDVI") || metrics[0];
  const past = observations.filter(item => item.date < active?.date && item.provider === active.provider &&
    item.method === active.method && known(item, metric?.id));
  const previous = past.find(item => item.date === earlier) || past[0];
  const rasterMode = ["surface", "columns", "change"].includes(mode);
  const primary = useRaster(field.id, geometryVersion, active, metric?.id, rasterMode && !!metric);
  const baseline = useRaster(field.id, geometryVersion, previous, metric?.id, mode === "change" && !!metric);
  const change = useMemo(() => primary.data && baseline.data ? compareRasters(primary.data, baseline.data) : null,
    [primary.data, baseline.data]);
  const raster = mode === "change" ? change : primary.data;
  const scale = useMemo(() => raster ? colorScale(raster, null, mode === "change") : null, [raster, mode]);
  const index = point && raster ? pixelIndex(raster, point.coordinate) : -1;
  const value = raster?.values[index];
  const drone = useDroneTerrain(field.id, geometryVersion, frame, commercial && !!geometryVersion, !lost);
  const naturalImage = useNaturalImage(field.id, active, !mapboxEnabled && !drone.imagery && !lost);
  const dem = useTerrainSample(frame, !lost && (panel === "index" || !!drone.dtm));
  const terrainDefinition = useDroneTerrainSource(frame, drone.dtm, dem);
  const selectedPosition = point ? frame.local(point.coordinate) : null;
  const droneHeight = selectedPosition && drone.dtm?.sample(...selectedPosition);
  const elevation = Number.isFinite(droneHeight) ? droneHeight : selectedPosition && dem?.sample?.(...selectedPosition);
  const modelRun = water.value?.run;
  const model = modelRun?.data.geometryVersion === geometryVersion ? modelRun?.data.result : null;

  const records = bundle.value?.records || noItems;
  const current = useMemo(() => records.filter(record =>
    record.fieldSnapshot.geometryHash === geometryVersion && record.status !== "archived"), [records, geometryVersion]);
  const zonePlan = current.find(record => record.kind === "prescription" && record.payload.zones?.length);
  const draftRates = rates?.id === zonePlan?.id && rates?.version === zonePlan?.version ? rates?.values : null;
  const draftQuantity = draftRates && zonePlan.calculation?.zones?.reduce((total, zone, index) =>
    total + zone.hectares * Number(draftRates[index]), 0);

  function editRate(index, rate) {
    setRateMessage("");
    const values = draftRates ? [...draftRates] : zonePlan.payload.zones.map(zone => String(zone.rate));
    values[index] = rate;
    setRates({ id: zonePlan.id, version: zonePlan.version, values });
  }

  async function saveRates() {
    if (draftRates.some(value => value === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e8)) {
      setRateMessage("Geçerli uygulama oranları gir.");
      return;
    }
    setRatePending(true);
    setRateMessage("");
    try {
      await api("platform/records/" + zonePlan.id, {
        fieldId: field.id, kind: "prescription", name: zonePlan.name, status: zonePlan.status, version: zonePlan.version,
        payload: { ...zonePlan.payload, zones: zonePlan.payload.zones.map((zone, index) => ({ ...zone, rate: Number(draftRates[index]) })) },
      }, "PATCH");
      setRates(null);
      setRateMessage("Oranlar kaydedildi.");
      bundle.refresh();
    } catch (error) {
      setRateMessage(error.message);
      if (error.status === 409) bundle.refresh();
    } finally {
      setRatePending(false);
    }
  }
  const zones = mode === "zones" ? zonePlan?.payload.zones || noItems : noItems;
  const markers = useMemo(() => current.filter(record => record.kind === "observation" && record.payload.coordinate).map(record => ({
    id: record.id, name: record.name, coordinate: record.payload.coordinate, date: record.payload.observedAt, notes: record.payload.notes,
  })), [current]);
  const fieldTasks = useMemo(() => tasks.filter(task => task.fieldId === field.id).sort((a, b) =>
    a.date.localeCompare(b.date)), [tasks, field.id]);
  const average = active?.metrics?.[metric?.id];
  const earlierAverage = previous?.metrics?.[metric?.id];
  const signal = Number.isFinite(average) && Number.isFinite(earlierAverage) ? average - earlierAverage : null;
  const history = observations.toReversed().map(item => item.metrics?.[metric?.id]).filter(Number.isFinite).slice(-20);
  const measurementScale = useMemo(() => mode !== "change" && scale ? scale
    : metric ? colorScale({ metric: metric.id, values: [average] }) : null, [mode, scale, metric, average]);
  const indexPalette = useMemo(() => measurementScale && measurementScale.min < measurementScale.max
    ? Array.from({ length: 9 }, (_, i) => rgb(colorFor(
      measurementScale.min + i * (measurementScale.max - measurementScale.min) / 8, measurementScale)))
    : null, [measurementScale]);
  const anchors = useMemo(() => sceneSlots.flatMap((slot, index) => {
    const [x, z] = anchorOffsets[index];
    for (const weight of [1, 0.75, 0.5, 0.25]) {
      const coordinate = frame.coordinate(x * frame.width * weight, z * frame.depth * weight);
      if (containsPoint(field.geometry, coordinate)) return [{ id: slot.id, coordinate }];
    }
    return [];
  }), [frame, field.geometry]);
  const seasonRecord = seasonResource.value?.records?.find(item => item.fieldId === field.id)?.data;
  const recordedDates = [seasonRecord?.sowingDate || field.sowingDate, seasonRecord?.harvestDate];
  const season = {
    labels: ["Ekim", "Hasat"],
    selected: recordedDates[1] && Date.parse(recordedDates[1]) <= Date.now() ? 1 : recordedDates[0] && Date.parse(recordedDates[0]) <= Date.now() ? 0 : -1,
    title: seasonRecord?.crop || field.crop || "Ürün kaydı yok",
    date: recordedDates[0] ? "Ekim · " + shortDate(recordedDates[0]) : "Ekim kaydı yok",
    caption: recordedDates[1] ? "Hasat · " + shortDate(recordedDates[1]) : "Hasat kaydı yok",
  };
  const cards = {
    season,
    zones: { rows: (zonePlan?.payload.zones || noItems).map((zone, index) => ({
        id: index + 1, name: zone.name, rate: draftRates?.[index] ?? zone.rate,
        detail: zonePlan.calculation?.zones?.[index] && format(zonePlan.calculation.zones[index].hectares) + " ha",
      })),
      unit: zonePlan?.payload.unit?.replace("m3", "m³"), empty: "Kayıtlı uygulama bölgesi yok.",
      footer: zonePlan?.calculation && { label: "Toplam uygulama", value:
        format(draftQuantity ?? zonePlan.calculation.quantity) + " " + zonePlan.calculation.unit } },
    change: { metric: metric?.id || layer, beforeDate: shortDate(previous?.date), afterDate: shortDate(active?.date),
      before: earlierAverage, after: average, delta: signal },
    index: { metric: metric?.id || layer, value: average, series: history, palette: indexPalette,
      band: indexPalette && Number.isFinite(average) ? Math.max(0, Math.min(8, Math.round(
        8 * (average - measurementScale.min) / (measurementScale.max - measurementScale.min)))) : -1 },
    tasks: { rows: fieldTasks.map(task => ({ id: task.id, name: task.name, date: shortDate(task.date) })) },
  };
  function compareView() {
    if (beforeDate) {
      setDate(beforeDate);
      setBeforeDate("");
    } else if (previous) {
      setBeforeDate(active.date);
      setDate(previous.date);
    }
    if (!rasterMode) setMode("surface");
    setPoint(null);
  }
  const fallback = <div className="field-studio-fallback">
    <p role="status">3D görünüm açılamadı. Parsel sınırı yol haritasında açık.</p>
    <ParcelMap geometry={field.geometry} fields={drawn} height="100%" compact />
  </div>;
  const title = { index: "İndeks ve nokta okuması", tasks: "Saha faaliyetleri", season: "Ürün ve sezon",
    change: "Tarihler arası değişim", zones: "Yönetim bölgeleri", observations: "Saha gözlemleri", water: "Kök bölgesi su dengesi", layers: "Görünüm ve veri kaynakları" }[panel];
  const openPanel = name => setPanel(old => old === name ? "" : name);
  useEffect(() => {
    if (panel) firstPanelButton.current?.focus({ preventScroll: true });
  }, [panel]);
  async function fullscreen() {
    try {
      if (document.fullscreenElement === stage.current) await document.exitFullscreen();
      else await stage.current.requestFullscreen();
    } catch { setFullError("Tam ekran bu tarayıcıda açılamadı."); }
  }
  const choose = value => {
    setMode(value);
    setPoint(null);
    if (value === "change" || value === "zones") setPanel(value);
  };

  return <>
    <div ref={stage} className="field-studio-scene scene-live" data-panel-open={!!panel}>
      <div className="field-studio-map">
        {lost ? fallback : <SpatialBoundary fallback={fallback}>
          <Suspense fallback={<p className="spatial-loading" role="status">Arazi hazırlanıyor…</p>}>
            <GeospatialMap {...{ field, frame, command, raster, scale, opacity, reduced, compact, anchors, markers, zones, terrainDefinition }}
              studio onAnchorPoints={setScenePoints} neighbors={drawn} onParcel={onField} mode={mode === "columns" ? "columns" : "surface"}
              droneImagery={drone.imagery} imagery={naturalImage} selection={point?.coordinate} interaction={!compact || interactive}
              onError={() => setLost(true)} onPoint={item => {
                setPoint(item); setPanel(item.marker ? "observations" : "index");
              }} />
          </Suspense>
        </SpatialBoundary>}
      </div>
      <h1 className="sr-only">3D Saha Stüdyosu</h1>
      <div className="scene-view-actions">
        <label><span className="sr-only">Saha stüdyosu parseli</span>
          <select aria-label="Saha stüdyosu parseli" value={field.id} onChange={event => onField(event.target.value)}>{drawn.map(item =>
            <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </label>
        {(previous || beforeDate) && <button type="button" onClick={compareView}
          aria-label={beforeDate ? "Sonra görünümüne geç" : "Önce görünümüne geç"}>{beforeDate ? "Önce" : "Sonra"}</button>}
        <button type="button" onClick={onReference}>Örnek panorama</button>
      </div>
      <WeatherStrip forecast={weather.value} loading={weather.loading} error={weather.error} />
      <SceneLeaders points={scenePoints} selected={panel} visible={!compact && !panel} onSelect={openPanel} />
      <SceneCards {...cards} selected={panel} onOpen={openPanel}
        onRate={canWrite && zonePlan ? editRate : undefined} onRateSave={canWrite && draftRates ? saveRates : undefined}
        {...{ ratePending, rateMessage }} />
      {naturalImage && <p className="field-studio-orthophoto">Sentinel-2 doğal renk · {shortDate(naturalImage.date)}</p>}
      {drone.imagery && <p className="field-studio-orthophoto">Drone ortomozaik · {shortDate(drone.selected.capturedOn)} · {drone.selected.source}</p>}
      <div className="field-studio-camera" role="group" aria-label="Harita kamerası">
        {[[Compass, "north", "Kuzeye dön"], [Crosshair, "fit", "Parsele odaklan"], [Mountain, "slope", "Ufuk görünümü"],
          [ScanLine, "top", "Üstten görünüm"], [Plus, "in", "Yakınlaştır"], [Minus, "out", "Uzaklaştır"]].map(([Icon, type, label]) =>
          <button key={type} type="button" title={label} aria-label={label} disabled={lost} onClick={() => setCommand({ type })}><Icon size={17} /></button>)}
        {compact && <button type="button" aria-label="Kamera hareketi" aria-pressed={interactive} onClick={() => setInteractive(!interactive)}><Compass size={17} /></button>}
        <button type="button" title="Tam ekran" aria-label="Tam ekran" onClick={fullscreen}><Maximize size={17} /></button>
      </div>
      <div className="field-studio-bottom">
        <div className="field-studio-modes" role="group" aria-label="3D katman görünümü">
          {[["natural", "Doğal renk"], ["surface", "İndeks yüzeyi"], ["columns", "3D sütun"], ["change", "Tarih farkı"], ["zones", "Bölgeler"]].map(([id, label]) =>
            <button type="button" key={id} aria-pressed={mode === id} onClick={() => choose(id)}>{label}</button>)}
        </div>
        {rasterMode && <div className="field-studio-data-controls">
          <label><span className="sr-only">İndeks</span><select aria-label="İndeks" value={metric?.id || ""} onChange={event => { setLayer(event.target.value); setPoint(null); }}>
            {!metric && <option value="">İndeks verisi yok</option>}
            <optgroup label="Bitki, su ve toprak indeksleri">{indices.map(item =>
              <option key={item.id} value={item.id} disabled={!metrics.some(available => available.id === item.id)}>{item.id} · {item.label}</option>)}</optgroup>
            <optgroup label="Bantlar ve yardımcı katmanlar">{metrics.filter(item => !indices.some(ind => ind.id === item.id)).map(item =>
              <option key={item.id} value={item.id}>{item.id} · {item.label}</option>)}</optgroup>
          </select></label>
          <label><span className="sr-only">Gözlem tarihi</span><select aria-label="Gözlem tarihi" value={active?.date || ""} onChange={event => { setDate(event.target.value); setBeforeDate(""); setPoint(null); }}>
            {!active && <option value="">Gözlem tarihi yok</option>}
            {observations.map(item => <option key={item.date} value={item.date}>{shortDate(item.date)}</option>)}
          </select></label>
        </div>}
        <div className="field-studio-trays" role="group" aria-label="Saha verisi">
          {[["layers", Layers3, "Kaynaklar"], ["index", ScanLine, "Değer"], ["season", Sprout, "Sezon"], ["tasks", CalendarDays, "Görev"], ["observations", Crosshair, "Gözlem"], ["water", Droplets, "Su dengesi"]].map(([id, Icon, label]) =>
            <button type="button" key={id} aria-pressed={panel === id} onClick={() => openPanel(id)}><Icon size={15} />{label}</button>)}
        </div>
      </div>
      {scale && <div className="field-studio-legend"><span>{format(scale.min)}</span>
        <i style={{ background: "linear-gradient(90deg," + scale.palette.map(rgb).join(",") + ")" }} />
        <span>{format(scale.max)} {raster.unit}</span>
      </div>}
      {fullError && <p className="field-studio-status" role="status">{fullError}</p>}
      {rasterMode && <div className="field-studio-status" role="status">
        {primary.error || baseline.error ? <>{primary.error || baseline.error} <button onClick={() => { primary.retry(); baseline.retry(); }}>Yeniden dene</button></> :
          primary.loading || baseline.loading || recorded.loading ? "Analiz katmanı hazırlanıyor…" :
          !metric ? "Bu tarihte görüntülenebilir analiz kaydı yok." :
          mode === "change" && !change ? "Aynı yöntem ve ızgarada iki geçerli gözlem gerekiyor." :
          mode === "columns" ? "Sütun yüksekliği indeks ölçeğini gösterir." : null}
      </div>}
      {panel && <aside className="field-studio-drawer" aria-label={title} onKeyDown={event => { if (event.key === "Escape") setPanel(""); }}>
        <header><div><small>{field.name}</small><h2>{title}</h2></div>
          <button type="button" ref={firstPanelButton} onClick={() => setPanel("")} aria-label="Paneli kapat"><X size={18} /></button></header>
        {panel === "layers" && <>
          <label>Analiz kaynağı<select value={source} onChange={event => { setSource(event.target.value); setDate(""); setEarlier(""); setBeforeDate(""); setPoint(null); }}>
            <option value="recorded">Kayıtlı analizler</option><option value="archive">Açık Sentinel-2 arşivi</option>
          </select></label>
          {source === "archive" && <label>Arşiv ayı<input type="month" value={month} onChange={event => { setMonth(event.target.value); setDate(""); setPoint(null); }} /></label>}
          <p>{mapboxEnabled ? "Mapbox Satellite · görsel altlık" : "Sentinel-2 Cloudless 2016 · tarihli görsel altlık"} · Mapzen yükseklik</p>
          {(catalog?.error || recorded.error || bundle.error) && <p role="alert">{catalog?.error || recorded.error || bundle.error}</p>}
          <label>İndeks katmanı saydamlığı<input type="range" min="0.15" max="1" step="0.01" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>
          {drone.ready.length > 0 && <label>Arazi görüntüsü<select value={drone.selected?.id || "satellite"} onChange={event => drone.choose(event.target.value)}>
            <option value="satellite">Harita altlığı</option>{drone.ready.map(item => <option key={item.id} value={item.id}>{item.capturedOn} · {item.source}</option>)}
          </select></label>}
          <button className="field-studio-link" onClick={() => onNavigate("twin", field.id)}>Drone dosyalarını yönet <ArrowUpRight size={15} /></button>
        </>}
        {panel === "index" && <>
          <div className="field-studio-reading"><small>{metric?.id || "Uydu indeksi"} · {point ? "Seçili piksel" : "Parsel ortalaması"}</small>
            <strong>{format(point ? value : average, 3)}</strong><Sparkline values={history} /></div>
          <p>{metric?.description || "Gözlem kaydedildiğinde indeksler burada açılır."}</p>
          {active && <p>{active.source} · {shortDate(active.date)}{raster && " · " + raster.resolution.map(value => format(value, 1)).join(" × ") + " m"}</p>}
          {point && <p>{point.coordinate.map(coordinate => format(coordinate, 5)).join(" / ")}
            {Number.isFinite(elevation) && " · " + format(elevation, 1) + " m (" + (Number.isFinite(droneHeight) ? "Drone DTM" : "Mapzen") + ")"}</p>}
          {raster && <Suspense fallback={null}><PixelArea raster={raster} geometry={field.geometry} index={index} /></Suspense>}
          <button className="field-studio-link" onClick={() => { setMode("surface"); setPanel(""); }}>İndeks yüzeyini aç <ArrowUpRight size={15} /></button>
        </>}
        {panel === "change" && <>
          <label>Önceki gözlem<select value={previous?.date || ""} onChange={event => setEarlier(event.target.value)}>
            {!previous && <option value="">Uygun önceki gözlem yok</option>}
            {past.map(item => <option key={item.date} value={item.date}>{shortDate(item.date)}</option>)}
          </select></label>
          <dl><div><dt>{shortDate(previous?.date)}</dt><dd>{format(earlierAverage, 3)}</dd></div>
            <div><dt>{shortDate(active?.date)}</dt><dd>{format(average, 3)}</dd></div>
            <div><dt>Parsel ortalaması farkı</dt><dd>{format(signal, 3)}</dd></div></dl>
          <p>Görüntü farkı yalnızca eşleşen kalite maskesi, yöntem ve ızgara hücrelerinden hesaplanır.</p>
          <button className="field-studio-link" onClick={() => setMode("change")}>Farkı araziye uygula <ArrowUpRight size={15} /></button>
        </>}
        {panel === "season" && <>
          <dl><div><dt>Ürün</dt><dd>{field.crop || "Veri yok"}</dd></div><div><dt>Alan</dt><dd>{area.format(field.area)}</dd></div>
            <div><dt>Ekim</dt><dd>{shortDate(field.sowingDate)}</dd></div></dl>
          <button className="field-studio-link" onClick={() => onNavigate("operations", field.id)}>Sezon ve saha <ArrowUpRight size={15} /></button>
          <button className="field-studio-link" onClick={() => onNavigate("scenarios", field.id)}>Sulama senaryoları <ArrowUpRight size={15} /></button>
        </>}
        {panel === "water" && <>
          {water.loading ? <p role="status">Model yükleniyor…</p> : water.error ? <p role="alert">{water.error}</p> :
            model ? <>
              <p>FAO-56 pilotu · Parsel geneli model çıktısı · {shortDate(modelRun.createdAt)}</p>
              <dl>{model.scenarios.map(plan => <div key={plan.name}><dt>{plan.name}</dt>
                <dd>{format(plan.finalDepletionMm, 1)} mm açık · {plan.stressDays} stres günü</dd></div>)}</dl>
            </> : <p>Bu parsel sınırına bağlı su dengesi çalışması yok.</p>}
          <button className="field-studio-link" onClick={() => onNavigate("scenarios", field.id)}>Eşzamanlı plan karşılaştırması <ArrowUpRight size={15} /></button>
        </>}
        {panel === "tasks" && <>
          {!fieldTasks.length && <p>Bu parsele bağlı görev kaydı yok.</p>}
          <ul>{fieldTasks.slice(0, 12).map(task => <li key={task.id}>
            <label><input type="checkbox" checked={!!task.done} disabled={!canWrite} onChange={() => onToggleTask(task)} />
              <span>{task.name}<small>{shortDate(task.date)}</small></span></label>
          </li>)}</ul>
          {canWrite && <button className="field-studio-link" onClick={() => onCreateTask("", field.id)}>Görev oluştur <Plus size={16} /></button>}
        </>}
        {panel === "zones" && <>
          {!zonePlan && <p>Güncel parsel sınırına bağlı yönetim bölgesi yok.</p>}
          {zonePlan && <><p>{zonePlan.name} · Taslak v{zonePlan.version}</p><dl>{zones.map((zone, index) =>
            <div key={index}><dt>{zone.name}</dt><dd>{format(zone.rate)} {zonePlan.payload.unit}</dd></div>)}</dl></>}
          {canWrite && <button className="field-studio-link" onClick={() => setEditor(zonePlan || {})}>{zonePlan ? "Reçete taslağını düzenle" : "Reçete taslağı oluştur"} <ArrowUpRight size={15} /></button>}
          <button className="field-studio-link" onClick={() => onNavigate("prescriptions", field.id)}>Reçete planlarına git <ArrowUpRight size={15} /></button>
        </>}
        {panel === "observations" && <>
          {point?.marker && <p>{point.marker.notes}</p>}
          {!markers.length && <p>Konumu kayıtlı saha gözlemi yok.</p>}
          {markers.slice(0, 12).map(marker => <button key={marker.id} className="field-studio-link"
            onClick={() => { setPoint({ coordinate: marker.coordinate, marker }); setCommand({ type: "focus", coordinate: marker.coordinate }); }}>
            {marker.name} · {shortDate(marker.date)} <Crosshair size={15} />
          </button>)}
          <button className="field-studio-link" onClick={() => onNavigate("temporal", field.id)}>Arazi hafızasına git <ArrowUpRight size={15} /></button>
        </>}
      </aside>}
    </div>
    {editor && <Suspense fallback={<p role="status">Reçete düzenleyicisi açılıyor…</p>}><DraftEditor kind="prescription" field={field} record={editor}
      latestAnalysis={bundle.value?.context.latestAnalysis} onClose={() => setEditor(null)}
      onSaved={() => { setEditor(null); bundle.refresh(); }} /></Suspense>}
  </>;
}

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../../api";
import { nasaProducts } from "../../../shared/nasa-products";
import { defaultBasemap } from "../fields/basemaps";
import "./nasa-observations.css";

const today = () => new Date().toISOString().slice(0,10);
const tileRoot = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";
function ObservationMap({ field, product, date, previous, footprints }) {
  const container = useRef(null), map = useRef(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    const view = L.map(container.current, { scrollWheelZoom: false, maxZoom: 17 });
    const boundary = L.geoJSON(field.geometry, { style: { color: "#eff8aa", weight: 2, fillOpacity: 0 } }).addTo(view);
    view.fitBounds(boundary.getBounds(), { maxZoom: product.zoom ? product.zoom + 2 : 11, padding: [24,24] });
    view.createPane("nasa-layer").style.zIndex = "250";
    L.tileLayer(defaultBasemap.url, defaultBasemap.options).addTo(view);
    map.current = view;
    return () => { view.remove(); map.current = null; };
  }, [field.geometry, product.zoom]);
  useEffect(() => {
    const view = map.current;
    if (!view || !date || !product.layer) return;
    setTileError(false);
    const layer = L.tileLayer(tileRoot + product.layer + "/default/" + date +
      "/GoogleMapsCompatible_Level" + product.zoom + "/{z}/{y}/{x}.png", {
      maxNativeZoom: product.zoom, maxZoom: 17, opacity: .72, pane: "nasa-layer", attribution: "NASA EOSDIS GIBS",
    }).addTo(view);
    layer.on("tileerror", () => setTileError(true));
    return () => layer.remove();
  }, [product, date, field.geometry]);
  useEffect(() => {
    if (!map.current || !footprints?.length) return;
    const layer = L.geoJSON(footprints, { style: { color: "#86d7f1", fillOpacity: .09, weight: 2, dashArray: "6 5" } }).addTo(map.current);
    return () => layer.remove();
  }, [footprints, field.geometry, product.zoom]);
  return <div>
    <div ref={container} className="nasa-map" aria-label="NASA katmanı ve parsel sınırı"/>
    {tileError && <p role="status">Bazı NASA döşemeleri alınamadı. Başka bir tarih seçebilirsin.</p>}
    {previous && <small>Önceki ve güncel tarih arasında geçiş, aynı harita ölçeğinde görsel inceleme sağlar.</small>}
  </div>;
}

export default function NasaObservations({ field, initialSource }) {
  const [source, setSource] = useState(initialSource ?? "smap");
  const [dates, setDates] = useState(null);
  const [pinned, setPinned] = useState("");
  const [previous, setPrevious] = useState("");
  const [compare, setCompare] = useState(false);
  const [end, setEnd] = useState(today);
  const [scenes, setScenes] = useState(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const product = nasaProducts[source];
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        if (product.mode === "map") {
          const payload = await api("platform/nasa/layers", undefined, "GET", { signal: controller.signal });
          if (!controller.signal.aborted) setDates(payload);
        } else if (field.geometry && end) {
          const query = new URLSearchParams({ source, end });
          const payload = await api(`platform/fields/${field.id}/nasa-scenes?${query}`, undefined, "GET", { signal: controller.signal });
          if (!controller.signal.aborted) setScenes(payload);
        }
        if (!controller.signal.aborted) setError("");
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      }
    }
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30 * 60000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [field.id, field.geometry, product, source, end, reload]);
  const scene = scenes?.scenes.find(item => item.id === selected) ?? scenes?.scenes[0];
  const activeDate = compare && previous ? previous : pinned || dates?.latest[source];
  const panel = useRef(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: "start" });
  }, []);
  return <section ref={panel} tabIndex={-1} className="px-surface px-section nasa-observations" aria-labelledby="nasa-observations-title">
    <header><span className="px-kicker">NASA EARTHDATA</span><h2 id="nasa-observations-title">Ek uydu gözlemleri</h2>
      <p>Kaynağı seç ve parselinin çevresini incele. Bu ürünler mevcut parsel analizlerini destekleyen ayrı gözlemlerdir.</p></header>
    <div className="nasa-toolbar">
      <label>NASA ürünü<select value={source} onChange={event => {
        setSource(event.target.value); setPinned(""); setPrevious(""); setCompare(false); setScenes(null); setSelected(""); setError("");
      }}>{Object.entries(nasaProducts).map(([key,item]) => <option key={key} value={key}>{item.title}</option>)}</select></label>
      {product.mode === "map" ? <>
        <label>Görsel tarihi<input type="date" max={dates?.latest[source] || today()} value={pinned || dates?.latest[source] || ""} onChange={event => {setPinned(event.target.value);setCompare(false);}}/></label>
        <label>Karşılaştırma tarihi<input type="date" max={dates?.latest[source] || today()} value={previous} onChange={event => setPrevious(event.target.value)}/></label>
        <button type="button" className="secondary" disabled={!previous} onClick={() => setCompare(value => !value)}>{compare ? "Ana tarihi göster" : "Karşılaştırma tarihini göster"}</button>
        {pinned && <button type="button" className="secondary" onClick={() => {setPinned("");setCompare(false);}}>En yeni tarihe dön</button>}
      </> : <label>60 günlük aramanın bitişi<input type="date" required min="2018-01-01" max={today()} value={end} onChange={event => {setEnd(event.target.value);setScenes(null);setSelected("");}}/></label>}
      <button type="button" className="secondary" onClick={() => setReload(value => value + 1)}>Yenile</button>
    </div>
    <p className="nasa-resolution"><strong>{product.resolution}</strong> · {product.note}</p>
    {error && <p role="alert">{error}</p>}
    {product.mode === "map" ? <>
      <p className="nasa-limit">Bölgesel görsel katman. Renklerden parsel ölçümü hesaplanmaz.</p>
      {!!field.geometry && !!activeDate && <ObservationMap key={source} field={field} product={product} date={activeDate} previous={previous}/>}
      {!activeDate && !error && <p role="status">NASA katman tarihi alınıyor…</p>}
      {activeDate && <p>Görüntü tarihi {activeDate} · <a href={`https://worldview.earthdata.nasa.gov/?l=${product.layer}&t=${activeDate}`} target="_blank" rel="noreferrer">NASA Worldview’de aç</a></p>}
    </> : <>
      {!error && !scenes && field.geometry && end && <p role="status">NASA kataloğu sorgulanıyor…</p>}
      {scenes && !scene && <p role="status">Bu parseli kapsayan katalog kaydı bulunamadı.</p>}
      {scene && <div className="nasa-scene">
        <label>Sahne<select value={scene.id} onChange={event => setSelected(event.target.value)}>
          {scenes.scenes.map(item => <option key={item.id} value={item.id}>{item.time} · {item.name}</option>)}
        </select></label>
        {scene.footprints?.length > 0 && <ObservationMap field={field} product={product} footprints={scene.footprints}/>}
        <p>Katalog kapsamı, parselde geçerli piksel bulunduğunu doğrulamaz. Sayısal işleme bu ürün için etkin değil.</p>
        {scene.assets.find(item => item.browse) && <img alt="NASA katalog önizlemesi" loading="lazy" src={scene.assets.find(item => item.browse).url} onError={event => {event.currentTarget.hidden = true;}} key={scene.id}/>}
        <ul>{scene.assets.filter(item => !item.browse).map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.name}</a></li>)}</ul>
        <small>Ham dosya indirmek için ücretsiz NASA Earthdata hesabı ve ilgili veri merkezinin izni gerekebilir.</small>
      </div>}
    </>}
    {!field.geometry && <p>Harita ve konuma göre katalog araması için önce parsel sınırı kaydet.</p>}
    <small>Panel açıkken kaynak kataloğu 30 dakikada bir yeniden kontrol edilir.</small>
  </section>;
}

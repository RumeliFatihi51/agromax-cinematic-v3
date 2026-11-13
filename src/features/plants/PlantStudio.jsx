import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Camera, CircleAlert,
  Droplets, ExternalLink, FlaskConical, Leaf, LoaderCircle, Pause, Play,
  ScanLine, Search, Shovel, Sprout, X,
} from "lucide-react";
import { api } from "../../api";
import { findPlant, groups, healthIndex, plants, references, searchKey } from "./catalog";
import "./plants.css";

const media = "/visuals/films/tarim2/";
const endpoint = "v1/plants/inspect";
const health = Object.values(healthIndex);
const confidence = { strong: "Güçlü görsel eşleşme", possible: "Olası eşleşme", weak: "Zayıf eşleşme" };
const causeLabels = { disease: "Hastalık", pest: "Zararlı", environment: "Çevre", nutrition: "Beslenme", unknown: "Belirsiz" };
const defaultScan = { available: false, reason: "Fotoğraf incelemesi bu çalışma alanında etkin değil." };

async function preparePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPEG, PNG veya WebP biçiminde bir fotoğraf seç.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Fotoğraf 12 MB’tan küçük olmalı.");
  const image = await createImageBitmap(file);
  try {
    if (image.width < 96 || image.height < 96)
      throw new Error("Fotoğraf çok küçük. Belirtileri gösteren daha net bir çekim seç.");
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Tarayıcı fotoğrafı hazırlayamadı.");
    for (const [size, quality] of [[1, .8], [1, .65], [.8, .7], [.65, .65], [.5, .6]]) {
      canvas.width = Math.round(image.width * scale * size);
      canvas.height = Math.round(image.height * scale * size);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const preview = canvas.toDataURL("image/jpeg", quality);
      const imageData = preview.split(",")[1];
      if (imageData && imageData.length <= 240_000) return { preview, imageData };
    }
    throw new Error("Fotoğraf gönderime hazırlanamadı. Daha küçük bir fotoğraf seç.");
  } finally {
    image.close();
  }
}

function PlantFilm() {
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef(null);
  async function toggleFilm() {
    if (playing) {
      video.current?.pause();
      return;
    }
    setFailed(false);
    const small = window.matchMedia("(max-width: 650px)").matches;
    if (failed || !video.current.getAttribute("src")) video.current.src = media + (small ? "leaf-mobile.mp4" : "leaf.mp4");
    try { await video.current.play(); } catch { setPlaying(false); setFailed(true); }
  }
  return <div className="plant-film">
    <picture>
      <source media="(max-width: 650px)" srcSet={media + "leaf-mobile.webp"} />
      <img src={media + "leaf.webp"} alt="" fetchPriority="high" />
    </picture>
    <video ref={video} muted loop playsInline preload="none" aria-hidden="true"
      className={started ? "is-visible" : ""}
      onPlaying={() => { setPlaying(true); setStarted(true); }}
      onPause={() => setPlaying(false)}
      onError={() => { setPlaying(false); setStarted(false); setFailed(true); }} />
    <button type="button" className="plant-film-toggle" onClick={toggleFilm}>
      {playing ? <Pause size={15} /> : <Play size={15} />}
      {playing ? "Videoyu duraklat" : failed ? "Videoyu tekrar dene" : "Videoyu oynat"}
    </button>
  </div>;
}

function ScanResult({ result, onShowPlant }) {
  const match = result.status === "reviewed" && result.plant?.confidence !== "weak" && result.plant && findPlant(result.plant);
  return <article className="plant-result" aria-label="Fotoğraf inceleme sonucu">
    <div className="plant-result-heading">
      <div>
        <p className="plant-kicker">Filiz · Fotoğraf incelemesi</p>
        <h3>{result.plant?.commonName || "Bitki tanımlanamadı"}</h3>
        {result.plant?.scientificName && <i>{result.plant.scientificName}</i>}
      </div>
      <span className="plant-confidence">{result.status === "unclear" ? "Daha net çekim gerekli" : confidence[result.plant?.confidence] || "Görsel değerlendirme"}</span>
    </div>
    <p>{result.summary}</p>
    {result.plant?.evidence && <p className="plant-note">{result.plant.evidence}</p>}
    {match && <button type="button" className="plant-inline" onClick={() => onShowPlant(match)}>Katalogdaki {match.name} kaydını aç <ArrowRight size={16} /></button>}
    {!!result.observations.length && <section className="plant-result-block">
      <h4>Fotoğrafta görülenler</h4>
      <ul>{result.observations.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </section>}
    {!!result.causes.length && <section className="plant-result-block">
      <h4>Belirtiyi ne açıklayabilir?</h4>
      <div className="plant-cause-grid">{result.causes.map((cause, index) => <section key={index}>
        <small>{causeLabels[cause.type]}</small>
        <h5>{cause.name}</h5>
        <p>{cause.evidence}</p>
        <p><strong>Sahada kontrol</strong> {cause.check}</p>
      </section>)}</div>
    </section>}
    {result.care && <section className="plant-result-block">
      <h4>Tür için genel yetiştirme bilgileri</h4>
      <dl className="plant-facts">
        <div><dt>Özellikler</dt><dd>{result.care.traits}</dd></div>
        <div><dt>Sulama</dt><dd>{result.care.irrigation}</dd></div>
        <div><dt>Besleme</dt><dd>{result.care.nutrition}</dd></div>
        <div><dt>Toprak</dt><dd>{result.care.soil}</dd></div>
      </dl>
    </section>}
    {!!result.nextPhotos.length && <section className="plant-result-block">
      <h4>Sonraki çekim için</h4>
      <ul>{result.nextPhotos.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </section>}
    <p className="plant-note">Fotoğrafa dayalı ön değerlendirme · Saha ve gerektiğinde laboratuvar kontrolüyle doğrula.</p>
  </article>;
}

function PhotoScan({ connected, onShowPlant }) {
  const [provider, setProvider] = useState(connected ? null : defaultScan);
  const [providerRetry, setProviderRetry] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState(null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const camera = useRef(null);
  const operation = useRef(null);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    api(endpoint, undefined, "GET", { signal: controller.signal }).then(setProvider).catch(() => {
      if (!controller.signal.aborted) setProvider({ available: false, retry: true, reason: "Filiz bağlantısının durumu alınamadı." });
    });
    return () => controller.abort();
  }, [connected, providerRetry]);
  useEffect(() => () => operation.current?.abort(), []);

  async function inspect(prepared) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setState("scanning");
    setError("");
    try {
      const response = await api(endpoint, { image: prepared.imageData }, "POST", { signal: controller.signal });
      if (!controller.signal.aborted) { setResult(response); setState("done"); }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err.message);
        setState("error");
      }
    }
  }

  async function select(file) {
    if (!file) return;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setPhoto(null);
    setResult(null);
    setError("");
    setState("preparing");
    try {
      const prepared = await preparePhoto(file);
      if (controller.signal.aborted) return;
      setPhoto(prepared);
      setState("idle");
      if (provider?.available) void inspect(prepared);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof DOMException ? "Fotoğraf açılamadı. Farklı bir JPEG, PNG veya WebP seç." : err.message);
        setState("error");
      }
    }
  }

  function clear() {
    operation.current?.abort();
    setPhoto(null);
    setResult(null);
    setError("");
    setState("idle");
  }

  const busy = state === "preparing" || state === "scanning";
  const onFile = (event) => {
    void select(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  };

  return <section className="plant-scan" id="bitki-inceleme" aria-labelledby="plant-scan-title">
    <div className="plant-scan-intro">
      <p className="plant-kicker"><ScanLine size={16} /> Fotoğrafla incele</p>
      <h2 id="plant-scan-title" tabIndex={-1}>Bu bitki ne? <br />Bu leke ne anlatıyor?</h2>
      <p>Bitkinin tamamını veya belirtiyi net çeken bir fotoğraf yükle. Filiz görünen işaretleri ve sahada nasıl kontrol edebileceğini açıklasın.</p>
      <p className="plant-service" role="status" data-ready={provider?.available || undefined}>
        <span />{provider?.available ? "Fotoğraf incelemesi açık" : provider?.reason || "Model bağlantısı kontrol ediliyor"}
      </p>
      {provider?.retry && <button type="button" className="plant-inline" onClick={() => { setProvider(null); setProviderRetry(value => value + 1); }}>Bağlantıyı tekrar kontrol et <ArrowRight size={16} /></button>}
    </div>
    <div className={`plant-upload ${dragging ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); void select(event.dataTransfer.files[0]); }}
      aria-busy={busy}>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} aria-label="Bitki fotoğrafı dosyası" />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFile} aria-label="Kameradan bitki fotoğrafı" />
      {photo ? <div className="plant-preview"><img src={photo.preview} alt="Seçtiğin bitki fotoğrafı" />
        <button type="button" onClick={clear} aria-label="Fotoğrafı kaldır"><X size={18} /></button>
      </div> : <div className="plant-upload-icon"><Camera size={26} strokeWidth={1.5} /></div>}
      <div className="plant-upload-actions">
        <button type="button" className="plant-primary" onClick={() => input.current?.click()}><Camera size={17} />{photo ? "Başka fotoğraf seç" : "Fotoğraf seç"}</button>
        <button type="button" className="plant-secondary plant-camera" onClick={() => camera.current?.click()}>Kamerayı aç</button>
        {photo && provider?.available && state === "idle" && <button type="button" className="plant-secondary" onClick={() => void inspect(photo)}>Fotoğrafı incele</button>}
        {photo && provider?.available && state === "error" && <button type="button" className="plant-secondary" onClick={() => void inspect(photo)}>Tekrar incele</button>}
      </div>
      {busy && <p role="status"><LoaderCircle size={16} className="plant-spinner" /> {state === "scanning" ? "Filiz fotoğrafı inceliyor…" : "Fotoğraf hazırlanıyor…"}</p>}
      {error && <p className="plant-error" role="alert"><CircleAlert size={16} />{error}</p>}
      {!busy && !error && <small>{photo ? (provider?.available ? "İnceleme için fotoğraf Filiz’in model sağlayıcısına gönderilir." : "Fotoğraf önizlemesi cihazında açık.") : "JPEG, PNG, WebP · En çok 12 MB"}</small>}
      {provider?.available && !photo && <small>Seçtiğin fotoğraf inceleme için Filiz’in model sağlayıcısına gönderilir.</small>}
    </div>
    {result && <ScanResult result={result} onShowPlant={onShowPlant} />}
  </section>;
}

function PlantProfile({ plant }) {
  return <article className="plant-profile" aria-labelledby="plant-profile-heading">
    <header>
      <p className="plant-kicker">{groups[plant.group].name}</p>
      <h3 id="plant-profile-heading" tabIndex={-1}>{plant.name}</h3>
      <i>{plant.scientific}</i>
    </header>
    <p>{plant.traits}</p>
    <dl className="plant-facts">
      <div><dt><Droplets size={17} /> Sulama</dt><dd>{plant.water}</dd></div>
      <div><dt><FlaskConical size={17} /> Besleme · grup rehberi</dt><dd>{groups[plant.group].nutrition}</dd></div>
      <div><dt><Shovel size={17} /> Toprak · grup rehberi</dt><dd>{groups[plant.group].soil}</dd></div>
    </dl>
    <h4>İzlenecek hastalık ve belirtiler</h4>
    {plant.conditions.length ? <div className="plant-condition-list">{plant.conditions.map(condition => <details key={condition.id}>
      <summary>{condition.name}</summary><p>{condition.signs}</p><p className="plant-note">{condition.check}</p>
    </details>)}</div> : <p className="plant-note">Bu profil için hastalık kaydı henüz eklenmedi.</p>}
    <div className="plant-sources">
      <a href={references.water} target="_blank" rel="noreferrer">FAO · Bitki su ihtiyacı <ExternalLink size={13} /></a>
      <a href={references.health} target="_blank" rel="noreferrer">TAGEM · Bitki sağlığı <ExternalLink size={13} /></a>
    </div>
  </article>;
}

function GlobalTaxonomy({ query }) {
  const [state, setState] = useState({ rows: null, error: false, loading: false });
  const operation = useRef(null);
  useEffect(() => () => operation.current?.abort(), []);
  async function search() {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setState({ rows: null, error: false, loading: true });
    const url = new URL("https://api.gbif.org/v1/species/search");
    url.search = new URLSearchParams({
      q: query.trim(), rank: "SPECIES", kingdomKey: "6", status: "ACCEPTED",
      datasetKey: "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c", limit: "12",
    });
    try {
      const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]), credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error("GBIF");
      const { results } = await response.json();
      if (!controller.signal.aborted) setState({ rows: results.filter(row => row.kingdom === "Plantae" && Number.isSafeInteger(row.key) && row.canonicalName), error: false, loading: false });
    } catch {
      if (!controller.signal.aborted) setState({ rows: null, error: true, loading: false });
    }
  }
  return <section className="plant-global" aria-label="Dünya bitki arşivi">
    <div>
      <h3>Dünya bitki arşivi</h3>
      <p>GBIF’te taksonomi ara. Bilimsel adla arama daha iyi sonuç verir.</p>
    </div>
    {query.trim().length >= 2
      ? <button type="button" className="plant-secondary" onClick={search} disabled={state.loading}><Search size={16} /> {state.loading ? "Aranıyor…" : "GBIF’te ara"}</button>
      : <a href={references.taxonomy} target="_blank" rel="noreferrer">GBIF’i aç <ExternalLink size={15} /></a>}
    {state.error && <p className="plant-error" role="alert">GBIF’e şu anda ulaşılamıyor. Tekrar deneyebilirsin.</p>}
    {state.rows && <div className="plant-global-results" aria-live="polite">
      {state.rows.length ? state.rows.map(row => <a key={row.key} href={`https://www.gbif.org/species/${row.key}`} target="_blank" rel="noreferrer"><i>{row.canonicalName}</i><span>{row.family}</span><ArrowUpRight size={16} /></a>) : <p>Bu adla eşleşen bitki türü bulunamadı.</p>}
    </div>}
  </section>;
}

function PlantLibrary({ selection, setSelection }) {
  const { tab, group, query, active } = selection;
  const normalized = searchKey(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const matches = (value) => {
    const key = searchKey(value);
    return tokens.every(token => key.includes(token));
  };
  const rows = plants.filter(plant => (group === "all" || group === plant.group) &&
    matches([plant.name, plant.scientific, plant.aliases, ...plant.conditions.map(condition => condition.name)].join(" ")));
  const signs = health.filter(condition => matches(`${condition.name} ${condition.signs}`));
  const selected = rows.find(plant => plant.id === active) || rows[0];
  const heading = useRef(null);
  const select = (changes) => setSelection(previous => ({ ...previous, ...changes }));

  function openPlant(plant) {
    select({ active: plant.id });
    if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => {
      const title = heading.current?.querySelector("h3");
      title?.focus({ preventScroll: true });
      title?.scrollIntoView({ block: "start" });
    });
  }
  return <section className="plant-library" id="bitki-katalogu" aria-labelledby="plant-library-title">
    <header className="plant-library-header">
      <div><p className="plant-kicker"><BookOpen size={16} /> Tür ve belirti dizini</p><h2 id="plant-library-title">Bitki kataloğu</h2></div>
      <div className="plant-library-count"><strong>{plants.length}</strong> bitki profili <span /> <strong>{health.length}</strong> sağlık başlığı</div>
    </header>
    <div className="plant-library-tools">
      <div className="plant-tabs" aria-label="Katalog görünümleri">
        <button type="button" aria-pressed={tab === "species"} onClick={() => select({ tab: "species" })}>Bitkiler</button>
        <button type="button" aria-pressed={tab === "health"} onClick={() => select({ tab: "health" })}>Hastalık ve belirtiler</button>
      </div>
      <label className="plant-search"><Search size={17} /><input type="search" aria-label="Katalogda ara" placeholder={tab === "species" ? "Bitki adı, bilimsel ad veya belirti ara" : "Hastalık adı veya belirti ara"} value={query} maxLength={100} onChange={event => select({ query: event.target.value })} /></label>
    </div>
    {tab === "species" ? <>
      <div className="plant-filters" aria-label="Bitki grubu">
        {[["all", "Tümü"], ...Object.entries(groups).map(([id, item]) => [id, item.name])].map(([id, name]) =>
          <button key={id} type="button" aria-pressed={id === group} onClick={() => select({ group: id })}>{name}</button>)}
      </div>
      {selected ? <div className="plant-library-body">
        <div className="plant-index" aria-label="Bitki profilleri">
          <p className="plant-kicker">{rows.length} profil</p>
          <ul>{rows.map(plant => <li key={plant.id}><button type="button" aria-pressed={plant.id === selected.id} onClick={() => openPlant(plant)}>
            <span><strong>{plant.name}</strong><i>{plant.scientific}</i></span><ArrowRight size={17} />
          </button></li>)}</ul>
        </div>
        <div ref={heading}><PlantProfile plant={selected} /></div>
      </div> : <p className="plant-empty" role="status">Bu aramayla eşleşen yerel bitki profili bulunamadı.</p>}
      <GlobalTaxonomy key={query} query={query} />
    </> : <div className="plant-health">
      {signs.length ? signs.map(condition => {
        const hosts = plants.filter(plant => plant.conditions.includes(condition));
        return <details key={condition.id}>
          <summary>{condition.name}</summary>
          <p>{condition.signs}</p><p className="plant-note">{condition.check}</p>
          {!!hosts.length && <div className="plant-hosts">{hosts.map(plant => <button type="button" key={plant.id} onClick={() => select({ tab: "species", group: plant.group, query: "", active: plant.id })}>{plant.name} <ArrowUpRight size={14} /></button>)}</div>}
        </details>;
      }) : <p className="plant-empty" role="status">Bu aramayla eşleşen sağlık başlığı bulunamadı.</p>}
      <div className="plant-sources"><a href={references.health} target="_blank" rel="noreferrer">TAGEM · Zirai mücadele teknik talimatları <ExternalLink size={13} /></a></div>
    </div>}
  </section>;
}

export default function PlantStudio({ connected }) {
  const [selection, setSelection] = useState({ tab: "species", query: "", group: "all", active: "wheat" });
  function showPlant(plant) {
    setSelection({ tab: "species", query: "", group: plant.group, active: plant.id });
    document.getElementById("bitki-katalogu")?.scrollIntoView({ block: "start" });
  }
  return <div className="plant-studio">
    <header className="plant-hero">
      <PlantFilm />
      <div className="plant-hero-copy">
        <p className="plant-kicker"><Sprout size={17} /> AgroMax · Bitki sağlığı</p>
        <h1>Bitki<br />Tanıma<span>.</span></h1>
        <p>Tarladaki bitkiyi tanı. Yaprağındaki belirtiyi incele. Türüne göre bakım ve saha kontrollerini bul.</p>
        <button type="button" className="plant-hero-link" onClick={() => {
          const title = document.getElementById("plant-scan-title");
          title?.focus({ preventScroll: true });
          title?.scrollIntoView({ block: "start" });
        }}>Fotoğrafla başla <ArrowDown size={18} /></button>
      </div>
    </header>
    <PhotoScan connected={connected} onShowPlant={showPlant} />
    <PlantLibrary selection={selection} setSelection={setSelection} />
    <footer className="plant-foot"><Leaf size={16} /> Tür profilleri genel yetiştirme bilgisi verir. Parsel için karar verirken yerel koşulları ve toprak analizini kullan.</footer>
  </div>;
}

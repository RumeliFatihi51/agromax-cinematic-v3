import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { api, apiBinary } from "../../api";
import { project } from "../../../shared/spatial";

const wait = (signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1250);
  const abort = () => { clearTimeout(timer); reject(signal.reason); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
});
const format = value => value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const readHeight = (bitmap, metadata, frame) => {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const [west, south, east, north] = metadata.bounds;
  const { width, height } = canvas;
  const distance = new Uint16Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const i = row * width + column;
      if (data[i * 4 + 3]) distance[i] = 1 + Math.min(column ? distance[i - 1] : 0, row ? distance[i - width] : 0);
    }
  }
  for (let row = height - 1; row >= 0; row--) {
    for (let column = width - 1; column >= 0; column--) {
      const i = row * width + column;
      distance[i] = Math.min(distance[i], 1 + Math.min(column < width - 1 ? distance[i + 1] : 0,
        row < height - 1 ? distance[i + width] : 0));
    }
  }
  const pixel = (x, z) => {
    const [px, py] = project(frame.coordinate(x, z));
    return [(px - west) / (east - west) * width - 0.5, (north - py) / (north - south) * height - 0.5];
  };
  const heightAt = (column, row) => {
    if (column < 0 || row < 0 || column >= width || row >= height) return null;
    const i = (row * width + column) * 4;
    return data[i + 3] ? (data[i] * 65536 + data[i + 1] * 256 + data[i + 2]) / 100 - metadata.offsetM : null;
  };
  const sample = (x, z) => {
    const [column, row] = pixel(x, z);
    const nearest = heightAt(Math.round(column), Math.round(row));
    if (!Number.isFinite(nearest)) return null;
    const left = Math.floor(column), top = Math.floor(row);
    const a = heightAt(left, top), b = heightAt(left + 1, top);
    const c = heightAt(left, top + 1), d = heightAt(left + 1, top + 1);
    if (![a, b, c, d].every(Number.isFinite)) return nearest;
    const tx = column - left, tz = row - top;
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
  const edgeDistance = (x, z) => {
    const [px, py] = pixel(x, z);
    const column = Math.round(px), row = Math.round(py);
    if (column < 0 || row < 0 || column >= width || row >= height) return 0;
    const metresPerPixel = frame.ground * Math.min((east - west) / width, (north - south) / height);
    return Math.max(0, distance[row * width + column] - 1) * metresPerPixel;
  };
  const center = sample(0, 0);
  let reference = center;
  if (!Number.isFinite(reference)) {
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      reference = (data[i] * 65536 + data[i + 1] * 256 + data[i + 2]) / 100 - metadata.offsetM;
      break;
    }
  }
  return { sample, edgeDistance, reference, resolution: metadata.displayResolutionM, sources: [], drone: true };
};

export function useDroneTerrain(fieldId, geometryVersion, frame, enabled, active, defaultToDrone = true) {
  const path = "v1/fields/" + fieldId + "/terrain-datasets";
  const [catalog, setCatalog] = useState(null);
  const [selection, setSelection] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const upload = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const catalogKey = enabled ? path + ":" + geometryVersion : "";

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api(path, undefined, "GET", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setCatalog({ ...data, catalogKey }); })
      .catch(err => {
        if (!controller.signal.aborted) setCatalog({ catalogKey, available: false, datasets: [], error: err.message });
      });
    return () => { controller.abort(); upload.current?.abort(); };
  }, [path, enabled, catalogKey, attempt]);
  const currentCatalog = catalogKey && catalog?.catalogKey === catalogKey ? catalog : null;
  const ready = (currentCatalog?.datasets || []).filter(dataset => dataset.state === "ready");
  const selectedId = selection?.fieldId === fieldId ? selection.value : null;
  const selected = selectedId === "satellite" ? null : ready.find(item => item.id === selectedId) || (defaultToDrone ? ready[0] : null);
  const datasetId = enabled && active ? selected?.id : null;
  const layers = selected?.layers;
  useEffect(() => {
    if (!datasetId || !layers?.ortho) return;
    const controller = new AbortController();
    const { signal } = controller;
    let bitmap;
    const load = name => apiBinary(path + "/" + datasetId + "/layers/" + name, { signal })
      .then(blob => createImageBitmap(blob, { colorSpaceConversion: name === "dtm" ? "none" : "default" }));
    load("ortho").then(async image => {
      bitmap = image;
      if (signal.aborted) { bitmap.close(); return; }
      setLoaded({ datasetId, ortho: { bitmap, bounds: layers.ortho.bounds } });
      if (!layers.dtm) return;
      const elevation = await load("dtm");
      try {
        if (!signal.aborted) setLoaded({ datasetId, ortho: { bitmap, bounds: layers.ortho.bounds },
          dtm: readHeight(elevation, layers.dtm, frame) });
      } finally { elevation.close(); }
    }).catch(err => {
      if (!signal.aborted) setError(err.message);
    });
    return () => {
      controller.abort();
      setLoaded(previous => previous?.datasetId === datasetId ? null : previous);
      bitmap?.close();
    };
  }, [datasetId, frame, layers, path]);

  function saveDataset(dataset) {
    setCatalog(previous => ({ ...previous, catalogKey, datasets: [dataset, ...(previous?.catalogKey === catalogKey
      ? previous.datasets || [] : []).filter(item => item.id !== dataset.id)] }));
  }

  async function finish(id, signal) {
    const statusPath = path + "/" + id;
    let { dataset } = await api(statusPath + "/finish", {}, "POST", { signal });
    while (dataset.state === "processing") {
      setProgress("Konum ve raster kapsamı doğrulanıyor…");
      await wait(signal);
      ({ dataset } = await api(statusPath, undefined, "GET", { signal }));
      if (dataset.canRetry) throw new Error("İşleme kesintiye uğradı. Veri setini listeden yeniden işleyin.");
    }
    saveDataset(dataset);
    if (dataset.state === "ready") setSelection({ fieldId, value: dataset.id });
    else if (dataset.state === "failed") throw new Error(dataset.error);
    else throw new Error("Dosyalar eksik. Yüklemeyi yeniden başlatın.");
  }

  async function run(work) {
    upload.current?.abort();
    const controller = new AbortController();
    upload.current = controller;
    setProgress("Dosyalar hazırlanıyor…");
    setError("");
    try { await work(controller.signal); }
    catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setProgress(null); }
  }
  function submit(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const files = { ortho: values.get("ortho"), dtm: values.get("dtm") };
    const describe = file => ({ name: file.name, bytes: file.size });
    if (Object.values(files).some(file => file.size > 50_000_000)) {
      setError("Her COG dosyası en fazla 50 MB olabilir.");
      return;
    }
    run(async signal => {
      const { dataset, uploads } = await api(path, {
        geometryVersion, capturedOn: values.get("capturedOn"), source: values.get("source"),
        ortho: describe(files.ortho), ...(files.dtm.size ? { dtm: describe(files.dtm) } : {}),
      }, "POST", { signal });
      saveDataset(dataset);
      for (const { layer, url } of uploads) {
        setProgress("Drone dosyaları yükleniyor…");
        try {
          if (url.startsWith("/api/")) {
            const file = files[layer];
            for (let start = 0; start < file.size; start += 48 * 1024) {
              const end = Math.min(file.size, start + 48 * 1024);
              const body = await file.slice(start, end).arrayBuffer();
              await apiBinary(url.slice(5), { signal, body, method: "PUT",
                headers: { "Content-Range": "bytes " + start + "-" + (end - 1) + "/" + file.size } });
            }
          } else {
            const response = await fetch(url, { method: "PUT", body: files[layer], signal, credentials: "omit" });
            if (!response.ok) throw new Error("Depolama yüklemeyi kabul etmedi.");
          }
        } catch (err) {
          throw new Error(files[layer].name + " · " + err.message);
        }
      }
      setProgress("Konum ve raster kapsamı doğrulanıyor…");
      await finish(dataset.id, signal);
    });
  }
  return { catalog: currentCatalog, ready, selected, choose: value => { setError(""); setSelection({ fieldId, value }); }, submit, progress, error,
    refresh: () => setAttempt(value => value + 1),
    retry: id => run(signal => finish(id, signal)),
    imagery: datasetId && loaded?.datasetId === datasetId ? loaded.ortho : null,
    dtm: datasetId && loaded?.datasetId === datasetId ? loaded.dtm : null };
}

export function useCombinedTerrain(dtm, dem, frame) {
  return useMemo(() => {
    if (!dtm) return dem;
    const offsets = [];
    if (dem) {
      for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) for (const z of [-0.3, -0.15, 0, 0.15, 0.3]) {
        const a = dtm.sample(x * frame.span, z * frame.span), b = dem.sample(x * frame.span, z * frame.span);
        if (Number.isFinite(a) && Number.isFinite(b)) offsets.push(a - b);
      }
    }
    const offset = offsets.sort((a, b) => a - b)[Math.floor(offsets.length / 2)] ?? dtm.reference - (dem?.reference ?? dtm.reference);
    const seamWidth = Math.max(8, Math.min(45, frame.span * 0.17));
    return { ...dtm, datumOffset: offset, sample: (x, z) => {
      const local = dtm.sample(x, z);
      const surrounding = dem?.sample(x, z);
      const backdrop = Number.isFinite(surrounding) ? surrounding + offset : dtm.reference;
      if (!Number.isFinite(local)) return backdrop;
      const t = Math.min(1, dtm.edgeDistance(x, z) / seamWidth);
      const weight = t * t * (3 - 2 * t);
      return backdrop + (local - backdrop) * weight;
    } };
  }, [dtm, dem, frame]);
}

export function DroneTerrainControls({ drone, editable }) {
  const { catalog, ready, selected, progress, error } = drone;
  return <details className="spatial-drone-details">
    <summary><Upload size={16} /> Drone ortomozaik ve arazi modeli
      {selected && <span>{selected.capturedOn}</span>}
    </summary>
    {!catalog && <p role="status">Drone katmanları denetleniyor…</p>}
    {catalog && !catalog.available && <p>{catalog.error || "Özel drone depolaması bu ortamda hazır değil."}
      <button type="button" className="secondary" onClick={drone.refresh}>Yeniden denetle</button></p>}
    {ready.length > 0 && <label>3D arazi görüntüsü
      <select value={selected?.id || "satellite"} onChange={event => drone.choose(event.target.value)}>
        <option value="satellite">Uydu görüntüsü</option>
        {ready.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.capturedOn} · {dataset.source}</option>)}
      </select>
    </label>}
    {selected && <p>{selected.source} · Yerel çözünürlük {format(selected.layers.ortho.nativeResolutionM)} m
      {" · "}%{format(selected.layers.ortho.coverage * 100)} parsel kapsamı.</p>}
    {catalog?.available && editable && <form onSubmit={drone.submit}>
      <div className="spatial-drone-form">
        <label>Çekim tarihi<input name="capturedOn" type="date" required /></label>
        <label>Görüntü kaynağı<input name="source" maxLength={160} required /></label>
        <label>RGB ortomozaik<input name="ortho" type="file" accept=".tif,.tiff" required /></label>
        <label>Arazi modeli (DTM, metre)<input name="dtm" type="file" accept=".tif,.tiff" /></label>
      </div>
      <p>WGS84 veya WGS84/UTM, dosya başına 50 MB. DTM için metre cinsinden arazi yüksekliği yükleyin.</p>
      <button type="submit" className="primary" disabled={!!progress}>Yükle ve doğrula</button>
    </form>}
    {progress && <p role="status">{progress}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {catalog?.datasets.filter(dataset => dataset.state !== "ready").slice(0, 4).map(dataset => (
      <p key={dataset.id} className="spatial-drone-job">{dataset.ortho.name} · {
        dataset.state === "failed" ? dataset.error : dataset.state === "uploading" ?
          "Yükleme tamamlanmadı" : "Doğrulama başlatıldı"}
        {editable && dataset.state === "processing" &&
          <button type="button" disabled={!!progress} className="secondary" onClick={() => drone.retry(dataset.id)}>Durumu kontrol et</button>}
      </p>
    ))}
  </details>;
}

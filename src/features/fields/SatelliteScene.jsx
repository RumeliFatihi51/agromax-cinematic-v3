import { useEffect, useState } from "react";
import { Layers3, Satellite } from "lucide-react";
import { fetchAnalysisImage } from "../../api";
import ParcelMap from "./ParcelMap";

export function sceneDatesFor(analysis) {
  return [...new Set((analysis?.scenes || [])
    .map((scene) => scene.properties?.datetime?.slice(0, 10))
    .filter(Boolean))].sort().reverse();
}

export function sceneDay(day) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(day));
}

export default function SatelliteScene({ field, analysis, archiveId, dates, day, onDay, layer, onLayer, layers, compact = true }) {
  const [request, setRequest] = useState(null);
  const [rendered, setRendered] = useState(null);
  const [retry, setRetry] = useState(0);
  const hasGeometry = Boolean(field.geometry);
  const analysisId = archiveId || analysis?.historyId;
  const sceneKey = JSON.stringify([field.id, analysisId, analysis?.fetchedAt]);
  const requestKey = JSON.stringify([sceneKey, day, layer, retry]);
  const image = rendered?.sceneKey === sceneKey && hasGeometry ? rendered.image : null;
  const state = request?.key === requestKey ? request : null;
  const busy = Boolean(day && hasGeometry && !state);

  useEffect(() => {
    if (!day || !hasGeometry) return;
    const controller = new AbortController();
    setRequest(null);
    fetchAnalysisImage(field.id, { date: day, layer, analysisId, signal: controller.signal })
      .then((nextImage) => {
        if (controller.signal.aborted) {
          URL.revokeObjectURL(nextImage.url);
          return;
        }
        setRendered({ sceneKey, image: nextImage });
        setRequest({ key: requestKey });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setRequest({ key: requestKey, error: error.message });
      });
    return () => controller.abort();
  }, [field.id, hasGeometry, analysisId, day, layer, requestKey, sceneKey]);

  useEffect(() => () => {
    if (rendered) URL.revokeObjectURL(rendered.image.url);
  }, [rendered]);

  const legend = image?.legend;
  const coverage = image?.totalPixels > 0 ? 100 * image.validPixels / image.totalPixels : null;

  return (
    <section className="satellite-scene" aria-label="Uydu gözlem haritası">
      <header className="satellite-scene-head">
        <span className="satellite-scene-icon"><Satellite size={19} aria-hidden="true" /></span>
        <div>
          <span className="eyebrow">UYDU GÖZLEMİ</span>
          <h2>Parselin uydu görünümü</h2>
        </div>
        <label><Layers3 size={16} aria-hidden="true" /><span className="sr-only">Uydu görüntü katmanı</span>
          <select aria-label="Uydu görüntü katmanı" value={layer} onChange={(event) => onLayer(event.target.value)}>
            {layers.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </header>
      {hasGeometry ? (
        <ParcelMap key={field.id} geometry={field.geometry} image={image}
          height="clamp(285px, 45vh, 480px)" animateImagery compact={compact} />
      ) : <div className="empty">Bu kayıtta haritada gösterilecek parsel sınırı yok.</div>}
      <div className="satellite-scene-meta" aria-live="polite">
        <div>
          <strong>{image ? `${image.layer} · ${sceneDay(image.date)}` : "Uydu altlığı · kayıtlı parsel sınırı"}</strong>
          <p>{image ? `${analysis.source || "Sentinel-2 L2A"}${coverage != null ? ` · %${coverage.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} geçerli piksel` : ""}` :
            dates.length ? "Katalogdaki çekimi seçin." : "Katalogda bu analiz için görüntü tarihi yok."}</p>
        </div>
        {legend && (
          <div className="satellite-scene-legend" title={legend.method}>
            {Array.isArray(legend.colors) && legend.colors.length > 1 && <span aria-hidden="true"
              style={{ backgroundImage: `linear-gradient(90deg,${legend.colors.join(",")})` }} />}
            <small>{legend.min.toLocaleString("tr-TR")} – {legend.max.toLocaleString("tr-TR")} {legend.unit}</small>
          </div>
        )}
        {busy && <small role="status">{layer} · {sceneDay(day)} görüntüsü alınıyor…</small>}
        {state?.error && <div className="satellite-scene-error">
          <p role="alert">{state.error}</p>
          <button className="text-button" onClick={() => setRetry((value) => value + 1)}>Katmanı yeniden dene</button>
        </div>}
      </div>
      {dates.length > 0 && <div className="satellite-scene-dates">
        <label><span>Çekim tarihi</span>
          <select value={day || ""} onChange={(event) => onDay(event.target.value)}>
            {dates.map((date) => <option value={date} key={date}>{sceneDay(date)}</option>)}
          </select>
        </label>
        <span>{dates.length} katalog tarihi</span>
      </div>}
    </section>
  );
}

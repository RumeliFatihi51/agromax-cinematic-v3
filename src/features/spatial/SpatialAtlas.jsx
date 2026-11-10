import { Suspense, useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { metricFrame } from "../../../shared/spatial";
import { ParcelScene, SpatialBoundary } from "./SpatialWorkbench";

export default function SpatialAtlas({ field, fields, onField, onNavigate }) {
  const frame = useMemo(() => field?.geometry ? metricFrame(field.geometry) : null, [field?.geometry]);
  const poster = <img src="/visuals/films/tarim2/relief.webp" alt="" decoding="async" />;
  return <section className="spatial-atlas" aria-label="Üç boyutlu arazi atlası">
    <div className="spatial-atlas-copy">
      <small className="spatial-eyebrow">AGROMAX / ARAZİ ATLASI</small>
      <h2>Tarlaya bir de bu açıdan bak.</h2>
      <p>{frame ? "Seçili parselin kayıtlı sınırı, etkileşimli düz referans yüzeyinde." :
        "Bir parsel sınırı kaydettiğinde atlas kendi arazini gösterecek."}</p>
      {!!fields.length && <label>Atlas parseli <select value={field?.id || ""} onChange={event => onField(event.target.value)}>
        {fields.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <div className="spatial-atlas-links">
        <button onClick={() => onNavigate("twin", field?.id)}>Dijital ikiz <ArrowUpRight size={15} /></button>
        <button onClick={() => onNavigate("satellite", field?.id)}>Uydu analizi <ArrowUpRight size={15} /></button>
        <button onClick={() => onNavigate("scenarios", field?.id)}>Senaryo laboratuvarı <ArrowUpRight size={15} /></button>
      </div>
    </div>
    <div className="spatial-atlas-visual">{frame ? <SpatialBoundary fallback={poster}>
      <Suspense fallback={poster}><ParcelScene key={field.id} {...{ frame, field }} compact fallback={poster} /></Suspense>
    </SpatialBoundary> : poster}</div>
  </section>;
}

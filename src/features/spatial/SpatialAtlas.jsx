import { Suspense, useMemo, useState } from "react";
import { ArrowUpRight, Compass } from "lucide-react";
import { metricFrame } from "../../../shared/spatial";
import ParcelMap from "../fields/ParcelMap";
import { GeospatialMap, SpatialBoundary, useMedia } from "./SpatialWorkbench";
import { defaultBasemap } from "../fields/basemaps";
import { useDroneTerrain } from "./DroneTerrain";
import { useDroneTerrainSource, useTerrainSample } from "./map-terrain";

export default function SpatialAtlas({ field, fields, commercial, onField, onNavigate }) {
  const frame = useMemo(() => field?.geometry ? metricFrame(field.geometry) : null, [field?.geometry]);
  const compact = useMedia("(max-width: 760px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [failed, setFailed] = useState("");
  const drone = useDroneTerrain(field?.id, field?.geometryVersion, frame, !!frame && commercial, !!frame);
  const dem = useTerrainSample(frame, !!drone.dtm);
  const terrainDefinition = useDroneTerrainSource(frame, drone.dtm, dem);
  const fallback = frame ? <ParcelMap geometry={field.geometry} height="100%" compact /> :
    <img src="/visuals/films/tarim2/relief.webp" alt="" decoding="async" />;
  return <section className="spatial-atlas spatial-atlas-continuous" aria-label="Üç boyutlu arazi atlası">
    <div className="spatial-atlas-visual">{frame && failed !== field.id ? <SpatialBoundary key={field.id} fallback={fallback}>
      <Suspense fallback={<p className="spatial-loading" role="status">Arazi yükleniyor…</p>}>
        <GeospatialMap key={field.id} {...{ field, frame, compact, reduced, terrainDefinition }} atlas neighbors={fields} droneImagery={drone.imagery}
          onParcel={onField} interaction={!compact} onError={() => setFailed(field.id)} />
      </Suspense>
    </SpatialBoundary> : fallback}</div>
    <div className="spatial-atlas-copy">
      <small className="spatial-eyebrow"><Compass size={15} /> AGROMAX / ARAZİ ATLASI</small>
      <h2>Tarlaya bir de bu açıdan bak.</h2>
      <p>{frame ? (drone.imagery ? "Drone ortomozaik" : defaultBasemap.label) + " · Çevresiyle birlikte kayıtlı parsel." :
        "Bir parsel sınırı kaydettiğinde atlas kendi arazini gösterecek."}</p>
      {!!fields.length && <label>Atlas parseli <select value={field?.id || ""} onChange={event => onField(event.target.value)}>
        {fields.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <div className="spatial-atlas-links">
        <button onClick={() => onNavigate("field-studio", field?.id)}>3D Saha Stüdyosu <ArrowUpRight size={15} /></button>
        <button onClick={() => onNavigate("twin", field?.id)}>Dijital ikiz <ArrowUpRight size={15} /></button>
        <button onClick={() => onNavigate("satellite", field?.id)}>Uydu analizi <ArrowUpRight size={15} /></button>
        <button onClick={() => onNavigate("scenarios", field?.id)}>Senaryo laboratuvarı <ArrowUpRight size={15} /></button>
      </div>
    </div>
  </section>;
}

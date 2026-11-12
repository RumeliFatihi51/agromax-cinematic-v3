import { Suspense, useEffect, useMemo, useState } from "react";
import { metricFrame } from "../../../shared/spatial";
import { ParcelScene, SpatialBoundary } from "./SpatialWorkbench";
import { useContextImagery } from "./imagery";
import { loadTerrain } from "./terrain";

const format = number => number.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export default function ScenarioRelief({ field, result }) {
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const [shown, setShown] = useState(false);
  const [date, setDate] = useState("");
  const [plan, setPlan] = useState("");
  const [dem, setDem] = useState(null);
  const imagery = useContextImagery(frame, shown, true);
  useEffect(() => {
    if (!shown || dem?.frame === frame) return;
    const controller = new AbortController();
    loadTerrain(frame, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]))
      .then(terrain => {
        if (!controller.signal.aborted) setDem({ frame, terrain });
      })
      .catch(() => {
        if (!controller.signal.aborted) setDem({ frame, terrain: null });
      });
    return () => controller.abort();
  }, [shown, frame, dem]);
  const days = result.scenarios[0]?.days || [];
  const activeDate = date || days.at(-1)?.date;
  const fallback = <p className="spatial-loading">3D açılamadı. Model değerleri tablodan okunabilir.</p>;
  if (result.scenarios.length < 2 || !days.length) return null;
  const activePlan = result.scenarios.find(row => row.name === plan) || result.scenarios[0];
  const activeDay = activePlan.days.find(day => day.date === activeDate);
  const ratio = result.capacityMm > 0 && activeDay ? Math.min(1, activeDay.depletionMm / result.capacityMm) : 0;
  const tone = activeDay ? "hsl(" + (199 + ratio * 30) + " 43% " + (72 - ratio * 40) + "%)" : undefined;
  const terrain = dem?.frame === frame && Number.isFinite(dem.terrain?.reference) ? dem.terrain : null;

  return <section className="spatial-scenario" aria-label="Su dengesi senaryolarının 3D karşılaştırması">
    <small className="spatial-eyebrow">FAO-56 / MODEL ÇIKTISI</small>
    <h3>Aynı parsel, iki sulama planı.</h3>
    <p>Renk, seçilen gündeki kök bölgesi su açığını tüm parsel için kodlar. Model parsel içi dağılımı, bitki görünümünü veya verimi hesaplamaz.</p>
    <button className="secondary" aria-expanded={shown} type="button" onClick={() => setShown(value => !value)}>
      {shown ? "3D karşılaştırmayı kapat" : "3D karşılaştırmayı aç"}
    </button>
    {shown && <>
      <div className="spatial-control-deck">
        <label>Model günü<select value={activeDate} onChange={event => setDate(event.target.value)}>
          {days.map(day => <option key={day.date} value={day.date}>{day.date}</option>)}
        </select></label>
        <label>3D yüzeyde gösterilen plan<select value={activePlan.name} onChange={event => setPlan(event.target.value)}>
          {result.scenarios.map(row => <option key={row.name}>{row.name}</option>)}
        </select></label>
      </div>
      <div className="spatial-scenario-key">
        <span>0 mm</span><i /><span>{format(result.capacityMm)} mm · kök bölgesi kapasitesi</span>
      </div>
      <div className="spatial-scenario-canvas" aria-label={activePlan.name + " · parsel yüzeyi"}>
        <SpatialBoundary fallback={fallback}><Suspense fallback={fallback}>
          <ParcelScene {...{ frame, field, tone, terrain }} contextImagery={imagery?.canvas} compact fallback={fallback} />
        </Suspense></SpatialBoundary>
      </div>
      <p className="spatial-scenario-source">
        {terrain ? <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen yüksekliği</a> : "Düz yükseklik referansı"}
        {imagery?.canvas && <> · <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">
          Esri World Imagery · Esri, Vantor, Earthstar Geographics, GIS User Community
        </a></>}
      </p>
      <div className="spatial-scenario-grid">
        {result.scenarios.map(row => {
          const day = row.days.find(item => item.date === activeDate);
          return <figure key={row.name}>
            <figcaption><strong>{row.name}</strong>
              <span>{day ? format(day.depletionMm) + " mm su açığı" : "Bu gün için model çıktısı yok"}</span>
              <small>{row.stressDays} stres günü · {format(row.volumeM3)} m³ · {format(row.costMinor / 100)} ₺</small>
            </figcaption>
          </figure>;
        })}
      </div>
      {result.scenarios[0].volumeM3 > 0 && <p>İkinci planın su tüketimi farkı %{format(
        (result.scenarios[1].volumeM3 / result.scenarios[0].volumeM3 - 1) * 100
      )}.</p>}
    </>}
  </section>;
}

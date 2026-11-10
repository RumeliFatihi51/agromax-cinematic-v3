import { Suspense, useMemo, useState } from "react";
import { metricFrame } from "../../../shared/spatial";
import { ParcelScene, SpatialBoundary } from "./SpatialWorkbench";

const format = number => number.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export default function ScenarioRelief({ field, result }) {
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const [shown, setShown] = useState(false);
  const [camera, setCamera] = useState(null);
  const [date, setDate] = useState("");
  const days = result.scenarios[0]?.days || [];
  const activeDate = date || days.at(-1)?.date;
  const fallback = <p className="spatial-loading">3D açılamadı. Model değerleri tablodan okunabilir.</p>;
  if (result.scenarios.length < 2 || !days.length) return null;

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
      </div>
      <div className="spatial-scenario-key">
        <span>0 mm</span><i /><span>{format(result.capacityMm)} mm · kök bölgesi kapasitesi</span>
      </div>
      <div className="spatial-scenario-grid">
        {result.scenarios.slice(0, 2).map(row => {
          const day = row.days.find(item => item.date === activeDate);
          const ratio = result.capacityMm > 0 && day ? Math.min(1, day.depletionMm / result.capacityMm) : 0;
          const tone = "hsl(" + (199 + ratio * 30) + " 43% " + (72 - ratio * 40) + "%)";
          return <figure key={row.name}>
            <div className="spatial-scenario-canvas">
              <SpatialBoundary fallback={fallback}><Suspense fallback={fallback}>
                <ParcelScene {...{ frame, field, tone }} compact sync={camera} onCamera={setCamera} fallback={fallback} />
              </Suspense></SpatialBoundary>
            </div>
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

import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowDown, Compass, Mountain, RotateCcw } from "lucide-react";
import { metricFrame } from "../../../shared/spatial";
import ParcelMap from "../fields/ParcelMap";
import { ParcelScene, SpatialBoundary } from "./SpatialWorkbench";
import { useContextImagery } from "./imagery";
import { loadTerrain } from "./terrain";
import { compareWaterPlans } from "./water-comparison";
import { useCombinedTerrain, useDroneTerrain } from "./DroneTerrain";

const format = (value, signed = false) => Number.isFinite(value) ? value.toLocaleString("tr-TR", {
  maximumFractionDigits: 2, signDisplay: signed ? "exceptZero" : "auto",
}) : "Veri yok";
const dateLabel = value => value ? new Date(value + "T12:00:00Z").toLocaleDateString("tr-TR", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
}) : "—";
const series = ["#006b59", "#a74429"];
const metrics = ["Stres günleri", "Uygulanan sulama · m³", "Kayıtlı su maliyeti · ₺"];

function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function ComparisonChart({ rows, date, selectDate, result, stacked }) {
  const width = stacked ? 430 : 760, left = 48, right = width - 25, upper = 18, baseline = 172;
  const count = rows.length;
  const x = i => count === 1 ? (left + right) / 2 : left + i * (right - left) / (count - 1);
  const maximum = Math.max(1, result.capacityMm || 0);
  const y = mm => baseline - mm / maximum * (baseline - upper);
  const waterMaximum = Math.max(1, ...rows.flatMap(row => [row.rain, ...row.days.map(day => day.grossIrrigationMm)]).filter(Number.isFinite));
  const index = Math.max(0, rows.findIndex(row => row.date === date));
  const selected = rows[index];
  const pick = event => {
    const svg = event.currentTarget;
    const position = svg.createSVGPoint();
    position.x = event.clientX;
    position.y = event.clientY;
    const transform = svg.getScreenCTM();
    if (!transform) return;
    const at = position.matrixTransform(transform.inverse()).x;
    const nearest = Math.max(0, Math.min(count - 1, Math.round((at - left) / (right - left) * (count - 1))));
    selectDate(rows[nearest].date);
  };
  return <figure className="water-compare-chart">
    <figcaption>
      <div><small className="spatial-eyebrow">GÜNLÜK MODEL</small><h4>Kök bölgesi su açığı</h4></div>
      <span>{dateLabel(date)}</span>
    </figcaption>
    <svg viewBox={`0 0 ${width} 287`} role="img"
      aria-label="Üstte günlük su açığı, altta etkin yağış ve brüt sulama" onPointerDown={pick}>
      {[0, maximum / 2, maximum].map(value => <g key={value}>
        <line x1={left} x2={right} y1={y(value)} y2={y(value)} />
        <text x={left - 9} y={y(value) + 4} textAnchor="end">{format(value)}</text>
      </g>)}
      {Number.isFinite(result.readilyAvailableMm) && <line className="water-compare-threshold"
        x1={left} x2={right} y1={y(result.readilyAvailableMm)} y2={y(result.readilyAvailableMm)} />}
      <line className="water-compare-cursor" x1={x(index)} x2={x(index)} y1={upper} y2={257} />
      {series.map((color, plan) => <g key={color} fill={color}>
        {rows.slice(1).map((row, step) => {
          const from = rows[step].days[plan].depletionMm, to = row.days[plan].depletionMm;
          return Number.isFinite(from) && Number.isFinite(to) && <path key={row.date} d={`M${x(step)},${y(from)} L${x(step + 1)},${y(to)}`}
            fill="none" stroke={color} strokeWidth="2.6" strokeDasharray={plan ? "7 4" : undefined} />;
        })}
        {Number.isFinite(selected.days[plan].depletionMm) && <circle cx={x(index)} cy={y(selected.days[plan].depletionMm)} r={plan ? 4 : 6} />}
      </g>)}
      <text x={left} y="201">Etkin yağış ve brüt sulama · mm</text>
      <line x1={left} x2={right} y1="257" y2="257" />
      {rows.map((row, i) => [row.rain, ...row.days.map(day => day.grossIrrigationMm)].map((value, bar) => {
        const size = Math.min(6, (right - left) / count / 4);
        const height = 45 * value / waterMaximum;
        return Number.isFinite(value) && value > 0 && <rect key={row.date + bar} x={x(i) + (bar - 1.5) * size}
          y={257 - height} width={size} height={height} fill={["#467d9f", ...series][bar]} />;
      }))}
      <text x={left} y="281">{dateLabel(rows[0].date)}</text>
      {count > 1 && <text x={right} y="281" textAnchor="end">{dateLabel(rows.at(-1).date)}</text>}
    </svg>
    <div className="water-compare-chart-key">
      <span><i style={{ background: series[0] }} />Plan A</span>
      <span><i style={{ background: series[1] }} />Plan B</span>
      <span><i style={{ background: "#467d9f" }} />Etkin yağış</span>
      <span>Stres eşiği · {format(result.readilyAvailableMm)} mm</span>
    </div>
    <label className="water-compare-day">Model günü
      <input type="range" min="0" max={Math.max(0, count - 1)} value={index} disabled={count < 2}
        aria-valuetext={dateLabel(date)} onChange={event => selectDate(rows[Number(event.target.value)].date)} />
    </label>
    <p>Seçili gün · Etkin yağış {format(selected.rain)} mm · Sulama A {format(selected.days[0].grossIrrigationMm)} mm · Sulama B {format(selected.days[1].grossIrrigationMm)} mm</p>
    {selected.days.every(day => Number.isFinite(day.depletionMm)) &&
      <p>Günlük su açığı farkı B − A · {format(selected.days[1].depletionMm - selected.days[0].depletionMm, true)} mm</p>}
  </figure>;
}

export default function ScenarioRelief({ field, geometryVersion, result, input, areaM2 }) {
  const frame = useMemo(() => metricFrame(field.geometry), [field.geometry]);
  const stacked = useMedia("(max-width: 760px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const [date, setDate] = useState("");
  const [indices, setIndices] = useState([0, 1]);
  const [command, setCommand] = useState(null);
  const [lost, setLost] = useState(false);
  const [touchOrbit, setTouchOrbit] = useState(false);
  const [dem, setDem] = useState(null);
  const imagery = useContextImagery(frame, !lost, stacked);
  const drone = useDroneTerrain(field.id, geometryVersion, frame, true, !lost);
  const terrain = useCombinedTerrain(drone.dtm,
    dem?.frame === frame && Number.isFinite(dem.terrain?.reference) ? dem.terrain : null, frame);
  useEffect(() => {
    if (lost) return;
    const controller = new AbortController();
    loadTerrain(frame, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]))
      .then(terrain => { if (!controller.signal.aborted) setDem({ frame, terrain }); })
      .catch(() => { if (!controller.signal.aborted) setDem({ frame, terrain: null }); });
    return () => controller.abort();
  }, [lost, frame]);
  const plans = indices.map(index => result.scenarios[index]);
  const comparison = useMemo(() => result.scenarios.length >= 2
    ? compareWaterPlans(result.scenarios[indices[0]], result.scenarios[indices[1]], input, areaM2) : null,
  [result, indices, input, areaM2]);
  if (!comparison) return null;
  const { rows, changed, totals } = comparison;
  const active = rows.find(row => row.date === date) || rows.find(row => row.date === changed) || rows.at(-1);
  const fallback = <div className="water-compare-fallback">
    <p role="status">3D açılamadı. Ortak parsel 2D haritada gösteriliyor.</p>
    <ParcelMap geometry={field.geometry} height="100%" compact />
  </div>;

  return <section className="spatial-scenario water-comparison" aria-label="Su dengesi senaryolarının 3D karşılaştırması">
    <header className="water-compare-heading">
      <div><small className="spatial-eyebrow">FAO-56 · SULAMA KARARI</small><h3>Aynı parsel, iki sulama planı.</h3></div>
      <span>{result.calibration === "unvalidated_pilot" ? "Pilot · Saha doğrulaması bekliyor" : result.methodVersion}</span>
    </header>
    <div className="water-compare-select">
      {plans.map((plan, side) => <label key={side}>Plan {"AB"[side]}
        <select value={indices[side]} onChange={event => setIndices(previous =>
          previous.map((value, index) => index === side ? Number(event.target.value) : value))}>
          {result.scenarios.map((row, index) => <option key={index} value={index} disabled={index === indices[1 - side]}>{row.name}</option>)}
        </select>
      </label>)}
    </div>
    <div className="water-compare-stage">
      <div className="water-compare-panels" aria-label="Eşzamanlı parsel görünümleri">
        {lost ? fallback : <SpatialBoundary fallback={fallback}><Suspense fallback={<p role="status">Ortak arazi yükleniyor…</p>}>
          <ParcelScene {...{ frame, field, terrain, stacked, command, reduced }} split compact={stacked}
            interaction={!stacked || touchOrbit} droneImagery={drone.imagery}
            contextImagery={imagery?.canvas} onContextLoss={() => setLost(true)} fallback={fallback} />
        </Suspense></SpatialBoundary>}
        <div className="water-compare-overlays">
          {plans.map((plan, side) => {
            const day = active?.days[side];
            return <div key={side} className="water-compare-panel">
              <span className="water-compare-panel-name" data-side={side}>{"AB"[side]} <strong>{plan.name}</strong></span>
              <div className="water-compare-panel-value">
                <small>{active ? "PARSEL GENELİ MODEL TAHMİNİ" : "MODEL DÖNEMİ"}</small>
                {active ? <><strong>{format(day.depletionMm)}{Number.isFinite(day.depletionMm) && <small> mm</small>}</strong>
                  {Number.isFinite(day.depletionMm) && result.capacityMm > 0 && <meter min="0" max={result.capacityMm}
                    value={day.depletionMm} aria-label={plan.name + " kök bölgesi su açığı"} />}</>
                  : <strong>{dateLabel(plan.days[0]?.date)} – {dateLabel(plan.days.at(-1)?.date)}</strong>}
              </div>
            </div>;
          })}
        </div>
      </div>
      <div className="water-compare-tools">
        <div role="group" aria-label="Ortak kamera kontrolleri">
          {[[RotateCcw, "fit", "Genel görünüm"], [Mountain, "slope", "Arazi eğimi"], [ArrowDown, "top", "Üstten inceleme"]]
            .map(([Icon, type, label]) => <button type="button" key={type} onClick={() => setCommand({ type })}><Icon size={15} />{label}</button>)}
          {stacked && !lost && <button type="button" aria-pressed={touchOrbit} onClick={() => setTouchOrbit(value => !value)}>
            Kamera hareketi
          </button>}
        </div>
        <span><Compass size={15} /> Eşzamanlı kamera</span>
      </div>
    </div>
    {drone.ready.length > 0 && <label className="water-compare-source-select">Ortak arazi kaynağı
      <select value={drone.selected?.id || "satellite"} onChange={event => drone.choose(event.target.value)}>
        <option value="satellite">Uydu görüntüsü</option>
        {drone.ready.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.capturedOn} · {dataset.source}</option>)}
      </select>
    </label>}
    <p className="spatial-scenario-source">
      {drone.imagery && <>Drone ortomozaik · {drone.selected.source} · </>}
      {terrain?.drone ? "Drone DTM" : terrain
        ? <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen yüksekliği</a> : "Düz yükseklik referansı"}
      {imagery?.canvas && <> · <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri World Imagery · Esri, Vantor, Earthstar Geographics, GIS User Community</a></>}
    </p>
    {active ? <ComparisonChart {...{ rows, result, stacked }} date={active.date} selectDate={setDate} />
      : <p role="status">Bu planların ortak model günü yok. Dönem toplamları kendi tarih aralıklarına aittir.</p>}
    <div className="water-compare-summary">
      <h4>Dönem karşılaştırması</h4>
      {active && <p>{dateLabel(rows[0].date)} – {dateLabel(rows.at(-1).date)} · {changed ? "İlk fark " + dateLabel(changed) : "Bu dönemde model farkı yok"}</p>}
      <table>
        <thead><tr><th scope="col">Gösterge</th><th scope="col">A</th><th scope="col">B</th><th scope="col">B − A</th></tr></thead>
        <tbody>{metrics.map((name, index) => {
          const [a, b] = totals.map(total => total[index]);
          return <tr key={name}><th scope="row">{name}</th><td>{format(a)}</td><td>{format(b)}</td>
            <td>{active && Number.isFinite(a) && Number.isFinite(b) ? format(b - a, true) : "—"}</td></tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

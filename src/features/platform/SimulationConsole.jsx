import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Droplets, Pause, Play, RotateCcw, Satellite } from "lucide-react";
import { api } from "../../api";
import { balanceInput, runWaterBalance } from "../../../commercial/simulation/water-balance";
import { DecisionRing } from "./DecisionCharts";
import ParcelMap from "../fields/ParcelMap";
import "./simulation-console.css";

const fmt = (value, digits = 1) => value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
const currency = value => value.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const dayLabel = date => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));

function applyPlan(input, schedule, waterPrice) {
  return { ...input, waterCostMinorPerM3: Math.round(Number(waterPrice) * 100),
    scenarios: [input.scenarios[0], { name: input.scenarios[0].name === "Deneme planı B" ? "Alternatif B" : "Deneme planı B", irrigation: schedule.map(row => ({
      date: row.date, grossMm: Number(row.grossMm),
    })) }] };
}

function recommend(input, area) {
  const baseline = input.scenarios[0].irrigation;
  const days = input.days.map(day => day.date);
  const price = input.waterCostMinorPerM3 / 100;
  const original = runWaterBalance(applyPlan(input, baseline, price), area).scenarios[0];
  const options = [-2, -1, 1, 2].flatMap(shift => {
    const schedule = baseline.map(row => ({ ...row, date: days[days.indexOf(row.date) + shift] }));
    if (schedule.some(row => !row.date)) return [];
    const result = runWaterBalance(applyPlan(input, schedule, price), area).scenarios[1];
    return result.feasible && result.stressDays < original.stressDays ? [{ shift, schedule, result }] : [];
  });
  return options.sort((a, b) => a.result.stressDays - b.result.stressDays || Math.abs(a.shift) - Math.abs(b.shift))[0];
}

function DeficitChart({ plans, day, onDay, capacity, weather, threshold }) {
  const x = index => 40 + 574 * index / Math.max(1, plans[0].days.length - 1);
  const y = value => 139 - 111 * value / capacity;
  const water = weather.map((row, i) => [row.effectiveRainMm, ...plans.map(plan => plan.days[i].grossIrrigationMm)]);
  const maxWater = Math.max(1, ...water.flat());
  return <figure className="sim-plot">
    <figcaption>Kök bölgesi su açığı <span>mm · yeşil A · bakır B</span></figcaption>
    <svg viewBox="0 0 642 165" role="img" aria-label="Plan A ve B günlük su açığı grafiği">
      {[0,.25,.5,.75,1].map(level => <g key={level}><line x1="40" x2="614" y1={y(level * capacity)} y2={y(level * capacity)} />
        <text x="33" y={y(level * capacity) + 4} textAnchor="end">{fmt(level * capacity,0)}</text></g>)}
      <line x1="40" x2="614" y1={y(threshold)} y2={y(threshold)} style={{stroke:"#e6ba74"}} />
      <line className="sim-cursor" x1={x(day)} x2={x(day)} y1="24" y2="142"/>
      {plans.map((plan,index) => <g key={index} className={index ? "sim-series-b" : "sim-series-a"}>
        <polyline points={plan.days.map((row,i) => `${x(i)},${y(row.depletionMm)}`).join(" ")} />
        <circle cx={x(day)} cy={y(plan.days[day].depletionMm)} r="4.5" />
      </g>)}
      <text x="40" y="158">{dayLabel(plans[0].days[0].date)}</text>
      <text x="614" y="158" textAnchor="end">{dayLabel(plans[0].days.at(-1).date)}</text>
    </svg>
    <figcaption>Yağış ve verilen su <span>Mavi yağış · yeşil A · bakır B</span></figcaption>
    <svg viewBox="0 0 642 88" role="img" aria-label="Günlük yağış ve sulama sütunları">
      <line x1="40" x2="614" y1="68" y2="68"/>
      {water.map((values,i) => <g key={weather[i].date} className="sim-rain-bars">
        {values.map((value,j) => {
          const width = Math.min(10, 150 / water.length);
          const height = value / maxWater * 52;
          return <rect key={j} x={x(i) + (j-1.5)*width} y={68-height} width={width*.86} height={height}/>;
        })}
      </g>)}
      <line className="sim-cursor" x1={x(day)} x2={x(day)} y1="10" y2="68"/>
      <text x="33" y="17" textAnchor="end">{fmt(maxWater)}</text><text x="33" y="69" textAnchor="end">0</text>
    </svg>
    <label>Grafik günü <input aria-label="Grafik günü" type="range" min="0" max={plans[0].days.length - 1} value={day} onChange={event => onDay(Number(event.target.value))}/></label>
  </figure>;
}

export default function SimulationConsole({ field, geometryVersion, refresh, onInputs, enabled, canSetInputs }) {
  const [saved, setSaved] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(enabled);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api(`v1/fields/${field.id}/water-balance`, undefined, "GET", { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        const data = response.run?.data;
        setBusy(false);
        setSaved(null); setResult(null); setPlaying(false); setDay(0); setError(""); setShowSuggestion(false);
        if (!data || data.geometryVersion !== response.geometryVersion ||
            (geometryVersion && geometryVersion !== data.geometryVersion)) {
          if (data) setError("Son çalışma önceki parsel sınırına ait. Yeni sınırla model girdilerini kaydet.");
          return;
        }
        setSaved(data);
        setSchedule(data.input.scenarios[1]?.irrigation ?? data.input.scenarios[0].irrigation);
        setUnit(String(data.input.waterCostMinorPerM3 / 100));
      }).catch(err => {
        if (!controller.signal.aborted) { setBusy(false); setError(err.message); }
      });
    return () => controller.abort();
  }, [field.id, geometryVersion, refresh, enabled]);
  const suggestion = useMemo(() => saved && recommend(saved.input, saved.areaM2), [saved]);
  const lastDay = (result?.scenarios[0].days.length ?? 1) - 1;
  useEffect(() => {
    if (!playing || day >= lastDay) return;
    const timer = setTimeout(() => {
      setDay(day + 1);
      if (day + 1 === lastDay) setPlaying(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [playing, day, lastDay]);

  function edit(next) { setSchedule(next); setDirty(true); setPlaying(false); }
  function moveDay(next) { setDay(next); setPlaying(false); }
  function calculate(event) {
    event.preventDefault();
    setError("");
    if (schedule.some(row => row.grossMm === "") || unit === "") {
      setError("Su miktarı ve birim fiyat alanlarını doldur. Ücretsiz su için 0 gir.");
      return;
    }
    const parsed = balanceInput.safeParse(applyPlan(saved.input, schedule, unit));
    if (!parsed.success) { setError(parsed.error.issues.find(issue => issue.code === "custom")?.message || "Tarihleri, sulama miktarlarını ve birim fiyatı kontrol et."); return; }
    setResult({ ...runWaterBalance(parsed.data, saved.areaM2), days: parsed.data.days, maxVolumeM3: parsed.data.maxVolumeM3 });
    setDay(0); setPlaying(false); setDirty(false);
  }
  const plans = result?.scenarios;
  const rows = plans?.map(plan => plan.days[day]);
  const volume = plans?.map(plan => plan.days.slice(0, day + 1).reduce((sum, item) => sum + item.grossIrrigationMm, 0) * saved.areaM2 / 1000);
  const first = plans?.[0].days.findIndex((item,index) => Math.abs(item.depletionMm - plans[1].days[index].depletionMm) > .001);
  return <section className="sim-console" aria-label="Parsel simülasyon laboratuvarı">
    <header className="sim-heading"><div><span>FAO-56 · TRAKYA KIŞLIK BUĞDAY PİLOTU</span><h2>Parsel simülasyonu</h2><p>{field.name} · Saha kalibrasyonu bekleyen model</p></div>
      {suggestion && <button type="button" className="sim-suggest" aria-expanded={showSuggestion} onClick={() => setShowSuggestion(!showSuggestion)}>Bu parsel için öneriyi görmek ister misin? <ArrowRight size={16}/></button>}
    </header>
    {showSuggestion && suggestion && <aside className="sim-proposal">
      <div><strong>Aynı suyla takvimi {Math.abs(suggestion.shift)} gün {suggestion.shift < 0 ? "öne çek" : "sonraya al"}.</strong><p>Kayıtlı toprak ve hava girdileriyle yapılan denemede {suggestion.result.stressDays} stres günü hesaplandı. Kayıtlı model dönemine ait bir denemedir.</p></div>
      <button type="button" onClick={() => { edit(suggestion.schedule); setShowSuggestion(false); }}>B planına yükle</button>
    </aside>}
    <div className="sim-grid">
      <form className="sim-controls" onSubmit={calculate}>
        <h3>Planı ayarla</h3>
        {busy && <p role="status">Parsel girdileri yükleniyor…</p>}
        {!busy && !saved && <><p>{enabled ? "Bu parselin güncel sınırı için toprak, hava ve A planı girdilerini kaydet." : "Su dengesi bağlantısı bu çalışma alanında etkin değil."}</p>
          {enabled && canSetInputs && <button type="button" onClick={onInputs}>Model girdilerini aç <ArrowRight size={15}/></button>}</>}
        {saved && <>
          <p>A planı kayıtlı takvimi kullanır. B planının gün ve su miktarını aşağıdan değiştir.</p>
          <small>Deneme sonuçları tarayıcıda kalır.</small>
          <button type="button" onClick={() => edit(saved.input.scenarios[0].irrigation)}>A takvimini B’ye kopyala</button>
          <div className="sim-schedule">{schedule.map((row,i) => <fieldset key={i}>
            <legend>Sulama {i + 1}</legend>
            <label>Gün<select value={row.date} onChange={event => edit(schedule.map((item,j) => j === i ? { ...item, date: event.target.value } : item))}>
              {saved.input.days.map(item => <option key={item.date} value={item.date}>{dayLabel(item.date)}</option>)}
            </select></label>
            <label>Su · mm<input type="number" min="0" max="350" step="0.1" required value={row.grossMm}
              onChange={event => edit(schedule.map((item,j) => j === i ? { ...item, grossMm: event.target.value } : item))}/></label>
            <small>{fmt(Number(row.grossMm) * saved.areaM2 / 1000)} m³</small>
            <button type="button" aria-label={`Sulama ${i + 1} satırını kaldır`} onClick={() => edit(schedule.filter((_,j) => j !== i))}>Kaldır</button>
          </fieldset>)}</div>
          <button type="button" disabled={schedule.length >= saved.input.days.length} onClick={() => {
            const next = saved.input.days.find(item => !schedule.some(row => row.date === item.date));
            if (next) edit([...schedule, { date: next.date, grossMm: "" }]);
          }}>+ Sulama ekle</button>
          <label>Su birim fiyatı · ₺/m³<input type="number" min="0" max="1000" step="0.01" required value={unit}
            onChange={event => { setUnit(event.target.value); setDirty(true); setPlaying(false); }}/></label>
          <button className="sim-run" type="submit"><Play size={16}/> Simülasyonu çalıştır</button>
          {dirty && result && <small role="status">Sonuçlar önceki çalıştırmaya ait.</small>}
        </>}
        {error && <p className="sim-error" role="alert">{error}</p>}
      </form>
      <div className="sim-main">
        <div className="sim-map">
          {field.geometry ? <ParcelMap geometry={field.geometry} height="clamp(335px,49vh,570px)" compact /> : <p>Uydu görünümü için parsel sınırı gerekli.</p>}
          <div className="sim-map-tag"><Satellite size={15}/> {field.name}</div>
          {rows && <div className="sim-map-readout"><small>PARSEL GENELİ · MODEL</small><strong>A {fmt(rows[0].depletionMm)} mm</strong><strong>B {fmt(rows[1].depletionMm)} mm</strong></div>}
        </div>
        <div className="sim-timeline">
          <button type="button" disabled={!result} aria-label={playing ? "Zamanı duraklat" : "Zamanı oynat"} onClick={() => {
            if (playing) setPlaying(false);
            else { if (day >= lastDay) setDay(0); setPlaying(true); }
          }}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
          <button type="button" disabled={!result} aria-label="İlk güne dön" onClick={() => moveDay(0)}><RotateCcw size={16}/></button>
          <input type="range" aria-label="Simülasyon günü" min="0" max={Math.max(1,lastDay)} value={day} disabled={!result}
            aria-valuetext={rows ? dayLabel(rows[0].date) : undefined} onChange={event => moveDay(Number(event.target.value))}/>
          <strong>{rows ? dayLabel(rows[0].date) : "Başlangıç"}</strong>
        </div>
        {plans ? <DeficitChart plans={plans} day={day} onDay={moveDay} capacity={result.capacityMm} weather={result.days} threshold={result.readilyAvailableMm}/> :
          <p className="sim-wait">Günlük grafik, simülasyon çalıştırıldığında açılır.</p>}
      </div>
      <aside className="sim-results">
        <h3>Seçili gün</h3>
        <p>{rows ? `${dayLabel(rows[0].date)} · Etkin yağış ${fmt(result.days[day].effectiveRainMm)} mm` : "A ve B karşılaştırması burada açılır."}</p>
        {plans && <>
          <DecisionRing title="Plan B · su bütçesi" total={fmt(plans[1].volumeM3) + " m³"} rows={[
            {label:"Planlanan", value: Math.min(plans[1].volumeM3, result.maxVolumeM3), display:fmt(plans[1].volumeM3) + " m³", color:"#a8ecbc"},
            {label:"Kalan", value:Math.max(0, result.maxVolumeM3 - plans[1].volumeM3), display:fmt(Math.max(0, result.maxVolumeM3 - plans[1].volumeM3)) + " m³", color:"#55796a"},
            ...(plans[1].volumeM3 > result.maxVolumeM3 ? [{label:"Sınırı aşan", value:plans[1].volumeM3 - result.maxVolumeM3, display:fmt(plans[1].volumeM3 - result.maxVolumeM3) + " m³", color:"#ffc38b"}] : []),
          ]}/>
          <table><thead><tr><th scope="col">Gösterge</th><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody>
            {[["Su açığı · mm", rows.map(item => fmt(item.depletionMm))], ["Stres", rows.map(item => item.actualEtMm + 1e-9 < item.potentialEtMm ? "Var" : "Yok")],
              ["Birikimli su · m³", volume.map(item => fmt(item))],
              ["Stres günü · dönem", plans.map(item => fmt(item.stressDays, 0))],
              ["Dönem su maliyeti", plans.map(item => currency(item.costMinor / 100))],
              ["Bütçe ve su sınırı", plans.map(item => item.feasible ? "Uygun" : "Aşıldı")]].map(([label, values]) =>
              <tr key={label}><th scope="row">{label}</th><td>{values[0]}</td><td>{values[1]}</td></tr>)}
          </tbody></table>
          <p>Dönem maliyet farkı B − A · {currency((plans[1].costMinor - plans[0].costMinor) / 100)}</p>
          <p><Droplets size={14}/> {first >= 0 ? `Su açığı ilk kez ${dayLabel(plans[0].days[first].date)} tarihinde ayrışıyor.` : "Dönemde su açığı farkı oluşmadı."}</p>
          <small>Parsel geneli tahmin. Uydu haritası konumu ve kayıtlı sınırı gösterir.</small>
        </>}
        {saved && <details><summary>Modelin dayanağı</summary><p>Hava · {saved.input.weatherSource}</p><p>Toprak · {saved.input.soilSource}</p><p>{dayLabel(saved.input.days[0].date)} – {dayLabel(saved.input.days.at(-1).date)}</p>
          {!suggestion && <p>Denenen ±1 ve ±2 günlük kaydırmalar arasında su ve bütçe sınırında stres gününü azaltan seçenek bulunmadı.</p>}</details>}
      </aside>
    </div>
  </section>;
}

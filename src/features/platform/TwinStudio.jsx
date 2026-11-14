import { lazy, Suspense, useState } from "react";
import { ArrowDown, ArrowUpRight, Box, Compass, Droplets, MonitorSmartphone, Wallet } from "lucide-react";
import { balanceInput, runWaterBalance } from "../../../commercial/simulation/water-balance";
import { scenarioTotals } from "../../../shared/platform-contracts";
import { SpatialBoundary, useMedia } from "../spatial/SpatialWorkbench";
import "./twin-studio.css";

const FieldStudy = lazy(() => import("../spatial/FieldStudy"));
const poster = "/visuals/spatial-field-study.webp";
const number = value => value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const price = (minor, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(minor / 100);
const costNames = { water: "Su", energy: "Enerji", labor: "İşçilik", fertilizer: "Gübre", equipment: "Ekipman", other: "Diğer" };
const date = day => `2026-05-${String(day).padStart(2, "0")}`;
const area = 10_000;
const exercises = {
  timing: { name: "Sulama zamanlaması", description: "Aynı suyu farklı günlerde ver. Stres günleri ve kök bölgesi su açığı nasıl değişiyor?", days: [3, 7], energy: [65, 65] },
  energy: { name: "Pompa ve bütçe", description: "Aynı hacim için iki varsayımsal pompa tüketimini ve elektrik fiyatının bütçeye etkisini karşılaştır.", days: [4, 4], energy: [65, 45] },
};

export function TwinNavigation({ page, field, onNavigate, examples, onExamples }) {
  const links = [
    ["twin", "Tarlamı incele", Compass],
    ["scenarios", "Planları karşılaştır", Droplets],
    ["economics", "Maliyetleri aç", Wallet],
  ];
  return <section className="twin-deck" aria-label="Dijital İkiz çalışma alanı">
    <div className="twin-deck-copy">
      <span>AGROMAX · DİJİTAL İKİZ</span>
      <h1>{examples ? "Örnek ikizler" : page === "scenarios" ? "Aynı tarla, iki farklı karar." : page === "economics" ? "Her kararın bir maliyeti var." : "Tarlanı üç boyutta oku."}</h1>
      <p>{examples ? "Buğday sıralarına in, sonra aynı sahne üzerinde iki planın sonucunu karşılaştır." : field?.name || "Örnek sahneyi açarak başlayabilirsin."}</p>
    </div>
    <div className="twin-deck-actions">{links.map(([id, label, Icon]) =>
      <button type="button" key={id} aria-pressed={!examples && page === id} onClick={() => page === id ? onExamples(false) : onNavigate(id, field?.id)}>
        <Icon size={17} /> {label}
      </button>)}<button type="button" aria-pressed={examples} onClick={() => onExamples(true)}><Box size={17} /> Örnek ikizler</button></div>
  </section>;
}

export function TwinRecommendations({ context, onNavigate, onField }) {
  const issue = context.issues.find(item => item.level === "critical") ?? context.issues[0];
  const analysis = context.latestAnalysis;
  const change = context.comparison.find(item => item.metric === "NDVI" && Number.isFinite(item.delta));
  const actions = issue ? [issue.title, issue.detail, () => issue.action === "fields" ? onField() : onNavigate(issue.action, context.field.id), "Dayanağı aç"] :
    change && change.delta !== 0 ? ["İndeks farkını saha notlarıyla karşılaştır", "NDVI dönem farkı " + number(change.delta) + ". Gözlem tarihlerini ve örnek kapsamını incele.", () => onNavigate("evidence", context.field.id), "Kanıtı gör"] :
    ["İki sulama takvimini karşılaştır", "Aynı su bütçesiyle zamanlamayı değiştirip modelde stres günlerini incele.", () => onNavigate("scenarios", context.field.id), "Senaryoda dene"];
  return <aside className="twin-next" aria-label="Önerilen sonraki adım">
    <div><small>ÖNERİLEN SONRAKİ ADIM</small><h3>{actions[0]}</h3><p>{actions[1]}</p>
      {analysis && <p className="twin-source">{analysis.source} · {analysis.observationCount} gözlem</p>}</div>
    <button type="button" className="secondary" onClick={actions[2]}>{actions[3]} <ArrowUpRight size={16} /></button>
  </aside>;
}

export function TwinExamples({ field, canCopy, onCopy }) {
  const [exercise, setExercise] = useState("timing");
  const [closeup, setCloseup] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [timing, setTiming] = useState(7);
  const [energyPrice, setEnergyPrice] = useState(4);
  const compact = useMedia("(max-width: 700px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const preset = exercises[exercise];
  const input = balanceInput.parse({
    scope: "trakya-winter-wheat", weatherSource: "Örnek hava girdisi", soilSource: "Örnek toprak girdisi",
    sowingDate: "2025-11-01",
    days: Array.from({ length: 14 }, (_, index) => ({
      date: date(index + 1), et0Mm: 4.5 + index % 4 / 2, effectiveRainMm: index === 8 ? 7 : 0,
      cropCoefficient: 1.05, meanTempC: 18 + index % 4,
    })),
    soil: { fieldCapacity: .31, wiltingPoint: .16, rootDepthM: .65, initialDepletionMm: 34, depletionFraction: .5 },
    systemEfficiency: .8, baseTemperatureC: 0,
    scenarios: preset.days.map((day, index) => ({
      name: index ? "Plan B" : "Plan A",
      irrigation: [{ date: date(index && exercise === "timing" ? timing : day), grossMm: 30 }],
    })),
    waterCostMinorPerM3: 200, maxVolumeM3: 300, maxCostMinor: 60000,
  });
  const result = runWaterBalance(input, area);
  const [a, b] = result.scenarios;
  const firstDifference = a.days.findIndex((row, i) => Math.abs(row.depletionMm - b.days[i].depletionMm) > .001);
  const rows = result.scenarios.map((plan, i) => {
    const payload = { currency: "TRY", strategy: "irrigation", waterM3: plan.volumeM3, waterUnitCost: 2,
      energyKwh: preset.energy[i], energyUnitCost: energyPrice, laborHours: 2, laborHourlyCost: 150,
      fertilizerKg: 0, fertilizerUnitCost: 0, otherCost: 0,
      assumptions: `Örnek ikiz · 1 ha · ${preset.name} · ${plan.name} · örnek sulama günü: ${input.scenarios[i].irrigation[0].date}. Kendi parsel alanına, fiyatlarına ve takvimine göre düzenle.` };
    return { plan, payload, cost: scenarioTotals(payload) };
  });
  const chartPath = plan => plan.days.map((day, index) => `${20 + 40 * index},${150 - 125 * day.depletionMm / result.capacityMm}`).join(" ");
  const image = <img className="twin-example-poster" src={poster} alt="Blender ile hazırlanmış temsili buğday tarlası" />;
  return <section className="twin-gallery" aria-label="Örnek dijital ikizler">
    <div className="twin-example-switch">{Object.entries(exercises).map(([id, item]) =>
      <button type="button" key={id} aria-pressed={id === exercise} onClick={() => { setExercise(id); setSelectedDay(0); }}>{item.name}</button>)}</div>
    {closeup ? <SpatialBoundary fallback={<>{image}<button className="secondary" onClick={() => setCloseup(false)}>Galeriye dön</button></>}>
      <Suspense fallback={image}><FieldStudy compact={compact} onBack={() => setCloseup(false)} backLabel="Galeriye dön" reduced={reduced} modelDay={{ day: selectedDay + 1, capacity: result.capacityMm, values: [a.days[selectedDay].depletionMm, b.days[selectedDay].depletionMm] }} /></Suspense>
    </SpatialBoundary> : <div className="twin-example-cover">
      {image}<div><small>TEMSİLİ BUĞDAY ETÜDÜ</small><h3>{preset.name}</h3><p>{preset.description}</p>
        <button type="button" className="primary" onClick={() => setCloseup(true)}><Box size={18} /> 3D sahneyi aç</button></div>
    </div>}
    <div className="twin-lab">
      <header><div><small>1 HA · ÖRNEK GİRDİLER · FAO-56 PİLOTU</small><h3>Planı değiştir, farkı gör.</h3></div>
        <p>Model parsel genelini hesaplar. Bu etüt bir sulama reçetesi veya saha ölçümü içermez.</p></header>
      <div className="twin-lab-controls">
        {exercise === "timing" && <label>Plan B sulama günü <select value={timing} onChange={event => setTiming(Number(event.target.value))}>
          {input.days.map((day, index) => <option key={day.date} value={index + 1}>{index + 1}. gün</option>)}</select></label>}
        <label>Elektrik fiyatı · ₺/kWh <input type="number" min="0" max="100" step=".1" value={energyPrice}
          onChange={event => setEnergyPrice(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /></label>
      </div>
      <div className="twin-metrics">
        <div><small>SU BÜTÇESİ / PLAN</small><strong>{number(a.volumeM3)} <small>m³</small></strong></div>
        <div><small>STRES GÜNÜ FARKI</small><strong>{number(b.stressDays - a.stressDays)} <small>gün</small></strong></div>
        <div><small>MALİYET FARKI · B − A</small><strong>{price(rows[1].cost.totalMinor - rows[0].cost.totalMinor)}</strong></div>
      </div>
      <figure className="twin-chart"><figcaption>Kök bölgesi su açığı · mm <small>Yeşil A · Bakır B</small></figcaption>
        <svg viewBox="0 0 580 178" role="img" aria-label="Örnek iki planın 14 günlük su açığı çizgileri">
          <defs><linearGradient id="twin-water-fill" x2="0" y2="1"><stop stopColor="#79cbaa" stopOpacity=".42"/><stop offset="1" stopColor="#79cbaa" stopOpacity="0"/></linearGradient></defs>
          {[0,.5,1].map(level => <g key={level}><line x1="20" x2="540" y1={150 - level * 125} y2={150 - level * 125} stroke="#557066" strokeDasharray="3 5"/><text x="548" y={154 - level * 125}>{number(level * result.capacityMm)}</text></g>)}
          <polygon points={`20,150 ${chartPath(a)} 540,150`} fill="url(#twin-water-fill)" />
          <line x1="20" x2="540" y1="150" y2="150" stroke="#b9c3ab" />
          <line x1={20 + 40 * selectedDay} x2={20 + 40 * selectedDay} y1="18" y2="150" stroke="#aeb8a0" />
          {[a,b].map((plan, i) => <polyline key={plan.name} points={chartPath(plan)} fill="none" stroke={i ? "#ffbf86" : "#9de3ba"} strokeWidth="3" strokeDasharray={i ? "7 4" : undefined} />)}
          <text x="20" y="172">1. gün</text><text x="540" y="172" textAnchor="end">14. gün</text>
        </svg>
        <label>Model günü <input type="range" min="0" max="13" value={selectedDay} onChange={event => setSelectedDay(Number(event.target.value))} aria-valuetext={`${selectedDay + 1}. gün`} /></label>
        <p>{selectedDay + 1}. gün · A {number(a.days[selectedDay].depletionMm)} mm · B {number(b.days[selectedDay].depletionMm)} mm · B − A {number(b.days[selectedDay].depletionMm - a.days[selectedDay].depletionMm)} mm</p>
        <p>{firstDifference >= 0 ? `Su açığı ilk kez ${firstDifference + 1}. günde ayrışıyor.` : "İki planın modeldeki su açığı aynı."}</p>
      </figure>
      <div className="px-table-wrap"><table><caption>Örnek planların su, stres ve maliyet karşılaştırması</caption><thead><tr><th scope="col">Gösterge</th><th scope="col">Plan A</th><th scope="col">Plan B</th><th scope="col">B − A</th></tr></thead><tbody>
        {[["Sulama · m³", a.volumeM3, b.volumeM3, number], ["Stres · gün", a.stressDays, b.stressDays, number],
          ...["water", "energy", "labor"].map(key => [costNames[key], rows[0].cost.lines[key], rows[1].cost.lines[key], price]),
          ["Toplam", rows[0].cost.totalMinor, rows[1].cost.totalMinor, price]].map(([label, left, right, format]) =>
          <tr key={label}><th scope="row">{label}</th><td>{format(left)}</td><td>{format(right)}</td><td>{format(right - left)}</td></tr>)}
      </tbody></table></div>
      {canCopy && field?.geometry && <div className="twin-copy"><p>{field.name} için maliyet taslağı aç. Örnek değerleri kaydetmeden önce düzenleyebilirsin.</p>
        {rows.map(({ plan, payload }) => <button type="button" className="secondary" key={plan.name} onClick={() => onCopy({ name: `${preset.name} · ${plan.name}`, payload })}>{plan.name} taslağını aç <ArrowDown size={15} /></button>)}</div>}
    </div>
  </section>;
}

export function AccessPortal({ onNavigate, offline }) {
  const [copyState, setCopyState] = useState("");
  const address = window.location.origin;
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyState("Adres kopyalandı.");
    } catch {
      setCopyState("Adresi aşağıdaki bağlantıdan kopyalayabilirsin.");
    }
  }
  return <section className="access-portal">
    <div>
      <MonitorSmartphone size={30} aria-hidden="true" />
      <h1>AgroMax her ekranda.</h1>
      <p>Bilgisayarda ve telefonda aynı adresi ve hesabı kullan.</p>
      <div className="twin-deck-actions">
        <button type="button" onClick={copyAddress}>Adresi kopyala</button>
        <button type="button" onClick={() => onNavigate("fields")}>Parsellerimi aç <ArrowUpRight size={16} /></button>
      </div>
      <a href={address}>{address}</a>
      <p role="status">{copyState}</p>
    </div>
    <aside><h2>Sahada çevrimdışı</h2><p>{offline ? "Bağlantı kesilmeden önce parselini bu cihaza kaydet. Aşağıdan kayıtlarını yönetebilirsin." : "Bu çalışma alanında çevrimdışı parsel kaydı etkin değil."}</p></aside>
  </section>;
}

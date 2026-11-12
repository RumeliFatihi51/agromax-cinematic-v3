import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import type { runWaterBalance } from "../../../commercial/simulation/water-balance";
const ScenarioRelief = lazy(() => import("../spatial/ScenarioRelief"));

type SavedBalance = {
  run: {
    id: string;
    createdAt: string;
    data: {
      geometryVersion: string;
      areaM2?: number;
      input: { weatherSource: string; soilSource: string; waterCostMinorPerM3?: number;
        days?: { date: string; effectiveRainMm: number }[] };
      result: ReturnType<typeof runWaterBalance>;
    };
  } | null;
  geometryVersion: string;
  history?: { id: string; createdAt: string }[];
};
const soilFields = [
  ["fieldCapacity", "Tarla kapasitesi (m³/m³)", "0.0001"],
  ["wiltingPoint", "Solma noktası (m³/m³)", "0.0001"],
  ["rootDepthM", "Sabit kök derinliği (m)", "0.01"],
  ["initialDepletionMm", "Başlangıç su açığı (mm)", "0.01"],
  ["depletionFraction", "Stres eşiği oranı (0–1)", "0.01"],
  ["systemEfficiency", "Sulama verimi (0–1)", "0.01"],
  ["baseTemperatureC", "Fenoloji taban sıcaklığı (°C)", "0.01"],
  ["waterCost", "Su birim maliyeti (₺/m³)", "0.01"],
  ["maxVolumeM3", "Su bütçesi (m³)", "0.01"],
  ["maxCost", "Maliyet sınırı (₺)", "0.01"],
] as const;

function csv(text: FormDataEntryValue | null, columns: number) {
  return String(text ?? "").split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const row = line.split(",").map((cell) => cell.trim());
    if (row.length !== columns || row.some((cell) => !cell))
      throw new Error("Her satırda belirtilen sayıda dolu sütun olmalı.");
    return row;
  });
}

const fmt = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

function DepletionChart({ result }: { result: ReturnType<typeof runWaterBalance> }) {
  const days = result.scenarios[0]?.days;
  if (!days?.length || result.capacityMm <= 0) return null;
  const x = (index: number) => 56 + index * 514 / Math.max(1, days.length - 1);
  const y = (mm: number) => 154 - mm / result.capacityMm * 132;
  const threshold = y(result.readilyAvailableMm);
  const lineStyles = ["", "7 4", "2 4"];

  return (
    <figure className="depletion-chart">
      <figcaption>Günlük kök bölgesi su açığı <small>Model çıktısı · mm</small></figcaption>
      <svg viewBox="0 0 590 180" role="img" aria-label={
        `Sıfır ile ${fmt(result.capacityMm)} milimetre ölçeğinde günlük su açığı. ` +
        `Stres eşiği ${fmt(result.readilyAvailableMm)} milimetre. ` +
        result.scenarios.map(({ name, finalDepletionMm }) => `${name} son gün ${fmt(finalDepletionMm)} milimetre`).join(". ")
      }>
        {[0, result.capacityMm / 2, result.capacityMm].map((value) => (
          <g key={value}><line x1="56" x2="570" y1={y(value)} y2={y(value)} />
            <text x="48" y={y(value) + 4} textAnchor="end">{fmt(value)}</text></g>
        ))}
        <line className="depletion-threshold" x1="56" x2="570" y1={threshold} y2={threshold} />
        {result.scenarios.map(({ name, days: series }, index) => (
          <polyline key={name} className="depletion-series" data-series={index % lineStyles.length}
            strokeDasharray={lineStyles[index % lineStyles.length]}
            points={series.map((day, dayIndex) => `${x(dayIndex).toFixed(1)},${y(day.depletionMm).toFixed(1)}`).join(" ")} />
        ))}
        <text x="56" y="173">{days[0].date}</text>
        <text x="570" y="173" textAnchor="end">{days.at(-1)?.date}</text>
      </svg>
      <ul aria-label="Grafik açıklaması">
        {result.scenarios.map(({ name }, index) => <li key={name}><span data-series={index % lineStyles.length} />{name}</li>)}
        <li><span className="depletion-threshold" />Stres eşiği · {fmt(result.readilyAvailableMm)} mm</li>
      </ul>
    </figure>
  );
}

export default function WaterBalance({ fieldId, canRun, spatialField, sowingDate }: {
  fieldId: string; canRun: boolean; spatialField?: { id: string; geometry: unknown } | null; sowingDate?: string;
}) {
  const path = `v1/fields/${fieldId}/water-balance`;
  const [saved, setSaved] = useState<SavedBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeRun, setActiveRun] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api(path + (activeRun ? "?run=" + encodeURIComponent(activeRun) : ""), undefined, "GET", { signal: controller.signal })
      .then(setSaved)
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [path, activeRun]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const number = (key: string) => Number(values.get(key));
    setBusy(true);
    setError("");
    try {
      const days = csv(values.get("days"), 5).map(([date, et, rain, kc, temp]) => ({
        date, et0Mm: Number(et), effectiveRainMm: Number(rain),
        cropCoefficient: Number(kc), meanTempC: Number(temp),
      }));
      const schedule = (key: string) => csv(values.get(key), 2).map(([date, depth]) => ({
        date, grossMm: Number(depth),
      }));
      const calculated = await api(path, {
        scope: "trakya-winter-wheat",
        weatherSource: values.get("weatherSource"),
        soilSource: values.get("soilSource"),
        sowingDate: values.get("sowingDate"),
        soil: {
          fieldCapacity: number("fieldCapacity"), wiltingPoint: number("wiltingPoint"),
          rootDepthM: number("rootDepthM"), initialDepletionMm: number("initialDepletionMm"),
          depletionFraction: number("depletionFraction"),
        },
        systemEfficiency: number("systemEfficiency"),
        baseTemperatureC: number("baseTemperatureC"),
        scenarios: [
          { name: "Temel", irrigation: schedule("baseline") },
          { name: "Alternatif", irrigation: schedule("alternative") },
        ],
        days,
        waterCostMinorPerM3: Math.round(number("waterCost") * 100),
        maxVolumeM3: number("maxVolumeM3"),
        maxCostMinor: Math.round(number("maxCost") * 100),
      }) as SavedBalance;
      setSaved(previous => ({ ...calculated, history: previous?.history }));
      setActiveRun(calculated.run?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Su dengesi hesaplanamadı.");
    } finally {
      setBusy(false);
    }
  }

  const run = saved?.run;
  const result = run?.data.result;
  const showComparison = !!(run && result && result.scenarios.length >= 2 &&
    spatialField && saved?.geometryVersion === run.data.geometryVersion);
  return (
    <section className="px-surface px-section business-workspace water-balance">
      <h2>Trakya kışlık buğdayı · Su dengesi pilotu</h2>
      <p>FAO-56 kök bölgesi modeli, sağladığınız verilerle iki sulama takvimini karşılaştırır. Çıktılar saha kalibrasyonu bekliyor.</p>
      {!saved && !error && <p role="status">Model çalışması yükleniyor…</p>}
      {saved && !run && <p>Bu parsel için kayıtlı su dengesi çalışması yok.</p>}
      <div className="water-balance-grid">
      {canRun && <details className="water-balance-inputs">
        <summary>Yeni su dengesi çalıştır</summary>
        <form onSubmit={submit}>
          <div className="business-form-grid">
            <label>Meteoroloji kaynağı<input name="weatherSource" maxLength={160} required /></label>
            <label>Toprak verisi kaynağı<input name="soilSource" maxLength={160} required /></label>
            <label>Ekim tarihi<input name="sowingDate" type="date" defaultValue={sowingDate} required /></label>
            {soilFields.map(([key, label, step]) => (
              <label key={key}>{label}<input name={key} type="number" step={step} required /></label>
            ))}
          </div>
          <label>Günlük girdiler (UTC)
            <small>Başlıksız satırlarda tarih, ET₀ (mm), etkin yağış (mm), Kc, ortalama sıcaklık (°C). Sütunları virgülle ve ondalıkları noktayla ayırın.</small>
            <textarea name="days" rows={5} maxLength={20_000} required />
          </label>
          <div className="business-form-grid">
            <label>Temel sulama takvimi<textarea name="baseline" rows={3} maxLength={8000} /></label>
            <label>Alternatif sulama takvimi<textarea name="alternative" rows={3} maxLength={8000} /></label>
          </div>
          <p>Her sulama satırı tarih ve brüt derinlik (mm) içerir. Boş takvim sulamasız senaryodur.</p>
          <label className="water-balance-scope"><input type="checkbox" required /> Bu parseli Trakya kışlık buğday pilotu kapsamında değerlendiriyorum.</label>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Hesaplanıyor…" : "Senaryoları hesapla ve kaydet"}</button>
        </form>
      </details>}
      {error && <p className="error" role="alert">{error}</p>}
      {run && result && (
        <div className="water-balance-results">
          {!!saved.history?.length && !!spatialField && <label className="water-run-picker">Kayıtlı model çalışması
            <select value={saved.history.some(item => item.id === run.id) ? run.id : ""}
              onChange={event => { setError(""); setActiveRun(event.target.value); }}>
              {!saved.history.some(item => item.id === run.id) && <option value="">Önceki sınırın çalışması</option>}
              {saved.history.map(item => <option key={item.id} value={item.id}>
                {new Date(item.createdAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })} · {item.id.slice(0, 6)}
              </option>)}
            </select>
          </label>}
          <p role="status">Model çalışması · {run.createdAt.slice(0, 10)} · {result.methodVersion}</p>
          <p>{run.data.input.weatherSource} · {run.data.input.soilSource}</p>
          {saved.geometryVersion !== run.data.geometryVersion && <p>Bu çalışma önceki parsel sınırına aittir.</p>}
          {showComparison ? (
            <Suspense fallback={<p role="status">3D karşılaştırma hazırlanıyor…</p>}>
              <ScenarioRelief key={run.id} field={spatialField} geometryVersion={run.data.geometryVersion}
                result={result} input={run.data.input} areaM2={run.data.areaM2} />
            </Suspense>
          ) : <DepletionChart key={run.id} result={result} />}
          {!showComparison && <div className="px-table-wrap">
            <table>
              <thead><tr><th>Senaryo</th><th>Stres günü</th><th>Son açık (mm)</th><th>Su (m³)</th><th>Maliyet (₺)</th><th>Kısıt</th></tr></thead>
              <tbody>{result.scenarios.map((row) => <tr key={row.name}>
                <th scope="row">{row.name}</th><td>{row.stressDays}</td><td>{fmt(row.finalDepletionMm)}</td>
                <td>{fmt(row.volumeM3)}</td><td>{fmt(row.costMinor / 100)}</td><td>{row.feasible ? "Uygun" : "Aşıldı"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <p>ET₀ ±%10 duyarlılığı, son su açığı (mm): {result.scenarios.map((row) =>
            row.sensitivity ? `${row.name} ${fmt(row.sensitivity.minDepletionMm)}–${fmt(row.sensitivity.maxDepletionMm)}` : row.name).join(" · ")}</p>
          <p>{result.bestFeasible ? `Girilen takvimler arasında en az stres ve suyla: ${result.bestFeasible}.` : "Girilen takvimlerden hiçbiri su ve bütçe kısıtlarına uymuyor."}</p>
          <a href={result.methodSource} target="_blank" rel="noreferrer">FAO-56 yöntem kaynağı</a>
        </div>
      )}
      </div>
    </section>
  );
}

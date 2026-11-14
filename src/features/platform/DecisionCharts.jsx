import { useState } from "react";
import { scenarioTotals } from "../../../shared/platform-contracts";
import "./decision-charts.css";

const palette = ["#398775", "#c47a45", "#6375a7", "#a6aa53", "#8a648c", "#868f83"];
export const costLabels = { water: "Su", energy: "Elektrik", labor: "İşçilik", fertilizer: "Gübre", equipment: "Ekipman", other: "Diğer" };
const costColor = key => palette[Object.keys(costLabels).indexOf(key)] ?? "#868f83";
const money = (minor, currency) => (minor / 100).toLocaleString("tr-TR", { style: "currency", currency });

export function DecisionRing({ title, total, rows }) {
  const positive = rows.filter(row => row.value > 0);
  const sum = positive.reduce((value, row) => value + row.value, 0);
  let end = 0;
  const stops = positive.map(row => {
    const start = end;
    end += row.value / sum * 100;
    return `${row.color} ${start}% ${end}%`;
  });
  return <figure className="decision-ring">
    <figcaption>{title}</figcaption>
    <div className="decision-ring-shape" style={{ background: sum > 0 ? `conic-gradient(${stops.join(",")})` : undefined }}>
      <strong>{total}</strong>
    </div>
    <ul>{rows.map(row => <li key={row.label}><span><i style={{ background: row.color }} />{row.label}</span><strong>{row.display}</strong></li>)}</ul>
  </figure>;
}

export function CostRing({ title, total, currency, lines }) {
  return <DecisionRing title={title} total={money(total,currency)} rows={Object.entries(lines).map(([key,value]) => ({
    label: costLabels[key] ?? key, value, display: money(value,currency), color: costColor(key),
  }))}/>;
}

export function CostColumns({ records, currency }) {
  const peak = Math.max(1, ...records.map(record => record.calculation.totalMinor));
  return <figure className="decision-columns">
    <figcaption>Plan bütçeleri <span>{currency}</span></figcaption>
    <div className="decision-columns-scroll"><ol>{records.map(({ id, name, calculation }) => {
      const entries = Object.entries(calculation.lines ?? {});
      return <li key={id}><strong>{money(calculation.totalMinor,currency)}</strong>
        <div className="decision-column-track" aria-hidden="true"><div className="decision-column-bar" style={{ height: (calculation.totalMinor / peak * 100) + "%" }}>
          {entries.length ? entries.map(([key,value]) => <i key={key} style={{ flexGrow: value, background: costColor(key) }}/>) : <i style={{ flexGrow: 1, background: palette[0] }}/>}
        </div></div><span title={name}>{name}</span></li>;
    })}</ol></div>
  </figure>;
}

const costs = [
  ["water", "waterM3", "waterUnitCost", "m³"], ["labor", "laborHours", "laborHourlyCost", "saat"],
  ["energy", "energyKwh", "energyUnitCost", "kWh"], ["fertilizer", "fertilizerKg", "fertilizerUnitCost", "kg"],
  ["equipment", "equipmentHours", "equipmentHourlyCost", "saat"],
];
export function ScenarioCostInputs({ payload }) {
  const [values, setValues] = useState(payload);
  const [extras, setExtras] = useState(Boolean(payload.fertilizerKg || payload.equipmentHours || payload.otherCost || payload.fertilizerUnitCost || payload.equipmentHourlyCost));
  const currency = values.currency || "TRY";
  const numeric = key => Number(values[key] || 0);
  let preview;
  try {
    preview = scenarioTotals({ ...Object.fromEntries([...costs.flatMap(row => row.slice(1,3)), "otherCost"].map(key => [key, numeric(key)])), currency });
  } catch { /* The form retains its validation and the server remains authoritative. */ }
  const change = event => setValues(previous => ({ ...previous, [event.target.name]: event.target.value }));
  function amount(key, label) {
    return <label>{label}<input name={key} type="number" min="0" max="100000000" step="any" inputMode="decimal"
      value={values[key] ?? ""} placeholder="0" onChange={change}/></label>;
  }
  function row([key, quantity, rate, unit]) {
    return <fieldset className="decision-cost-input" key={key}><legend>{costLabels[key]}</legend>
      {amount(quantity, "Miktar · " + unit)}
      {amount(rate, `Birim fiyat · ${currency}/${unit}`)}
      <output aria-label={costLabels[key] + " ara toplamı"}>{preview ? money(preview.lines[key],currency) : "—"}</output>
    </fieldset>;
  }
  return <div className="decision-form">
    <header><p>Miktarı ve birim fiyatı gir. Kullanmadığın kalemi boş bırakabilirsin.</p>
      <label>Para birimi<select name="currency" value={currency} onChange={change}><option>TRY</option><option>EUR</option><option>USD</option></select></label>
    </header>
    {costs.slice(0,3).map(row)}
    <details open={extras} onToggle={event => setExtras(event.currentTarget.open)}>
      <summary>Gübre, ekipman ve diğer giderler</summary>{costs.slice(3).map(row)}{amount("otherCost", `Diğer gider · ${currency}`)}
    </details>
    <div className="decision-form-total"><span>Tahmini toplam</span><output aria-label="Tahmini toplam">{preview ? money(preview.totalMinor,currency) : "Tutarları kontrol et"}</output></div>
  </div>;
}

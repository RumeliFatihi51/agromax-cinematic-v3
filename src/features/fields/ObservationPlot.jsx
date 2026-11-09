export default function ObservationPlot({ observations, metric, compact = false, selectedDate, showEmpty = false }) {
  const points = observations.flatMap((row) => {
    const stat = row.stats?.[metric.id];
    const time = Date.parse(row.from);
    return stat?.coverage >= 0.7 && Number.isFinite(stat.mean) && Number.isFinite(time)
      ? [{ time, value: stat.mean }]
      : [];
  });
  if (!points.length) return showEmpty ? (
    <p className="observation-plot-empty">Bu gösterge için yeterli kapsama sahip günlük ölçüm yok.</p>
  ) : null;
  const times = points.map((point) => point.time);
  const values = points.map((point) => point.value);
  const start = Math.min(...times), end = Math.max(...times);
  const low = compact ? -1 : Math.min(...values), high = compact ? 1 : Math.max(...values);
  const left = compact ? 16 : 74;
  const x = (time) => start === end ? (left + 584) / 2 : left + (time - start) / (end - start) * (584 - left);
  const y = (value) => low === high ? 52 : 90 - (value - low) / (high - low) * 76;
  const day = (time) => new Date(time).toISOString().slice(0, 10);
  const selected = points.find((point) => day(point.time) === selectedDate);

  return (
    <figure className={compact ? "observation-plot observation-plot-mini" : "observation-plot"}>
      <figcaption className={compact ? "sr-only" : undefined}>
        {metric.id} · Geçerli günlük gözlemler ({metric.unit}){compact && " · Sabit −1 ile 1 ölçeği"}
      </figcaption>
      <svg viewBox="0 0 600 105" aria-hidden="true">
        <path d={`M${left} 14H584 M${left} 52H584 M${left} 90H584`} stroke="var(--ag-line)" />
        {!compact && (low === high ? [low] : [low, high]).map((value) =>
          <text key={value} x={left - 10} y={y(value) + 5} textAnchor="end" fill="var(--ag-muted)" fontSize="15">
            {value.toLocaleString("tr-TR", { maximumSignificantDigits: 4 })}
          </text>,
        )}
        {selected && <line x1={x(selected.time)} x2={x(selected.time)} y1="14" y2="90"
          stroke="var(--ag-primary)" strokeDasharray="2 4" />}
        {points.map((point) => (
          <circle key={point.time} cx={x(point.time)} cy={y(point.value)}
            r={point === selected ? 6 : 4} fill="var(--ag-primary)" />
        ))}
      </svg>
      {!compact && <p>{day(start)} – {day(end)} · {points.length} gözlem. Ölçek {low.toLocaleString("tr-TR", { maximumSignificantDigits: 4 })}–{high.toLocaleString("tr-TR", { maximumSignificantDigits: 4 })} {metric.unit}.</p>}
      {selectedDate && <p className={compact ? "sr-only" : "observation-plot-selection"}>
        {selectedDate} · {selected ? `${selected.value.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${metric.unit}` : "Geçerli günlük ölçüm yok"}
      </p>}
    </figure>
  );
}

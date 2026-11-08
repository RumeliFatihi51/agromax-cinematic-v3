export default function ObservationPlot({ observations, metric }) {
  const points = observations.flatMap((row) => {
    const stat = row.stats?.[metric.id];
    const time = Date.parse(row.from);
    return stat?.coverage >= 0.7 && Number.isFinite(stat.mean) && Number.isFinite(time)
      ? [{ time, value: stat.mean }]
      : [];
  });
  if (!points.length) return null;
  const times = points.map((point) => point.time);
  const values = points.map((point) => point.value);
  const start = Math.min(...times), end = Math.max(...times);
  const low = Math.min(...values), high = Math.max(...values);
  const x = (time) => start === end ? 300 : 16 + (time - start) / (end - start) * 568;
  const y = (value) => low === high ? 52 : 90 - (value - low) / (high - low) * 76;
  const day = (time) => new Date(time).toISOString().slice(0, 10);

  return (
    <figure className="observation-plot">
      <figcaption>{metric.id} · Geçerli günlük gözlemler ({metric.unit})</figcaption>
      <svg viewBox="0 0 600 105" aria-hidden="true">
        <path d="M16 14H584 M16 52H584 M16 90H584" stroke="var(--ag-line)" />
        {points.map((point) => (
          <circle key={point.time} cx={x(point.time)} cy={y(point.value)} r="4" fill="var(--ag-primary)" />
        ))}
      </svg>
      <p>{day(start)} – {day(end)} · {points.length} gözlem. Değerler aşağıdaki tabloda.</p>
    </figure>
  );
}

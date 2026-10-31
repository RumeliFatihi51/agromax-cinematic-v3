import { number, time } from "./weather-format";
export function TemperatureChart({ points }) {
  const values = points
    .map((p) => p.values.air_temperature)
    .filter(Number.isFinite);
  if (!values.length)
    return <p>Bu zaman aralığında geçerli sıcaklık tahmini yok.</p>;
  const low = Math.min(...values),
    high = Math.max(...values),
    span = Math.max(high - low, 2);
  const first = Date.parse(points[0].time),
    duration = Math.max(Date.parse(points.at(-1).time) - first, 3600000);
  const x = (p) => 25 + ((Date.parse(p.time) - first) / duration) * 650;
  const y = (p) => 137 - ((p.values.air_temperature - low) / span) * 100;
  const segments = [];
  let segment = [];
  for (const p of points) {
    if (Number.isFinite(p.values.air_temperature)) segment.push(p);
    else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  }
  if (segment.length) segments.push(segment);
  return (
    <div className="weather-chart">
      <div className="weather-chart-caption">
        <span>
          Tahmin noktalarında{" "}
          <b>
            {number(low)} – {number(high)} °C
          </b>
        </span>
        <span>{points.length} zaman noktası</span>
      </div>
      <svg
        viewBox="0 0 700 180"
        role="img"
        aria-label={`Önümüzdeki 24 saatin mevcut sıcaklık tahminleri. En düşük ${number(low)}, en yüksek ${number(high)} derece.`}
      >
        {[35, 85, 137].map((v) => (
          <line
            key={v}
            x1="25"
            y1={v}
            x2="675"
            y2={v}
            stroke="#dce8ec"
            strokeDasharray="4 6"
          />
        ))}
        {segments.map((s, i) => (
          <polyline
            key={i}
            points={s.map((p) => `${x(p)},${y(p)}`).join(" ")}
            fill="none"
            stroke="#148ea5"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        ))}
        {points
          .filter((p) => Number.isFinite(p.values.air_temperature))
          .map((p) => (
            <circle key={p.time} cx={x(p)} cy={y(p)} r="3.5" fill="#148ea5">
              <title>
                {time(p.time)} · {number(p.values.air_temperature)} °C
              </title>
            </circle>
          ))}
        {[points[0], points[Math.floor(points.length / 2)], points.at(-1)].map(
          (p, i) => (
            <text
              key={i}
              x={x(p)}
              y="171"
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              fill="#63787d"
              fontSize="11"
            >
              {new Date(p.time).toLocaleTimeString("tr-TR", {
                timeZone: "Europe/Istanbul",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </text>
          ),
        )}
      </svg>
    </div>
  );
}
export function Metric({ Icon, label, value, unit, tone }) {
  return (
    <article className={`weather-metric ${tone}`}>
      <span>
        <Icon size={21} />
      </span>
      <div>
        <small>{label}</small>
        <strong>
          {number(value)} <em>{Number.isFinite(value) ? unit : ""}</em>
        </strong>
      </div>
    </article>
  );
}

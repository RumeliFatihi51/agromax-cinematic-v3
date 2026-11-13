import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CloudSun, Flame, Layers3, ScanLine, Sprout } from "lucide-react";

export const sceneSlots = [
  { id: "season", x: 5.3, y: 14.4, width: 21.5, anchor: [15.9, 42], color: "#ecd47c" },
  { id: "zones", x: 30.4, y: 21.5, width: 18.2, anchor: [39.5, 66.5], color: "#d7e99a" },
  { id: "change", x: 53.1, y: 41, width: 17.4, anchor: [61.6, 73.7], color: "#ffd48a" },
  { id: "index", x: 76, y: 38, width: 16.2, anchor: [83.8, 72.7], color: "#a2e983" },
  { id: "tasks", x: 10, y: 59.2, width: 16.5, anchor: [17.2, 84.5], color: "#c6e0f6" },
];

const formats = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const fmt = value => Number.isFinite(value) ? formats.format(value) : "—";
const palette = ["#ee6b57", "#ec9563", "#eac986", "#fae4a3", "#e5edaa", "#b7de8e", "#8ac882", "#54ad72", "#287248"];

export function WeatherBand({ values, condition, status, Icon = CloudSun }) {
  const tiles = [["Yağış", values?.rain, " mm"], ["Bağıl nem", values?.humidity, "%"],
    ["Bulut", values?.cloud, "%"], ["Rüzgâr", values?.wind, " m/sn"]];
  return <div className="field-studio-weather" aria-label="Parsel hava tahmini">
    <div className="field-studio-weather-now">
      <div><strong>{values ? "Şimdi" : "MET Norway"}</strong><small>{values ? condition : status}</small></div>
      {Number.isFinite(values?.temperature) && <b>{fmt(values.temperature)}°</b>}<Icon size={29} />
    </div>
    {tiles.map(([label, value, unit]) => <div key={label}><small>{label}</small><strong>{fmt(value)}{Number.isFinite(value) ? unit : ""}</strong></div>)}
  </div>;
}

function StageTrack({ labels, selected, onStep }) {
  return <div className="scene-stage-track" aria-label="Sezon zaman çizgisi">
    {labels.map((label, index) => onStep
      ? <button key={label} type="button" aria-label={label} aria-pressed={selected === index}
          data-past={index < selected} onClick={() => onStep(index)} />
      : <span key={label} title={label} data-past={index < selected} data-current={index === selected} />)}
  </div>;
}

export function SceneCards({ season, zones, change, index, tasks, onOpen, selected, onStage, onRate, onRateSave, ratePending, rateMessage, onPalette }) {
  const readings = { season, zones, change, index, tasks };
  return <div className="scene-cards">
    {sceneSlots.map(slot => {
      const id = slot.id, data = readings[id];
      const Icon = { season: Sprout, zones: Layers3, change: CircleAlert, index: ScanLine, tasks: CalendarDays }[id];
      const label = { season: "Büyüme ve sezon", zones: "Uygulama oranları", change: "İndeks değişimi", index: "İndeks ölçümü", tasks: "Faaliyetler" }[id];
      return <article className="scene-card" key={id} data-slot={id} data-selected={selected === id} style={{
        "--card-x": slot.x + "%", "--card-y": slot.y + "%", "--card-width": slot.width + "%", "--card-tone": slot.color,
      }}>
        <button type="button" className="scene-card-head" onClick={() => onOpen(id)}>
          <Icon size={15} /><span>{label}</span><ArrowUpRight size={13} />
        </button>
        {id === "season" && <div className="scene-card-body">
          <StageTrack labels={data.labels} selected={data.selected} onStep={onStage} />
          <div className="scene-stage-current">
            {onStage && <button type="button" aria-label="Önceki büyüme evresi" disabled={data.selected === 0}
              onClick={() => onStage(data.selected - 1)}><ChevronLeft size={16} /></button>}
            <div><small>{data.date}</small><strong>{data.title}</strong><span>{data.caption}</span></div>
            {onStage && <button type="button" aria-label="Sonraki büyüme evresi" disabled={data.selected === data.labels.length - 1}
              onClick={() => onStage(data.selected + 1)}><ChevronRight size={16} /></button>}
          </div>
        </div>}
        {id === "zones" && <div className="scene-card-body">
          <div className="scene-zone-labels"><small>Bölge</small><small>{data.unit || "Uygulama oranı"}</small></div>
          {data.rows.length ? data.rows.slice(0, 3).map((row, i) => <div className="scene-zone-row" key={row.id || row.name}>
            <i style={{ background: ["#61bd7e", "#f0e99a", "#e5725e"][i] }} />
            <div><strong>{row.name}</strong>{row.detail && <small>{row.detail}</small>}</div>
            {onRate ? <input type="number" min="0" max="100000000" step="any" aria-label={row.name + " oranı"} value={row.rate}
              onChange={event => onRate(i, event.target.value)} />
              : <span className="scene-rate">{fmt(row.rate)}</span>}
          </div>) : <p className="scene-card-empty">{data.empty}</p>}
          {data.footer && <div className="scene-zone-labels"><small>{data.footer.label}</small><strong>{data.footer.value}</strong></div>}
          {onRateSave && <button className="scene-rate-save" type="button" disabled={ratePending} onClick={onRateSave}>
            {ratePending ? "Kaydediliyor…" : "Oranları kaydet"}
          </button>}
          {rateMessage && <p role="status">{rateMessage}</p>}
        </div>}
        {id === "change" && <div className="scene-card-body">
          <div className="scene-change-window">
            <small>Gözlem dönemi</small>
            <div><span>{data.beforeDate}</span><ArrowDownRight size={14} /><span>{data.afterDate}</span></div>
            <div><strong>{fmt(data.before)}</strong><span>{data.metric}</span><strong>{fmt(data.after)}</strong></div>
            <b data-down={data.delta < 0}>{Number.isFinite(data.delta) ? (data.delta > 0 ? "+" : "") + fmt(data.delta) : "Karşılaştırma yok"}</b>
          </div>
        </div>}
        {id === "index" && <div className="scene-card-body">
          <div className="scene-index-value"><div><small>{data.metric}</small><strong>{data.loading ? "…" : fmt(data.value)}</strong></div>
            <div className="scene-index-bars" aria-hidden="true">{(data.series || []).slice(-5).map((value, i) =>
              <i key={i} style={{ width: Math.max(5, Math.min(100, (value + 1) * 50)) + "%" }} />)}</div></div>
          {(data.palette || onPalette) && <div className="scene-palette" aria-label="İndeks renk ölçeği">
            {(data.palette || palette).map((color, i) => onPalette
              ? <button key={color} type="button" aria-label={"Renk aralığı " + (i + 1)} aria-pressed={data.band === i}
                  style={{ "--swatch": color }} onClick={() => onPalette(i)} />
              : <i key={color} data-current={data.band === i} style={{ "--swatch": color }} />)}
          </div>}
        </div>}
        {id === "tasks" && <div className="scene-card-body">
          {data.rows.length ? data.rows.slice(0, 3).map(row => <div className="scene-task" key={row.id}>
            <CalendarDays size={13} /><span>{row.name}</span><small>{row.date}</small>
          </div>) : <p className="scene-card-empty">Parsele bağlı görev yok.</p>}
        </div>}
      </article>;
    })}
  </div>;
}

export function SceneLeaders({ points, selected, onSelect, visible = true }) {
  return <div className="scene-leaders" aria-label="Arazi üzerindeki panel noktaları" hidden={!visible}>
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      {sceneSlots.map(slot => {
        const position = points[slot.id];
        if (!position) return null;
        const [x, y] = position;
        const startX = (slot.x + slot.width / 2) * 10;
        const startY = ({ season: 29, zones: 44, change: 57, index: 49, tasks: 72 })[slot.id] * 10;
        const bend = startY + (y * 10 - startY) * 0.43;
        return <path key={slot.id} d={`M${startX},${startY} V${bend} L${x * 10},${y * 10}`}
          data-selected={selected === slot.id} style={{ "--leader-color": slot.color }} />;
      })}
    </svg>
    {sceneSlots.map(slot => points[slot.id] && <button key={slot.id} type="button" aria-label={{
      season: "Sezon noktasını aç", zones: "Uygulama bölgelerini aç", change: "Değişim noktasını aç",
      index: "İndeks noktasını aç", tasks: "Faaliyet noktasını aç",
    }[slot.id]} aria-pressed={selected === slot.id} onClick={() => onSelect(slot.id)}
      data-emblem={slot.id === "season" || slot.id === "change"}
      style={{ left: points[slot.id][0] + "%", top: points[slot.id][1] + "%", "--leader-color": slot.color }}>
      {slot.id === "season" ? <Sprout size={16} /> : slot.id === "change" ? <Flame size={16} /> : <i />}
    </button>)}
  </div>;
}

export function ReferenceParcels({ selected, onSelect, before, band, mobile }) {
  const patternId = useId().replaceAll(":", "");
  const shapes = {
    season: ["91,409 121,390 150,374 184,381 234,403 232,426 223,441 198,453 168,477 145,470 108,469 129,424 94,416"],
    zones: ["299,662 327,631 379,603 408,590 467,588 452,623 442,648 449,657 428,718 389,713 348,713 321,727"],
    change: ["552,726 590,669 708,716 677,762 659,762 627,850 585,855 545,846 552,786 566,739"],
    index: ["771,675 805,682 822,777 780,768 776,740",
      "772,774 825,788 840,860 826,885 769,879",
      "809,673 843,646 869,688 897,827 852,815 835,783",
      "847,638 868,597 910,588 905,736 926,838 898,823 875,698",
      "848,830 926,852 949,958 816,907 838,886"],
    tasks: ["102,766 275,789 254,855 262,872 247,942 49,949 70,871 87,846 83,829"],
  };
  const names = { season: "Örnek sezon parseli", zones: "Örnek reçete parseli", change: "Örnek değişim parseli",
    index: "Örnek indeks parselleri", tasks: "Örnek faaliyet parseli" };
  return <svg className="scene-parcels" viewBox={mobile ? "190 0 620 1000" : "0 0 1000 1000"} preserveAspectRatio="none"
    aria-label="Örnek sahadaki etkileşimli parseller">
    <defs>
      <pattern id={patternId + "-lines"} width="15" height="15" patternUnits="userSpaceOnUse" patternTransform="rotate(-27)">
        <path d="M0 0V15" stroke="#d2e8fa" strokeWidth="8" opacity=".35" />
      </pattern>
      <pattern id={patternId + "-tiles"} width="96" height="58" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
        <path d="M0 0h26v12H8v16H0zM43 3h24v12H56v16H33V22h10zM65 38h31v20H54V47h11z"
          fill="#286948" opacity=".92" />
        <path d="M70 0h26v19H82V8H70zM23 32h19v10h-7v16H14V45h9z" fill="#a84c40" opacity=".88" />
      </pattern>
      <pattern id={patternId + "-change"} width="80" height="57" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
        <path d="M0 0h22v10h11v12H15v11H0zM40 14h26v9h14v20H55v-7H40zM17 41h17v16H12z"
          fill="#ed9b5a" opacity=".65" />
      </pattern>
    </defs>
    {sceneSlots.map(({ id, color }) => <g key={id} className="scene-parcel" data-selected={id === selected} role="button" tabIndex={mobile ? -1 : 0}
      aria-label={names[id]} onClick={() => onSelect(id)} onKeyDown={event => {
        if (event.key === " " || event.key === "Enter") { event.preventDefault(); onSelect(id); }
      }}>
      {shapes[id].map(path => <g key={path}>
        <polygon points={path} fill={id === "index" ? (before ? "#e6be6c" : palette[band]) : color} />
        {id !== "season" && id !== "index" && <polygon className="scene-parcel-pattern" points={path}
          fill={`url(#${patternId}-${{ tasks: "lines", zones: "tiles", change: "change" }[id]})`} />}
      </g>)}
    </g>)}
  </svg>;
}

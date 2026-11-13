import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CloudSun, Layers3, ScanLine, Sprout } from "lucide-react";

export const sceneSlots = [
  { id: "season", x: 5.3, y: 14.4, width: 21.5, anchor: [16.2, 42], color: "#ecd47c" },
  { id: "zones", x: 30.4, y: 21.5, width: 18.2, anchor: [39.5, 66.5], color: "#d7e99a" },
  { id: "change", x: 53.1, y: 41, width: 17.4, anchor: [61.7, 74.5], color: "#ffd48a" },
  { id: "index", x: 76, y: 38, width: 16.2, anchor: [84.1, 73], color: "#a2e983" },
  { id: "tasks", x: 10, y: 59.2, width: 16.5, anchor: [18.2, 85.2], color: "#c6e0f6" },
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
          <div className="scene-index-value"><div><small>{data.metric}</small><strong>{fmt(data.value)}</strong></div>
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
      style={{ left: points[slot.id][0] + "%", top: points[slot.id][1] + "%", "--leader-color": slot.color }}><i /></button>)}
  </div>;
}

export function ReferenceParcels({ selected, onSelect, before, band, mobile }) {
  const patternId = useId().replaceAll(":", "");
  const shapes = {
    season: ["119,360 176,348 195,336 244,339 294,332 337,357 334,381 291,414 244,423 210,410 172,413 179,387 112,374"],
    zones: ["337,659 359,615 394,575 416,554 452,563 480,541 502,555 472,599 448,635 421,668 375,676"],
    change: ["532,690 555,648 599,674 627,670 685,701 662,727 634,749 606,780 544,773 525,751"],
    index: ["773,610 811,567 866,545 893,566 871,648 871,696 846,723 813,677",
      "878,701 906,682 954,729 973,823 955,854 903,814 856,782",
      "782,719 807,700 846,735 860,771 843,809 798,846 766,833 778,783"],
    tasks: ["85,743 180,751 278,766 276,803 249,877 161,905 38,907 56,859 66,815"],
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

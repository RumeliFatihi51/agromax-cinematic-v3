import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Box, Leaf, X } from "lucide-react";
import { useAreaFormat } from "../../components/PreferenceProvider";
import ObservationPlot from "../fields/ObservationPlot";
import { metrics } from "../../../shared/metrics";

const tabs = ["Durum", "Zaman Serisi", "Analiz", "Öneri"];
const value = (number) => Number.isFinite(number)
  ? number.toLocaleString("tr-TR", { maximumFractionDigits: 3 }) : "—";

export default function ParcelBrief({ field, analysis, loaded, error, metric, dates, date, onDate, onOpen, onNavigate }) {
  const [tab, setTab] = useState(tabs[0]);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const area = useAreaFormat();
  const period = analysis?.comparison?.[metric];
  const observation = analysis?.observations?.find((item) => item.from?.slice(0, 10) === date);
  const measured = observation?.stats?.[metric];
  const mean = date ? (measured?.coverage >= 0.7 ? measured.mean : null) : period?.current?.mean;
  const currentDate = date || analysis?.range?.currentLabel;
  useEffect(() => {
    if (!expanded) return;
    const node = dialog.current;
    node.showModal();
    const media = window.matchMedia("(max-width: 640px)");
    const closeOnDesktop = () => { if (!media.matches) setExpanded(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => {
      node.close();
      media.removeEventListener("change", closeOnDesktop);
      trigger.current?.focus();
    };
  }, [expanded]);
  const navigate = (action) => { setExpanded(false); action(); };
  const detail = (
      <div className="dashboard-parcel-body">
        <div className="dashboard-parcel-tabs" role="group" aria-label="Parsel analizi bölümü">
          {tabs.map((name) => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}
        </div>
        {!loaded ? <p role="status" className="dashboard-muted">Parsel analizi yükleniyor…</p>
          : error ? <p role="alert" className="dashboard-muted">{error}</p>
          : !analysis ? <div className="dashboard-parcel-empty">
            <Leaf size={22} /><strong>Kayıtlı analiz yok</strong>
            <p>Uydu gözlemleri kaydedildiğinde göstergeler ve kaynaklar burada yer alır.</p>
            {field && <button className="dashboard-text-action" onClick={() => navigate(() => onOpen(field))}>Analiz çalışma alanını aç <ArrowUpRight size={14} /></button>}
          </div> : <>
            {tab === "Durum" && <>
              <div className="dashboard-current-index">
              <div className="dashboard-index-value" key={metric + (date || "")}>
                <span>{metric}</span>
                <strong>{value(mean)}</strong>
                {!date && Number.isFinite(period?.delta) && <small className="dashboard-delta">{period.delta >= 0 ? "+" : ""}{value(period.delta)}</small>}
                <p>{currentDate || "Güncel dönem"}{date && !Number.isFinite(mean) && " · Geçerli ölçüm yok"}</p>
              </div>
              <ObservationPlot compact observations={analysis.observations || []} metric={metrics.find(({ id }) => id === metric)} />
              </div>
              <dl className="dashboard-index-list">
                {["NDVI", "NDRE", "NDMI", "NDWI"].filter((id) => id !== metric).map((id) => (
                  <div key={id}><dt><Leaf size={15} /> {id}</dt>
                    <dd>{value(date ? (observation?.stats?.[id]?.coverage >= 0.7 ? observation.stats[id].mean : null)
                      : analysis.comparison?.[id]?.current?.mean)}</dd></div>
                ))}
              </dl>
            </>}
            {tab === "Zaman Serisi" && <>
              {dates.length > 0 && <label className="dashboard-date">Uydu çekimi
                <select value={date} onChange={(event) => onDate(event.target.value)}>
                  {dates.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </label>}
              <ObservationPlot observations={analysis.observations || []} metric={metrics.find(({ id }) => id === metric)} />
              {!analysis.observations?.some((item) => item.stats?.[metric]?.coverage >= 0.7) &&
                <p className="dashboard-muted">Grafik için yeterli geçerli gözlem yok.</p>}
            </>}
            {tab === "Analiz" && <div className="dashboard-source">
              <p>{analysis.source}</p><p>{analysis.method}</p>
              <p>{analysis.fetchedAt ? new Date(analysis.fetchedAt).toLocaleString("tr-TR") : "İşleme zamanı yok"}</p>
              <button className="dashboard-text-action" onClick={() => navigate(() => onOpen(field))}>Analiz ayrıntıları <ArrowUpRight size={14} /></button>
            </div>}
            {tab === "Öneri" && <div className="dashboard-source"><p>Ölçümün dayanağını ve saha incelemesi kayıtlarını açın.</p>
              <button className="dashboard-text-action" onClick={() => navigate(() => onNavigate("investigation", field.id))}>Saha incelemeleri <ArrowUpRight size={14} /></button>
            </div>}
          </>}
      </div>
  );
  return (
    <aside className="dashboard-parcel" aria-label="Seçili parsel analizi">
      <header className="dashboard-parcel-header">
        <span className="dashboard-parcel-icon"><Box size={22} /></span>
        <div><h2>{field?.name || "Parsel seçin"}</h2>
          <p>{field ? (field.crop || "Ürün belirtilmedi") + " · " + area.format(field.area) : "Parsel özeti burada görünür"}</p></div>
        {field && <button className="dashboard-text-action" onClick={() => onOpen(field)}>Parsel Detayı <ArrowUpRight size={14} /></button>}
      </header>
      <button className="dashboard-mobile-sheet" ref={trigger} aria-haspopup="dialog" aria-expanded={expanded}
        onClick={() => setExpanded(true)}>Analizi göster</button>
      {!expanded && detail}
      {expanded && createPortal(
        <dialog className="dashboard-analysis-sheet" ref={dialog} aria-label="Parsel analizi"
          onCancel={(event) => { event.preventDefault(); setExpanded(false); }}>
          <header><h2>{field?.name || "Parsel analizi"}</h2>
            <button aria-label="Analizi kapat" onClick={() => setExpanded(false)} autoFocus><X size={19} /></button></header>
          {detail}
        </dialog>, document.body,
      )}
    </aside>
  );
}

import { useEffect, useState } from "react";
import { ArrowUpRight, Plus, Satellite, Sprout, ScanLine, MapPinned, CalendarDays, ArrowRight, Layers3, Crosshair } from "lucide-react";
import HologramTerrain from "../../components/HologramTerrain";
import ParcelMap from "../fields/ParcelMap";
import ParcelPreview from "../fields/ParcelPreview";
import FieldEditor from "../fields/FieldEditor";
import { useAreaFormat } from "../../components/PreferenceProvider";
import "./overview.css";

export default function Dashboard({ user, fields, tasks, onCreate, onSelect, onNavigate, onTask, onToggle, createRequest = 0, onCreateHandled, onSaved }) {
  const areaFormat = useAreaFormat();
  const [editing, setEditing] = useState(false), [editSession, setEditSession] = useState(0), [geometry, setGeometry] = useState(null), [drawing, setDrawing] = useState(false), [notice, setNotice] = useState(""), [selectedId, setSelectedId] = useState(null);
  useEffect(() => {
    if (!createRequest) return;
    setEditing(true); setGeometry(null); setDrawing(false); setNotice("");
    setEditSession(n => n + 1); onCreateHandled?.();
  }, [createRequest, onCreateHandled]);
  const selected = fields.find(f => f.id === selectedId) || fields[0];
  const pending = tasks.filter(t => !t.done).sort((a,b) => a.date.localeCompare(b.date));
  const mapped = fields.filter(f => f.geometry).length;
  const area = fields.reduce((sum,f) => sum + f.area, 0);
  const completion = tasks.length ? Math.round((tasks.length - pending.length) / tasks.length * 100) : 0;
  function finish(record) {
    if (record) { onSaved(record); setNotice(`${record.name} kaydedildi.`); }
    setEditing(false); setGeometry(null); setDrawing(false);
  }
  return <div className="mission-workspace">
    <header className="mission-heading">
      <div><span className="workspace-eyebrow">AGROMAX / ARAZİ KOMUTA MERKEZİ</span><h1>Toprağı anla.<br /><span>Geleceği yönet.</span></h1></div>
      <div className="mission-welcome"><span className="mission-status"><i /> ÇALIŞMA ALANIN HAZIR</span><p>Merhaba, {user.name.split(" ")[0]}.<br />Bugünün kararları burada başlıyor.</p><button className="primary" onClick={onCreate} disabled={editing}><Plus size={17} /> Parsel çiz</button></div>
    </header>
    {notice && <p role="status" className="inline-parcel-saved">{notice}</p>}
    {!editing && <>
      <section className="mission-deck" aria-label="Arazi kontrol paneli">
        <div className="mission-visual">
          <div className="mission-visual-top"><span><Crosshair size={15} /> ARAZİ GÖRSELLEŞTİRME</span><span>01 / GENEL BAKIŞ</span></div>
          <div className="mission-visual-title"><span className="mission-tiny">TOPRAK. VERİ. KARAR.</span><h2>Her parsel,<br />yeni bir olasılık.</h2></div>
          <HologramTerrain />
          <div className="mission-visual-bottom"><span><Layers3 size={15} /> Holografik arazi çalışması</span><button onClick={() => onNavigate("fields")}>Araziyi keşfet <ArrowUpRight size={16} /></button></div>
        </div>
        <aside className="mission-inspector">
          <div className="mission-panel-label"><span>PARSEL DOSYASI</span><ScanLine size={17} /></div>
          {selected ? <>
            <label className="mission-field-select">İncelenen parsel<select value={selected.id} onChange={e=>setSelectedId(e.target.value)}>{fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <div className="mission-parcel-preview"><ParcelPreview geometry={selected.geometry} /><span>{selected.geometry ? "SINIR KAYITLI" : "SINIR BEKLENİYOR"}</span></div>
            <h2>{selected.name}</h2><p>{selected.crop || "Ürün belirtilmedi"}</p>
            <dl className="mission-field-facts"><div><dt>Parsel alanı</dt><dd>{areaFormat.value(selected.area)} <small>{areaFormat.unit}</small></dd></div><div><dt>Konum</dt><dd>{selected.location || "Belirtilmedi"}</dd></div></dl>
            <button className="mission-open-field" onClick={()=>onSelect(selected)}>Parseli incele <ArrowUpRight size={18} /></button>
          </> : <div className="mission-first-field"><div className="mission-target"><Crosshair size={45} strokeWidth={1} /></div><span className="mission-tiny">İLK KOORDİNATINI BELİRLE</span><h2>Her şey bir<br />parsel ile başlar.</h2><p>Tarlanı haritada bul, sınırlarını çiz ve kendi kontrol merkezini oluştur.</p><button className="mission-open-field" onClick={onCreate}>İlk parselimi çiz <Plus size={17} /></button></div>}
        </aside>
        <div className="mission-telemetry">
          {[[Sprout,"KAYITLI PARSEL",fields.length,"tarla","fields"],[Layers3,"TOPLAM ALAN",areaFormat.value(area),areaFormat.unit,"fields"],[ScanLine,"HARİTALANAN",mapped,"parsel","fields"],[CalendarDays,"SIRADAKİ İŞLER",pending.length,"görev","tasks"]].map(([Icon,label,value,unit,page],i)=><button key={label} onClick={()=>onNavigate(page)}><span className="mission-telemetry-label"><i>0{i+1}</i> {label}<Icon size={16} /></span><strong>{value}<small>{unit}</small></strong><span className="mission-metric-rule" /></button>)}
        </div>
      </section>
      <nav className="mission-launchers" aria-label="Hızlı işlemler">
        {[[Satellite,"Araziyi incele","Parseller ve uydu analizleri","fields"],[CalendarDays,"Sahayı planla","Görevler ve sezon takibi","tasks"],[Sprout,"Filiz ile düşün","Kayıtlarından birlikte ilerle","assistant"]].map(([Icon,title,desc,page])=><button key={page} onClick={()=>onNavigate(page)}><span><Icon size={22} /></span><div><strong>{title}</strong><small>{desc}</small></div><ArrowUpRight size={20} /></button>)}
      </nav>
    </>}
    <div className={`mission-ground ${editing ? "is-editing" : ""}`}>
      <section className="mission-map">
        <header className="mission-section-head"><div><span className="workspace-eyebrow">02 / SAHA GÖRÜNÜMÜ</span><h2>{editing ? "Parsel sınırını çiz" : "Gerçek arazi. Net perspektif."}</h2></div>{!editing && <button className="secondary" onClick={()=>onNavigate("fields")}>Tam ekran <ArrowUpRight size={16} /></button>}</header>
        <ParcelMap fields={fields} height={editing ? 760 : 480} compact={false} editable={editing} editSession={editSession} onChange={setGeometry} onDrawing={setDrawing} onSelect={editing ? undefined : onSelect}>
          {editing && <FieldEditor key={editSession} field={null} geometry={geometry} drawing={drawing} onCancel={()=>finish()} onSaved={finish} />}
        </ParcelMap>
        {!editing && <footer><MapPinned size={16} /><span>{mapped} parsel sınırı kayıtlı</span><button onClick={onCreate}>Parsel ekle <Plus size={16} /></button></footer>}
      </section>
      {!editing && <aside className="mission-timeline"><header className="mission-section-head"><div><span className="workspace-eyebrow">03 / OPERASYON AKIŞI</span><h2>Sıradaki adım.</h2></div><button className="secondary" aria-label="Görev ekle" onClick={onTask}><Plus size={18} /></button></header>
        <div className="mission-progress"><div><span>Görevlerin tamamlanma oranı</span><strong>%{completion}</strong></div><progress value={completion} max="100" aria-label="Görevlerin tamamlanma oranı" /></div>
        {pending.length ? <div className="mission-task-stream">{pending.slice(0,4).map((t,i)=><label key={t.id}><span className="mission-task-order">0{i+1}</span><div><small>{new Date(t.date+"T12:00:00").toLocaleDateString("tr-TR",{day:"numeric",month:"long"})}</small><strong>{t.name}</strong></div><input type="checkbox" checked={!!t.done} onChange={()=>onToggle(t)} aria-label={`${t.name} görevini tamamla`} /></label>)}</div> : <div className="mission-quiet"><CalendarDays size={32} strokeWidth={1} /><h3>Sahanın ritmini sen belirle.</h3><p>Ekim, sulama veya saha kontrolü. İlk görevini ekle ve sezona yön ver.</p><button className="text-button" onClick={onTask}>Görev oluştur <ArrowRight size={16} /></button></div>}
        <button className="mission-all-tasks" onClick={()=>onNavigate("tasks")}>Operasyon panosunu aç <ArrowUpRight size={17} /></button>
      </aside>}
    </div>
  </div>;
}

import { useEffect, useState } from "react";
import { ArrowUpRight, Plus, Sprout, MapPinned, CalendarDays, ArrowRight, Layers3, Check, List, Map, ChevronRight } from "lucide-react";
import ParcelMap from "../fields/ParcelMap";
import ParcelPreview from "../fields/ParcelPreview";
import FieldEditor from "../fields/FieldEditor";
import { FilizAvatar } from "../../components/Brand";
import { useAreaFormat } from "../../components/PreferenceProvider";

export default function Dashboard({ user, fields, tasks, onCreate, onSelect, onNavigate, onTask, onToggle, createRequest = 0, onCreateHandled, onSaved }) {
  const areaFormat = useAreaFormat();
  const [editing, setEditing] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const [geometry, setGeometry] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("map");
  useEffect(() => {
    if (!createRequest) return;
    setEditing(true);
    setGeometry(null);
    setDrawing(false);
    setNotice("");
    setEditSession(n => n + 1);
    onCreateHandled?.();
  }, [createRequest, onCreateHandled]);
  const pending = tasks.filter(t => !t.done).sort((a, b) => a.date.localeCompare(b.date));
  const mapped = fields.filter(f => f.geometry).length;
  const area = fields.reduce((sum, f) => sum + f.area, 0);
  const completed = tasks.length - pending.length;
  function finish(record) {
    if (record) { onSaved(record); setNotice(`${record.name} kaydedildi.`); }
    setEditing(false);
    setGeometry(null);
    setDrawing(false);
  }
  const metrics = [
    { icon: Sprout, label: "Tarlalarım", value: fields.length, unit: "parsel", detail: `${mapped} parselin sınırı kayıtlı`, page: "fields", tone: "green" },
    { icon: Layers3, label: "Toplam alan", value: areaFormat.value(area), unit: areaFormat.unit, detail: "Kayıtlı parsellerinin toplamı", page: "fields", tone: "sand" },
    { icon: CalendarDays, label: "Bekleyen işler", value: pending.length, unit: "görev", detail: "Planına göz at ve önceliklendir", page: "tasks", tone: "blue" },
    { icon: Check, label: "Tamamlanan", value: completed, unit: "görev", detail: "Sezon boyunca attığın adımlar", page: "tasks", tone: "rose" },
  ];
  return <div className="fw-dashboard">
    <header className="fw-page-heading">
      <div><span className="fw-overline">İŞLETMENE GENEL BAKIŞ</span><h1>Merhaba, {user.name.split(" ")[0]}<span className="fw-greeting-dot">.</span></h1><p>Toprağında neler var, bugün sırada ne var?</p></div>
      <div className="fw-heading-actions"><button className="secondary" onClick={onTask}><Plus size={16} /> Görev ekle</button><button className="primary" disabled={editing} onClick={onCreate}><Plus size={17} /> Parsel çiz</button></div>
    </header>
    {!editing && <section className="fw-platform-callout"><span><Layers3 size={23} /></span><div><strong>AgroMax platform araçları</strong><p>Uydu, dijital ikiz, senaryolar ve doğrulama. 14 yeteneğin çalışma alanı ve hazırlık durumu.</p></div><button onClick={() => onNavigate('platform')}>Platformu keşfet <ArrowRight size={17} /></button></section>}
    {notice && <p role="status" className="inline-parcel-saved">{notice}</p>}
    {!editing && <section className="fw-metrics" aria-label="İşletme özeti">{metrics.map(({ icon: Icon, label, value, unit, detail, page, tone }) => <button key={label} className={`fw-stat fw-tone-${tone}`} onClick={() => onNavigate(page)}><div className="fw-stat-head"><span>{label}</span><span className="fw-stat-icon"><Icon size={19} strokeWidth={1.7} /></span></div><strong>{value}<small>{unit}</small></strong><p>{detail}<ArrowUpRight size={14} /></p></button>)}</section>}
    <div className={`fw-dashboard-grid ${editing ? "is-editing" : ""}`}>
      <section className="fw-surface fw-overview-section">
        <header className="fw-section-heading"><div><span className="fw-overline">ARAZİNE YAKINDAN BAK</span><h2>{editing ? "Yeni parsel çiz" : "Tarlaların, bir arada"}</h2></div>{!editing && <div className="fw-view-tabs" aria-label="Genel bakış görünümü"><button aria-pressed={view === "map"} onClick={() => setView("map")}><Map size={16} /> Harita</button><button aria-pressed={view === "list"} onClick={() => setView("list")}><List size={16} /> Parseller</button></div>}</header>
        <div hidden={!editing && view !== "map"}>
          <ParcelMap fields={fields} height={editing ? 720 : 420} compact={false} editable={editing} editSession={editSession} onChange={setGeometry} onDrawing={setDrawing} onSelect={editing ? undefined : onSelect}>
            {editing && <FieldEditor key={editSession} field={null} geometry={geometry} drawing={drawing} onCancel={() => finish()} onSaved={finish} />}
          </ParcelMap>
        </div>
        {!editing && view === "list" && <div className="fw-overview-parcels">{fields.length ? fields.map(f => <button key={f.id} onClick={() => onSelect(f)}><ParcelPreview geometry={f.geometry} /><div><strong>{f.name}</strong><small>{f.crop || "Ürün belirtilmedi"}</small></div><span>{areaFormat.format(f.area)}</span><ChevronRight size={17} /></button>) : <div className="fw-empty"><MapPinned size={32} /><h3>İlk tarlanı ekleyelim.</h3><p>Haritada yerini bul, sınırlarını çiz ve sezonunu planlamaya başla.</p><button className="primary" onClick={onCreate}>Parsel çiz <Plus size={16} /></button></div>}</div>}
        {!editing && <footer className="fw-map-footer"><span><MapPinned size={15} /> {fields.length ? `${mapped} parsel haritada işaretli` : "Tarlanı arayarak başlayabilirsin"}</span><button onClick={() => onNavigate("fields")}>Tüm parseller <ArrowRight size={15} /></button></footer>}
      </section>
      {!editing && <aside className="fw-dashboard-aside">
        <section className="fw-surface fw-agenda"><header className="fw-section-heading"><div><span className="fw-overline">PLANIN HAZIR OLSUN</span><h2>Sıradaki işler</h2></div><button className="fw-icon-button" aria-label="Yeni görev ekle" onClick={onTask}><Plus size={19} /></button></header>
          {pending.length ? <div className="fw-task-list">{pending.slice(0, 4).map(t => <label key={t.id}><input type="checkbox" checked={!!t.done} onChange={() => onToggle(t)} aria-label={`${t.name} görevini tamamla`} /><div><strong>{t.name}</strong><small><CalendarDays size={12} /> {new Date(t.date + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}</small></div></label>)}</div> : <div className="fw-agenda-empty"><span><CalendarDays size={24} strokeWidth={1.5} /></span><h3>Bugüne bir plan ekle.</h3><p>Ekim, sulama, saha ziyareti.<br />Bir sonraki adımını kaydet.</p><button onClick={onTask}>İlk görevini oluştur <Plus size={15} /></button></div>}
          <button className="fw-card-link" onClick={() => onNavigate("tasks")}>Görev planını aç <ArrowRight size={16} /></button>
        </section>
        <section className="fw-assistant-card"><FilizAvatar size={53} /><div><span>FİLİZ İLE BİRLİKTE</span><h2>Birlikte düşünelim.</h2><p>Tarla kayıtlarından sonraki adımına.</p></div><button onClick={() => onNavigate("assistant")}>Filiz’i aç <ArrowUpRight size={17} /></button></section>
      </aside>}
    </div>
    {!editing && <section className="fw-surface fw-portfolio"><header className="fw-section-heading"><div><span className="fw-overline">SANA AİT TOPRAKLAR</span><h2>Parsel defterin</h2></div><button className="text-button" onClick={() => onNavigate("fields")}>Tümünü gör <ArrowRight size={16} /></button></header>{fields.length ? <div className="fw-portfolio-grid">{fields.slice(0, 3).map(f => <button key={f.id} onClick={() => onSelect(f)}><span className="fw-parcel-mini"><ParcelPreview geometry={f.geometry} /></span><div><small>{f.crop || "Ürün belirtilmedi"}</small><strong>{f.name}</strong><span>{areaFormat.format(f.area)}</span></div><ArrowUpRight size={19} /></button>)}</div> : <div className="fw-portfolio-empty"><span><Sprout size={23} /></span><div><strong>Yeni bir sezon, ilk parselinle başlar.</strong><p>Kendi arazini ekle; verilerin ve planların burada biriksin.</p></div><button className="secondary" onClick={onCreate}>Parsel ekle <Plus size={16} /></button></div>}</section>}
  </div>;
}

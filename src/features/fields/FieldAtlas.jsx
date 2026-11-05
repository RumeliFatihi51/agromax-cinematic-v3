import { useState } from "react";
import { Search, ArrowUpRight, Plus, MapPinned, Layers3 } from "lucide-react";
import ParcelPreview from "./ParcelPreview";
import { useAreaFormat } from "../../components/PreferenceProvider";

export default function FieldAtlas({ fields, onSelect, onCreate }) {
  const [query,setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const area = useAreaFormat();
  const filtered=fields.filter(f => (filter === "all" || (filter === "mapped" ? !!f.geometry : !f.geometry)) && `${f.name} ${f.crop || ""} ${f.location || ""}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))).sort((a, b) => sort === "area" ? b.area - a.area : a.name.localeCompare(b.name, "tr"));
  return <section className="atlas-workspace" aria-label="Parsel atlası">
    <div className="atlas-search"><label><Search size={18} /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Parsel, ürün veya konum ara" aria-label="Atlas içinde ara" /></label><span>{filtered.length} / {fields.length} PARSEL</span></div>
    <div className="fw-atlas-controls"><div className="fw-view-tabs" aria-label="Parsel filtresi">{[["all", "Tüm parseller"], ["mapped", "Sınırı kayıtlı"], ["unmapped", "Sınırı eksik"]].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><label>Sıralama<select aria-label="Parsel sıralaması" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Ada göre</option><option value="area">Alana göre</option></select></label></div>
    <div className="atlas-grid">
      {filtered.map((f,i)=><button className="atlas-card" key={f.id} onClick={()=>onSelect(f.id)}>
        <div className="atlas-card-visual"><span className="atlas-number">PARSEL / {String(i+1).padStart(2,"0")}</span><ParcelPreview geometry={f.geometry} /><span className="atlas-card-signal"><i /> {f.geometry ? "SINIR KAYITLI" : "SINIR BEKLENİYOR"}</span></div>
        <div className="atlas-card-info"><div><span>{f.crop || "Ürün belirtilmedi"}</span><h2>{f.name}</h2></div><ArrowUpRight size={22} /></div>
        <div className="atlas-card-location"><MapPinned size={13} /><span>{f.location || "Konum belirtilmedi"}</span></div>
        <footer><span><Layers3 size={15} /> {area.value(f.area)} {area.unit}</span><span>Dosyayı aç <ArrowUpRight size={14} /></span></footer>
      </button>)}
      {!filtered.length && (query || filter !== "all") && <p className="atlas-no-results" role="status">Seçimine uygun parsel bulunamadı.</p>}
      <button className="atlas-create" onClick={onCreate}><span><Plus size={30} strokeWidth={1} /></span><strong>Yeni bir alan aç.</strong><p>Tarlanı haritada bul ve<br />parsel atlasına ekle.</p><small>PARSEL ÇİZ <ArrowUpRight size={15} /></small></button>
    </div>
  </section>;
}

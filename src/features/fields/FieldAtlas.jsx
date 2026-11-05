import { useState } from "react";
import { Search, ArrowUpRight, Plus, MapPinned, Layers3 } from "lucide-react";
import ParcelPreview from "./ParcelPreview";
import { useAreaFormat } from "../../components/PreferenceProvider";

export default function FieldAtlas({ fields, onSelect, onCreate }) {
  const [query,setQuery] = useState("");
  const area = useAreaFormat();
  const filtered=fields.filter(f=>`${f.name} ${f.crop || ""} ${f.location || ""}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  return <section className="atlas-workspace" aria-label="Parsel atlası">
    <div className="atlas-search"><label><Search size={18} /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Parsel, ürün veya konum ara" aria-label="Atlas içinde ara" /></label><span>{filtered.length} / {fields.length} PARSEL</span></div>
    <div className="atlas-grid">
      {filtered.map((f,i)=><button className="atlas-card" key={f.id} onClick={()=>onSelect(f.id)}>
        <div className="atlas-card-visual"><span className="atlas-number">PARSEL / {String(i+1).padStart(2,"0")}</span><ParcelPreview geometry={f.geometry} /><span className="atlas-card-signal"><i /> {f.geometry ? "SINIR KAYITLI" : "SINIR BEKLENİYOR"}</span></div>
        <div className="atlas-card-info"><div><span>{f.crop || "Ürün belirtilmedi"}</span><h2>{f.name}</h2></div><ArrowUpRight size={22} /></div>
        <div className="atlas-card-location"><MapPinned size={13} /><span>{f.location || "Konum belirtilmedi"}</span></div>
        <footer><span><Layers3 size={15} /> {area.value(f.area)} {area.unit}</span><span>Dosyayı aç <ArrowUpRight size={14} /></span></footer>
      </button>)}
      {!filtered.length && query && <p className="atlas-no-results" role="status">Bu aramayla eşleşen parsel bulunamadı.</p>}
      <button className="atlas-create" onClick={onCreate}><span><Plus size={30} strokeWidth={1} /></span><strong>Yeni bir alan aç.</strong><p>Tarlanı haritada bul ve<br />parsel atlasına ekle.</p><small>PARSEL ÇİZ <ArrowUpRight size={15} /></small></button>
    </div>
  </section>;
}

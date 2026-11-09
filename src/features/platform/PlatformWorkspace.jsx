import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, Plus, RefreshCw, Download, X, Check, Info, Search, Layers3, MapPinned, ShieldCheck, FileText } from 'lucide-react';
import { api } from '../../api';
import { platformFeatures, platformStages } from '../../../shared/platform';
import { I } from '../../components/icons';
import ParcelPreview from '../fields/ParcelPreview';
import ParcelMap from '../fields/ParcelMap';
import { PageHeading, EmptyState } from '../../components/ui/WorkspaceUI';
import { useAreaFormat } from '../../components/PreferenceProvider';
import useDialogFocus from '../../components/useDialogFocus';
import WaterBalance from './WaterBalance';
import TemporalStudio from './TemporalStudio';
import ClaimsPanel from './ClaimsPanel';
import OfflineTools from './OfflineTools';
import './platform.css';
const date=value=>value?new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'medium',timeStyle:'short'}):'—';
const num=value=>Number.isFinite(value)?value.toLocaleString('tr-TR',{maximumFractionDigits:3}):'—';
const money=calculation=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:calculation.currency}).format(calculation.totalMinor/100);
const recordKinds={scenarios:'scenario',economics:'scenario',investigation:'investigation',prescriptions:'prescription',drones:'drone',temporal:'observation'};
const kindLabels={scenario:'Senaryo',investigation:'Saha incelemesi',prescription:'Reçete taslağı',drone:'Cihaz profili',observation:'Saha gözlemi'};
const statuses={draft:'Taslak',review_requested:'İnceleme istendi',archived:'Arşivlendi'};
const sourceStates={configured:'Yapılandırılmış',unconfigured:'Bağlantı gerekli',planned:'Adaptör hazırlığı',catalog:'Katalog erişimi'};
function download(name,value) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function Notice({children}) {return <div className="px-notice"><Info size={17} aria-hidden="true" /><p>{children}</p></div>;}
export default function PlatformWorkspace({page,fields,initialFieldId,onNavigate,onSelect,commercial,canWrite=true,waterBalance,claimsEnabled,canCalculate,offline}) {
  const area=useAreaFormat();
  const [bootstrap,setBootstrap]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[exportNotice,setExportNotice]=useState(''),[editor,setEditor]=useState(null),[revisions,setRevisions]=useState(null),[query,setQuery]=useState('');
  const [fieldId,setFieldId]=useState(()=>{if(initialFieldId)return initialFieldId;try{return localStorage.getItem('agromax.platform.field')||'';}catch{return '';}});
  const activeId=fields.some(field=>field.id===fieldId)?fieldId:fields[0]?.id||'';
  const feature=platformFeatures.find(item=>item.id===page);
  const kind=recordKinds[page];
  useEffect(()=>{const controller=new AbortController();api('platform/bootstrap',undefined,'GET',{signal:controller.signal}).then(setBootstrap).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[reload]);
  useEffect(()=>{
    setData(null);setError('');setEditor(null);setRevisions(null);
    if(!activeId||page==='platform'||page==='access')return;
    try{localStorage.setItem('agromax.platform.field',activeId);}catch{}
    const controller=new AbortController();
    api(`platform/fields/${activeId}`,undefined,'GET',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[activeId,page,reload]);
  async function exportFile(record) {
    setExportNotice('');
    setBusy(true);
    setError('');
    try {
      const path = record ? `platform/records/${record.id}/export` :
        claimsEnabled ? `v1/fields/${activeId}/evidence-bundle` : `platform/fields/${activeId}/export`;
      const value = await api(path);
      download(record ? `agromax-inceleme-${record.id}.json` : `agromax-kanit-${activeId}.json`, value);
      setExportNotice(record ? 'JSON inceleme dosyası tarayıcıya gönderildi.' : 'JSON kanıt paketi tarayıcıya gönderildi.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function review(record) {setBusy(true);setError('');try{await api(`platform/records/${record.id}`,{fieldId:record.fieldId,kind:record.kind,name:record.name,payload:record.payload,status:'review_requested',version:record.version},'PATCH');setReload(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function history(record) {setBusy(true);setError('');try{setRevisions({name:record.name,...await api(`platform/records/${record.id}/revisions`)});}catch(e){setError(e.message);}finally{setBusy(false);}}
  if(!bootstrap&&!error)return <div className="studio-module-loading" role="status">Platform çalışma alanı yükleniyor…</div>;
  const context=data?.context,records=data?.records.filter(record=>record.kind===kind)||[];
  const field=context?.field||fields.find(item=>item.id===activeId);
  const workspaceActions=<>
    <button className="secondary" onClick={()=>setReload(n=>n+1)} disabled={busy}><RefreshCw size={16} /> Yenile</button>
    {page!=='platform'&&<button className="secondary" onClick={()=>onNavigate('platform')}><Layers3 size={16} /> Platform merkezi</button>}
    {page==='platform'&&<button className="primary" onClick={()=>onNavigate('twin')}>Parsel özetini aç <ArrowRight size={17}/></button>}
  </>;
  return <div className="px-workspace" data-page={page}>
    <PageHeading eyebrow={page==='platform'?'AGROMAX PLATFORMU':`${feature?.group==='assure'?'DOĞRULAMA VE RAPOR':feature?.group==='decide'?'KARAR VE UYGULAMA':'GÖZLEM VE ARAZİ'} / ${String(feature?.number||0).padStart(2,'0')}`} title={page==='platform'?'Araziden karara, tek çalışma alanı.':feature?.title} description={page==='platform'?'14 temel yeteneğin araçları, kaynakları ve hazırlık durumu.':feature?.summary}>
      {page==='temporal'&&fields.length?null:workspaceActions}
    </PageHeading>
    {error&&<div className="error" role="alert">{error}<button className="text-button" onClick={()=>setReload(n=>n+1)}>Yeniden dene</button></div>}
    {page==='platform'?<>
      <div className="px-catalog-toolbar"><h2>Platform araçları <span>14 yetenek</span></h2><label><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Yetenek ara" aria-label="Platform araçlarında ara"/></label></div>
      <FeatureAtlas features={bootstrap?.features||[]} query={query} onNavigate={onNavigate}/>
      {bootstrap&&!bootstrap.features.some(item=>`${item.title} ${item.summary}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')))&&<p role="status">Aramana uygun yetenek bulunamadı.</p>}
      <Notice>Altyapı ve taslak aşamasındaki araçların kapsamı hazırlık ve incelemeyle sınırlıdır.</Notice>
    </>:<>
      <div className="px-context-bar workspace-context">
        {page!=='access'&&<label>Parsel<select aria-label="Platform parseli" value={activeId} onChange={e=>setFieldId(e.target.value)} disabled={!fields.length}>{fields.length?fields.map(item=><option key={item.id} value={item.id}>{item.name}</option>):<option value="">Henüz parsel yok</option>}</select></label>}
        {context && page !== 'temporal' && <details className="px-field-strip workspace-parcel-details">
          <summary>Parsel özeti</summary>
          <div className="workspace-parcel-summary">
            <ParcelPreview geometry={field.geometry}/>
            <div><strong>{field.name}</strong><span>{field.crop||'Ürün belirtilmedi'} · {area.format(field.area)}</span></div>
            <p>{context.history.length} analiz kaydı · {context.issues.length} inceleme işareti</p>
            <button className="text-button" onClick={()=>onSelect(field)}>Parseli aç <ArrowUpRight size={16}/></button>
          </div>
        </details>}
        <span className={`px-stage stage-${feature?.stage}`}>{platformStages[feature?.stage]}</span>
        <span className="workspace-context-note">{feature?.available}</span>
      </div>
      {page==='access'?<><section className="px-surface px-access"><I.MonitorSmartphone size={44}/><h2>Aynı arazi. Her ekranda.</h2><p>Bilgisayar ve mobil tarayıcıda aynı hesabını, parsellerini ve kayıtlarını kullan. Telefonda alt gezinme çubuğu ve menüden tüm araçlara ulaşabilirsin.</p><code>{window.location.origin}</code><button className="primary" onClick={()=>onNavigate('fields')}>Parsellerimi aç <ArrowRight size={17}/></button></section>{offline&&<OfflineTools fields={fields} {...offline}/>}</>:<>
        {!fields.length&&page==='satellite'&&<SatelliteSources sources={bootstrap?.sources||[]}/>}
        {!fields.length&&page==='drones'&&<SourceCards sources={bootstrap?.drones||[]}/>}
        {!fields.length?<EmptyState icon={MapPinned} title="Önce bir parsel ekleyelim." description="Yeni araçların tamamı kayıtlı bir tarla üzerinden çalışır."><button className="primary" onClick={()=>onNavigate('fields')}>Parsellere git <ArrowRight size={17}/></button></EmptyState>:!data&&!error?<div className="studio-module-loading" role="status">Parsel kaynakları yükleniyor…</div>:data&&<>
          <div className="px-main-grid" data-workspace={page}><section className="px-content">
            {page==='satellite'&&<>
              <SatelliteSources sources={bootstrap?.sources||[]}/><Notice>{bootstrap?.ownership==='organization'?'Parsel Analizi ekranında Sentinel-2, Sentinel-1 ve Landsat kaynakları ayrı yöntem ve kalite bilgisiyle gösterilir.':'Sentinel‑2 parsel analizi mevcut bağlantı üzerinden çalışır.'}</Notice><div className="px-actions"><button className="primary" onClick={()=>onSelect(field)}>Parsel uydu analizini aç <ArrowUpRight size={17}/></button></div></>}
            {page==='twin'&&<>
              <section className="px-twin" aria-label="Parsel modeli ve kaynakları">
                <div className="px-twin-visual">
                  {field.geometry ? <ParcelMap geometry={field.geometry} height="100%" compact /> :
                    <p className="px-empty-inline">Parsel sınırı bekleniyor.</p>}
                  <span>Kayıtlı parsel geometrisi</span>
                </div>
                <div>
                  <span className="px-kicker">DİJİTAL PARSEL MODELİ</span>
                  <h2>{field.name}</h2>
                  <dl>
                    <div><dt>Alan</dt><dd>{area.format(field.area)}</dd></div>
                    <div><dt>Ürün</dt><dd>{field.crop||'Belirtilmedi'}</dd></div>
                    <div><dt>Konum</dt><dd>{field.location||'Belirtilmedi'}</dd></div>
                    <div><dt>Son uydu gözlemi</dt><dd>{context.latestAnalysis?.source||'Tamamlanmış gözlem yok'}</dd></div>
                    <div><dt>Model durumu</dt><dd>{waterBalance?'FAO-56 su dengesi · Kalibrasyon bekleyen pilot':'Parsel ve gözlem özeti'}</dd></div>
                    <div><dt>Sınır kimliği</dt><dd><code>{context.geometryHash.slice(0,16)}</code></dd></div>
                  </dl>
                  <button className="text-button" onClick={()=>onNavigate('temporal',field.id)}>Arazi hafızasını aç <ArrowUpRight size={15}/></button>
                </div>
              </section>
              <Checks context={context} onNavigate={onNavigate}/>
            </>}
            {page==='evidence'&&<Evidence context={context}/>}
            {['intelligence','evidence','contradictions','investigation'].includes(page)&&<section className="px-surface observation-context" aria-label="Parsel ve gözlem bağlamı">
              {field.geometry ? <ParcelMap geometry={field.geometry} height="clamp(180px, 23vh, 270px)" compact /> :
                <p className="px-empty-inline">Haritada gösterilecek kayıtlı sınır yok.</p>}
              <div>
                <span className="px-kicker">{page==='investigation'?'SAHA DOSYASI':'KAYITLI GÖZLEM BAĞLAMI'}</span>
                <h2>{field.name}</h2>
                <dl>
                  <div><dt>Kayıtlı analizler</dt><dd>{context.history.length}</dd></div>
                  <div><dt>İnceleme işaretleri</dt><dd>{context.issues.length}</dd></div>
                </dl>
                <p>{context.latestAnalysis ? context.latestAnalysis.source + ' · ' + date(context.latestAnalysis.fetchedAt) : 'Bu sınıra bağlı tamamlanmış gözlem yok.'}</p>
              </div>
            </section>}
            {waterBalance&&['twin','scenarios'].includes(page)&&<WaterBalance key={activeId} fieldId={activeId} canRun={canCalculate&&!!field.geometry}/>}
            {claimsEnabled&&['evidence','contradictions','investigation','intelligence'].includes(page)&&<ClaimsPanel key={activeId} fieldId={activeId} page={page} canWrite={canWrite}/>}
            {['intelligence','contradictions'].includes(page)&&<><section className="px-surface px-section"><h2>{page==='intelligence'?'İncelemeye nereden başlamalı?':'Kayıt hazırlık kontrolleri'}</h2><p>Kontroller: parsel sınırı, ürün bilgisi, güncel geometriye ait sonuç, eski sınırdaki kayıtlar ve son işlem hatası.</p><Checks context={context} onNavigate={onNavigate}/></section><Notice>{page==='intelligence'?'Yapay zekâ anomali modeli bağlı değil. Aşağıdaki işaretler açıklanabilir kayıt kurallarından gelir; hastalık veya neden teşhisi değildir.':'Bu aşama tam uydu–sensör–saha çelişki çözümlemesi değildir. İşaretlerin bulunmaması tarımsal doğruluk veya risksizlik onayı sayılmaz.'}</Notice><div className="px-actions"><button className="primary" onClick={()=>onNavigate('investigation',field.id)}>Saha incelemesi oluştur <Plus size={17}/></button><button className="secondary" onClick={()=>onNavigate('assistant',field.id)}>Filiz’i aç <ArrowUpRight size={16}/></button></div></>}
            {page==='evidence'&&<><div className="px-actions"><button className="secondary" disabled={busy} onClick={()=>exportFile()}><Download size={16}/> Kaynak paketini indir</button></div><Notice>Önceki ve güncel dönemlerin tarih kapsamı, gözlem sayısı ve kalite koşulları eşdeğer olmayabilir. Farklar müdahalenin etkisini kanıtlamaz; kontrol grubu ve saha doğrulaması gerekir.</Notice></>}
            {page==='temporal'&&<>
              <TemporalStudio key={activeId} context={context} onHistory={()=>onNavigate('history')} onField={()=>onSelect(field)}/>
              <div className="temporal-links">{workspaceActions}</div>
              <RecordList canWrite={canWrite} records={records} kind={kind} busy={busy} onNew={()=>setEditor({})} onEdit={setEditor} onExport={exportFile} onReview={review} onHistory={history}/>
            </>}
            {['scenarios','economics'].includes(page)&&<><Notice>Hesaplar yalnızca girilen miktar × birim fiyat ilişkisini kullanır. Verim, bitki tepkisi, risk veya kârlılık tahmini yapılmaz. Farklı para birimleri ortak toplamda birleştirilmez.</Notice><ScenarioComparison records={records} chart={page==='economics'}/><RecordList canWrite={canWrite} records={records} kind={kind} busy={busy} onNew={()=>setEditor({})} onEdit={setEditor} onExport={exportFile} onReview={review} onHistory={history}/>{page==='economics'&&commercial&&<button className="secondary" onClick={()=>onNavigate('finance')}>Gerçek maliyet kayıtlarını aç <ArrowUpRight size={16}/></button>}</>}
            {['prescriptions','investigation','drones'].includes(page)&&<>
              {page==='prescriptions'&&<>
                <section className="px-surface prescription-map" aria-label="Reçete parsel sınırı">
                  <header><h2>Uygulama planının sınırı</h2><p>{field.name} · {area.format(field.area)}</p></header>
                  {field.geometry ? <ParcelMap geometry={field.geometry} height={285} compact /> :
                    <p className="px-empty-inline">Haritada gösterilecek kayıtlı sınır yok.</p>}
                </section>
                <Notice>Oranlar kullanıcı girdisidir; sistem doz önermez. Bu aşama parsel bazlı inceleme taslağıdır. Değişken oranlı bölge haritası ve yetkili uzman onay akışı henüz etkin değildir.</Notice></>}
              {page==='investigation'&&<Checks context={context} onNavigate={onNavigate}/>}
              {page==='drones'&&<><SourceCards sources={bootstrap?.drones||[]}/><Notice>İndirilen JSON yalnızca inceleme dosyasıdır. DJI Agras, XAG veya başka bir cihazda çalıştırılabilir uçuş/uygulama görevi değildir.</Notice></>}
              <RecordList canWrite={canWrite} records={records} kind={kind} busy={busy} onNew={()=>setEditor({})} onEdit={setEditor} onExport={exportFile} onReview={review} onHistory={history}/>
            </>}
            {page==='mrv'&&<section className="px-surface px-section px-export"><ShieldCheck size={39}/><h2>Kaynağıyla birlikte sakla.</h2><p>Parsel geometrisi, analiz referansları, inceleme işaretleri, taslaklar ve sürüm referansları tek JSON paketinde. İçerik özeti SHA‑256 ile hesaplanır.</p><dl className="mrv-chain"><div><dt>Parsel kaydı</dt><dd>{field.name}</dd></div><div><dt>Analiz referansı</dt><dd>{context.history.length}</dd></div><div><dt>Çalışma dosyası</dt><dd>{data.records.length}</dd></div></dl><div className="px-actions"><button className="primary" onClick={()=>exportFile()} disabled={busy}><Download size={17}/> JSON kanıt paketini indir</button>{commercial&&<button className="secondary" onClick={()=>onNavigate('reports',field.id)}><FileText size={16}/> PDF raporları</button>}</div>{exportNotice && <p role="status">{exportNotice}</p>}<Notice>Bu paket izlenebilirlik kaydıdır. Bağımsız doğrulama, karbon kredisi, sertifikalı MRV raporu veya tarımsal başarı kanıtı değildir.</Notice></section>}
          </section><details className="px-side-panel"><summary>Kaynaklar ve çalışma kapsamı</summary><p>{feature?.available}</p>{feature?.needs.length>0&&<><h3>Bir sonraki bağlantılar</h3><ul>{feature.needs.map(need=><li key={need}><span/> {need}</li>)}</ul></>}<div className="px-private"><ShieldCheck size={18}/><p>{bootstrap?.ownership==='organization'?'Bu dosyalar yetkili işletme üyeleriyle paylaşılır.':'Bu dosyalar hesabına özeldir.'} Kaynak parsel ve sürüm bilgileri birlikte korunur.</p></div><button className="text-button" onClick={()=>onNavigate('integrations')}>Veri bağlantıları <ArrowRight size={16}/></button></details></div>
        </>}
      </>}
    </>}
    {editor&&field&&<DraftEditor kind={kind} field={field} record={editor.id?editor:null} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);setReload(n=>n+1);}}/>}
    {revisions&&<RevisionDialog value={revisions} onClose={()=>setRevisions(null)}/>}
  </div>;
}
function SourceState({ state }) {
  return <span className={`px-stage ${state === 'configured' ? 'stage-active' : 'stage-foundation'}`}>{sourceStates[state] || state}</span>;
}

function SatelliteSources({ sources }) {
  if (!sources.length) return <p className="px-empty-inline">Uydu kaynağı bilgisi alınamadı.</p>;
  return <section className="satellite-source-register" aria-labelledby="satellite-source-title">
    <div className="satellite-source-portrait">
      <span>Yörüngeden tarlaya</span>
      <strong>{sources.length}</strong>
      <p>Listelenen kaynak</p>
    </div>
    <div className="satellite-source-data">
    <h2 id="satellite-source-title">Uydu kaynakları</h2>
    <div className="px-table-wrap">
      <table aria-labelledby="satellite-source-title">
        <thead><tr><th scope="col">Kaynak</th><th scope="col">Kapsam</th><th scope="col">Bağlantı</th></tr></thead>
        <tbody>{sources.map(({ id, name, state, detail, docs }) => <tr key={id}>
          <th scope="row">{name}{docs && <a href={docs} target="_blank" rel="noreferrer" aria-label={`${name} resmî kaynağı`}>Resmî kaynak <ArrowUpRight size={14} /></a>}</th>
          <td>{detail}</td><td><SourceState state={state} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    </div>
  </section>;
}

function SourceCards({sources}) {return <section className="px-sources">{sources.map(source=><article className="px-surface" key={source.id}><header><SourceState state={source.state}/><Layers3 size={20}/></header><h2>{source.name}</h2><p>{source.detail}</p>{source.docs&&<a href={source.docs} target="_blank" rel="noreferrer">Resmî kaynak <ArrowUpRight size={14}/></a>}</article>)}</section>;}
function Checks({context,onNavigate}) {return <div className="px-checks">{context.issues.length?context.issues.map(issue=><article key={issue.code}><Info size={18}/><div><strong>{issue.title}</strong><p>{issue.detail}</p></div><button aria-label={`${issue.title}: ilgili kaydı aç`} onClick={()=>onNavigate(issue.action,context.field.id)}><ArrowUpRight size={17}/></button></article>):<article><Check size={19}/><div><strong>Bu kayıt kontrollerinde işaret yok.</strong><p>Bu sonuç tarımsal risksizlik veya verilerin uzman tarafından onaylandığı anlamına gelmez.</p></div></article>}</div>;}
function Evidence({ context }) {
  const { latestAnalysis, comparison } = context;
  const plotted = comparison.filter(({ delta }) => Number.isFinite(delta));
  const extent = plotted.reduce((largest, { delta }) => Math.max(largest, Math.abs(delta)), 0);
  return <section className="px-surface px-section evidence-register">
    <h2>Gözlenen dönem farkları</h2>
    <p>{latestAnalysis ? `${latestAnalysis.source} · ${latestAnalysis.observationCount} gözlem · ${date(latestAnalysis.fetchedAt)}` : 'Güncel parsel sınırına bağlı tamamlanmış analiz yok.'}</p>
    {latestAnalysis && <p className="px-range">Dönem: {latestAnalysis.range?.from?.slice(0,10) || '—'} → {latestAnalysis.range?.split?.slice(0,10) || '—'} → {latestAnalysis.range?.to?.slice(0,10) || '—'}</p>}
    {!!extent && <figure className="evidence-change-plot">
      <figcaption>İndeks farkı <small>Güncel − önceki</small></figcaption>
      <div className="evidence-plot-axis" aria-hidden="true"><span>−{num(extent)}</span><span>0</span><span>+{num(extent)}</span></div>
      <ul>{plotted.map(({ metric, delta }) => <li key={metric}>
        <span>{metric}</span>
        <span className="evidence-delta" aria-hidden="true"><i data-direction={delta < 0 ? 'negative' : 'positive'} style={{ width: `${Math.abs(delta) / extent * 50}%` }} /></span>
        <strong>{delta > 0 ? '+' : ''}{num(delta)}</strong>
      </li>)}</ul>
    </figure>}
    {comparison.length ? <div className="px-table-wrap"><table>
      <thead><tr><th>Gösterge</th><th>Önceki dönem</th><th>Güncel dönem</th><th>İndeks farkı</th></tr></thead>
      <tbody>{comparison.map(({ metric, previous, current, delta }) => <tr key={metric}>
        <th scope="row">{metric}</th><td>{num(previous)}</td><td>{num(current)}</td>
        <td>{num(delta)}</td>
      </tr>)}</tbody>
    </table></div> : <div className="px-empty-inline">Karşılaştırılabilir iki dönem için yeterli gözlem yok. Eksik değerler sıfır gösterilmez.</div>}
  </section>;
}
const atlasGroups = [
  ['observe', 'Gözlem ve arazi'],
  ['decide', 'Karar ve uygulama'],
  ['assure', 'Kanıt ve doğrulama'],
  ['manage', 'Çalışma alanı'],
];

function FeatureAtlas({features, query, onNavigate}) {
  const visible = features.filter((item) => `${item.title} ${item.summary}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  return <div className="feature-atlas">
    {atlasGroups.map(([group, label], index) => {
      const entries = visible.filter((item) => item.group === group);
      return entries.length ? <section className="feature-atlas-chapter" key={group}
        style={{ animationDelay: `${index * 36}ms` }}>
        <h3>{label}</h3>
        <div className="px-feature-grid">{entries.map((item) => {
          const Icon = I[item.icon] || Layers3;
          return <button className="px-feature-card" key={item.id} onClick={()=>onNavigate(item.id)}>
            <header><span><Icon size={23}/></span><small>{String(item.number).padStart(2,'0')}</small></header>
            <span className={`px-stage stage-${item.stage}`}>{platformStages[item.stage]}</span>
            <h4>{item.title}</h4><p>{item.summary}</p>
            <footer>Çalışma alanını aç <ArrowUpRight size={17}/></footer>
          </button>;
        })}</div>
      </section> : null;
    })}
  </div>;
}

function ScenarioComparison({records, chart}) {
  const active = records.filter((record) => record.status !== 'archived');
  const currencies = [...new Set(active.map((record) => record.calculation.currency))];
  return <section className="px-surface px-section scenario-comparison">
    <h2>{chart ? 'Para birimine göre maliyet' : 'Senaryo karşılaştırma tablosu'}</h2>
    <p>Arşivlenmemiş kayıtlar. Miktarlar kullanıcı varsayımlarıdır; gerçekleşmiş tüketim değildir.</p>
    <div className={chart && active.length ? 'scenario-comparison-layout' : undefined}>
    {chart && active.length > 0 && <div className="scenario-chart-ledger">{currencies.map((currency) => {
      const group = active.filter((record) => record.calculation.currency === currency);
      const max = Math.max(0, ...group.map((record) => record.calculation.totalMinor));
      return <figure className="scenario-bars" key={currency}>
        <figcaption>{currency} · Toplam maliyet</figcaption>
        <ul>{group.map((record) => <li key={record.id}>
          <span>{record.name}</span>
          <strong>{money(record.calculation)}</strong>
          <meter aria-label={record.name + ' · ' + currency} value={record.calculation.totalMinor} min={0} max={max || 1}/>
        </li>)}</ul>
        <small>Ortak ölçek: {money({currency,totalMinor:0})} – {money({currency,totalMinor:max})}</small>
      </figure>;
    })}</div>}
    {active.length ? <div className="px-table-wrap"><table>
      <thead><tr><th>Senaryo</th><th>Su (m³)</th><th>Gübre (kg)</th><th>İşçilik (sa)</th><th>Toplam</th></tr></thead>
      <tbody>{active.map((record) => <tr key={record.id}>
        <th scope="row">{record.name}</th><td>{num(record.payload.waterM3)}</td>
        <td>{num(record.payload.fertilizerKg)}</td><td>{num(record.payload.laborHours)}</td><td>{money(record.calculation)}</td>
      </tr>)}</tbody>
    </table></div> : <div className="px-empty-inline">İlk senaryonu kaydettiğinde karşılaştırma burada oluşur.</div>}
    </div>
  </section>;
}
function RecordList({records,kind,busy,canWrite,onNew,onEdit,onExport,onReview,onHistory}) {return <section className="px-surface px-section px-records"><header><div><h2>{kindLabels[kind]} dosyaları</h2><p>{records.length} çalışma kaydı · Sürümleri sunucuda saklanır.</p></div><button className="primary" onClick={onNew} disabled={!canWrite}><Plus size={16}/> Yeni {kindLabels[kind]?.toLocaleLowerCase('tr-TR')}</button></header>{records.length?<div className="px-record-list">{records.map(record=><article key={record.id}><div><span className="px-stage stage-foundation">{statuses[record.status]}</span><small>v{record.version} · {date(record.updatedAt)}</small></div><h3>{record.name}</h3><p>{record.kind==='scenario'?`${money(record.calculation)} · ${record.payload.assumptions||'Kullanıcı girdileriyle maliyet hesabı'}`:record.kind==='investigation'?`${({low:'Düşük',normal:'Normal',high:'Yüksek'})[record.payload.priority]} öncelik · ${record.payload.region}`:record.kind==='prescription'?`${num(record.payload.rate)} ${record.payload.unit} · ${record.payload.scope}`:record.kind==='drone'?`${record.payload.vendor.toUpperCase()} · ${record.payload.model}`:record.payload.notes}</p><footer><button onClick={()=>onEdit(record)} disabled={busy||!canWrite}>Düzenle</button><button onClick={()=>onHistory(record)} disabled={busy}>Sürümler</button><button onClick={()=>onExport(record)} disabled={busy}><Download size={14}/> İnceleme dosyası</button>{record.status==='draft'&&canWrite&&<button onClick={()=>onReview(record)} disabled={busy}>İnceleme iste <ArrowUpRight size={14}/></button>}</footer></article>)}</div>:<div className="px-empty-inline">Henüz dosya yok. Yeni kayıt oluştur; alanlar, kaynak parseli ve sürüm bilgisi birlikte saklansın.</div>}</section>;}
function DraftEditor({kind,field,record,onClose,onSaved}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const ref=useDialogFocus(()=>{if(!busy)onClose();});
  const [application,setApplication]=useState(record?.payload.application||'irrigation');
  const p=record?.payload||{};
  async function submit(event) {
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget),read=name=>String(form.get(name)||''),number=name=>Number(form.get(name));
    let payload;
    if(kind==='scenario')payload={waterM3:number('waterM3'),waterUnitCost:number('waterUnitCost'),fertilizerKg:number('fertilizerKg'),fertilizerUnitCost:number('fertilizerUnitCost'),laborHours:number('laborHours'),laborHourlyCost:number('laborHourlyCost'),otherCost:number('otherCost'),currency:read('currency'),assumptions:read('assumptions')};
    else if(kind==='investigation')payload={priority:read('priority'),region:read('region'),requestedData:read('requestedData'),notes:read('notes')};
    else if(kind==='prescription')payload={application,rate:number('rate'),unit:application==='irrigation'?'m3/ha':'kg/ha',scope:read('scope'),notes:read('notes')};
    else if(kind==='drone')payload={vendor:read('vendor'),model:read('model'),notes:read('notes')};
    else payload={observedAt:read('observedAt'),category:read('category'),notes:read('notes')};
    try{await api(record?`platform/records/${record.id}`:'platform/records',{fieldId:field.id,kind,name:read('name'),payload,status:record?.status||'draft',...(record?{version:record.version}:{})},record?'PATCH':'POST');onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const amount=(name,label)=><label key={name}>{label}<input name={name} type="number" min="0" max="100000000" step="any" defaultValue={p[name]??0} required/></label>;
  const text=(name,label,required=true)=><label key={name}>{label}<textarea name={name} defaultValue={p[name]||''} required={required} maxLength={name==='notes'&&kind==='observation'?4000:2000}/></label>;
  return <div className="modal-backdrop"><section ref={ref} className="px-editor" role="dialog" aria-modal="true" aria-labelledby="platform-editor-title"><header><div><span className="px-kicker">{field.name}</span><h2 id="platform-editor-title">{record?'Dosyayı düzenle':`Yeni ${kindLabels[kind]?.toLocaleLowerCase('tr-TR')}`}</h2></div><button aria-label="Dosya düzenleyicisini kapat" onClick={onClose} disabled={busy}><X size={21}/></button></header><form onSubmit={submit}><label>Dosya adı<input name="name" defaultValue={record?.name||''} required maxLength={150}/></label>
    {kind==='scenario'&&<><div className="px-form-grid">{amount('waterM3','Su miktarı (m³)')}{amount('waterUnitCost','Su birim fiyatı / m³')}{amount('fertilizerKg','Gübre miktarı (kg)')}{amount('fertilizerUnitCost','Gübre birim fiyatı / kg')}{amount('laborHours','İşçilik (saat)')}{amount('laborHourlyCost','İşçilik saat ücreti')}{amount('otherCost','Diğer maliyet')}<label>Para birimi<select name="currency" defaultValue={p.currency||'TRY'}><option>TRY</option><option>EUR</option><option>USD</option></select></label></div>{text('assumptions','Varsayımlar ve açıklama',false)}<Notice>Sonuç yalnızca maliyet aritmetiğidir. Verim ve risk simülasyonu yapılmaz.</Notice></>}
    {kind==='investigation'&&<><label>Öncelik<select name="priority" defaultValue={p.priority||'normal'}><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option></select></label>{text('region','Kontrol edilecek bölge')}{text('requestedData','İstenen veri veya saha kontrolü')}{text('notes','İnceleme notu',false)}</>}
    {kind==='prescription'&&<><div className="px-form-grid"><label>Uygulama<select name="application" aria-label="Uygulama türü" value={application} onChange={event=>setApplication(event.target.value)}><option value="irrigation">Sulama</option><option value="fertilization">Gübreleme</option></select></label><label>Birim<input readOnly value={application==='irrigation'?'m³/ha':'kg/ha'} /></label>{amount('rate','Uzman incelemesine sunulan oran')}</div>{text('scope','Kapsam ve ihtiyaç bölgesi açıklaması')}{text('notes','Uzman için not',false)}<Notice>Bu dosya uzman onayı değildir ve cihazda uygulanabilir görev oluşturmaz.</Notice></>}
    {kind==='drone'&&<><label>Hedef sistem<select name="vendor" defaultValue={p.vendor||'dji'}><option value="dji">DJI Agras</option><option value="xag">XAG</option><option value="generic">Diğer</option></select></label><label>Cihaz modeli<input name="model" defaultValue={p.model||''} required maxLength={150}/></label>{text('notes','Uyumluluk ve aktarım notları',false)}<Notice>Kaydedilen profil bir bağlantı veya çalıştırılabilir uçuş dosyası değildir.</Notice></>}
    {kind==='observation'&&<><label>Gözlem tarihi<input name="observedAt" type="date" defaultValue={p.observedAt||''} required/></label><label>Gözlem türü<select name="category" defaultValue={p.category||'crop'}><option value="crop">Bitki</option><option value="soil">Toprak</option><option value="water">Su</option><option value="other">Diğer</option></select></label>{text('notes','Saha gözlemi')}<Notice>Bu bilgi kullanıcı saha kaydıdır; otomatik doğrulanmış ölçüm olarak etiketlenmez.</Notice></>}
    {error&&<p className="error" role="alert">{error}</p>}<footer><button className="secondary" type="button" onClick={onClose} disabled={busy}>Vazgeç</button><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':'Dosyayı kaydet'} <Check size={16}/></button></footer></form></section></div>;
}
function RevisionDialog({value,onClose}) {const ref=useDialogFocus(onClose);return <div className="modal-backdrop"><section ref={ref} className="px-editor" role="dialog" aria-modal="true" aria-labelledby="revision-title"><header><h2 id="revision-title">{value.name} · Sürümler</h2><button aria-label="Sürümleri kapat" onClick={onClose}><X size={20}/></button></header><ol className="px-revisions">{value.revisions.map(record=><li key={record.version}><span>v{record.version}</span><div><strong>{record.name}</strong><p>{date(record.updatedAt)} · {statuses[record.status]}</p><small>Parsel sınırı: {record.fieldSnapshot.geometryHash.slice(0,16)}</small></div></li>)}</ol></section></div>;}

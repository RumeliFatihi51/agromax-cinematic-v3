import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowUpRight, ArrowRight, Plus, RefreshCw, Download, X, Check, Info, Search, Layers3, MapPinned, ShieldCheck, FileText } from 'lucide-react';
import { api } from '../../api';
import { platformFeatures, platformStages } from '../../../shared/platform';
import { irrigationAssets, sensorMetrics } from '../../../shared/field-observations';
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
import TwinInputs from './TwinInputs';
import './platform.css';
const SpatialWorkbench = lazy(() => import('../spatial/SpatialWorkbench'));
const SpatialAtlas = lazy(() => import('../spatial/SpatialAtlas'));
const PrescriptionViewer = lazy(() => import('../spatial/PrescriptionViewer'));
const IntelligenceViewer = lazy(() => import('../spatial/IntelligenceViewer'));
const spatialLoading = <div className="studio-module-loading" role="status">3D çalışma alanı hazırlanıyor…</div>;
const date=value=>value?new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'medium',timeStyle:'short'}):'—';
const num=value=>Number.isFinite(value)?value.toLocaleString('tr-TR',{maximumFractionDigits:3}):'—';
const money=calculation=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:calculation.currency}).format(calculation.totalMinor/100);
const recordKinds={scenarios:'scenario',economics:'scenario',investigation:'investigation',prescriptions:'prescription',drones:'drone',temporal:'observation'};
const kindLabels={scenario:'Senaryo',investigation:'Saha incelemesi',prescription:'Reçete taslağı',drone:'Cihaz profili',observation:'Saha gözlemi'};
const statuses={draft:'Taslak',review_requested:'İnceleme istendi',archived:'Arşivlendi'};
const sourceStates={configured:'Yapılandırılmış',unconfigured:'Bağlantı gerekli',planned:'Adaptör hazırlığı',catalog:'Katalog erişimi'};
function download(name,value) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function Notice({children}) {return <div className="px-notice"><Info size={17} aria-hidden="true" /><p>{children}</p></div>;}
export default function PlatformWorkspace({page,fields,initialFieldId,onNavigate,onSelect,commercial,canWrite=true,waterBalance,claimsEnabled,canCalculate,offline,spatialSelection,onSpatialSelection}) {
  const area=useAreaFormat();
  const [bootstrap,setBootstrap]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[exportNotice,setExportNotice]=useState(''),[editor,setEditor]=useState(null),[revisions,setRevisions]=useState(null),[query,setQuery]=useState('');
  const [fieldId,setFieldId]=useState(()=>{if(initialFieldId)return initialFieldId;try{return localStorage.getItem('agromax.platform.field')||'';}catch{return '';}});
  const activeId=fields.some(field=>field.id===fieldId)?fieldId:fields[0]?.id||'';
  const feature=platformFeatures.find(item=>item.id===page);
  const kind=recordKinds[page];
  useEffect(()=>{if(initialFieldId)setFieldId(initialFieldId);},[initialFieldId]);
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
  const currentData=data?.context.field.id===activeId?data:null;
  const context=currentData?.context,records=currentData?.records.filter(record=>record.kind===kind)||[];
  const field=context?.field||fields.find(item=>item.id===activeId);
  const workspaceActions=<>
    <button className="secondary" onClick={()=>setReload(n=>n+1)} disabled={busy}><RefreshCw size={16} /> Yenile</button>
    {page!=='platform'&&<button className="secondary" onClick={()=>onNavigate('platform')}><Layers3 size={16} /> Platform merkezi</button>}
    {page==='platform'&&<button className="primary" onClick={()=>onNavigate('twin', activeId)}>Dijital ikizi aç <ArrowRight size={17}/></button>}
  </>;
  const spatialProps = { field, context, waterBalance, variant: page, selection: spatialSelection?.[activeId],
    observationsOnField: currentData?.records.filter(record=>record.kind==='observation' &&
      record.fieldSnapshot.geometryHash===context.geometryHash && record.payload.coordinate),
    zonePlan: page==='twin' ? currentData?.records.find(record=>record.kind==='prescription' &&
      record.status!=='archived' && record.fieldSnapshot.geometryHash===context.geometryHash &&
      record.payload.zones?.length) : null,
    onSelection: value=>onSpatialSelection?.(activeId,value), onNavigate, onField:()=>onSelect(field) };
  return <div className="px-workspace" data-page={page}>
    <PageHeading eyebrow={page==='platform'?'AGROMAX PLATFORMU':`${feature?.group==='assure'?'DOĞRULAMA VE RAPOR':feature?.group==='decide'?'KARAR VE UYGULAMA':'GÖZLEM VE ARAZİ'} / ${String(feature?.number||0).padStart(2,'0')}`} title={page==='platform'?'Araziden karara, tek çalışma alanı.':feature?.title} description={page==='platform'?'14 temel yeteneğin araçları, kaynakları ve hazırlık durumu.':feature?.summary}>
      {page==='temporal'&&fields.length?null:workspaceActions}
    </PageHeading>
    {error&&<div className="error" role="alert">{error}<button className="text-button" onClick={()=>setReload(n=>n+1)}>Yeniden dene</button></div>}
    {page==='platform'?<>
      <Suspense fallback={spatialLoading}><SpatialAtlas field={field} fields={fields} onField={setFieldId} onNavigate={onNavigate}/></Suspense>
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
        {!fields.length?<EmptyState icon={MapPinned} title="Önce bir parsel ekleyelim." description="Yeni araçların tamamı kayıtlı bir tarla üzerinden çalışır."><button className="primary" onClick={()=>onNavigate('fields')}>Parsellere git <ArrowRight size={17}/></button></EmptyState>:!currentData&&!error?<div className="studio-module-loading" role="status">Parsel kaynakları yükleniyor…</div>:currentData&&<>
          {field.geometry && ['twin','satellite','prescriptions','intelligence'].includes(page) &&
            <Suspense fallback={spatialLoading}>
              {page==='prescriptions' ? <PrescriptionViewer key={activeId+context.geometryHash} {...spatialProps} records={records}/> :
                page==='intelligence' ? <IntelligenceViewer key={activeId+context.geometryHash} {...spatialProps} claimsEnabled={claimsEnabled}/> :
                  <SpatialWorkbench key={activeId+context.geometryHash} {...spatialProps}/>}
            </Suspense>}
          <div className="px-main-grid" data-workspace={page}><section className="px-content">
            {page==='satellite'&&<>
              <SatelliteSources sources={bootstrap?.sources||[]}/><Notice>Parsel Analizi ekranında her kaynağın ölçümü, tarihi ve yöntem bilgisi ayrı gösterilir.</Notice><div className="px-actions"><button className="primary" onClick={()=>onSelect(field)}>Parsel uydu analizini aç <ArrowUpRight size={17}/></button></div></>}
            {page==='twin'&&<>
              <TwinInputs key={activeId+context.geometryHash} context={context} records={currentData.records} onNavigate={onNavigate} onField={()=>onSelect(field)}/>
              <Checks context={context} onNavigate={onNavigate}/>
            </>}
            {page==='evidence'&&<Evidence context={context}/>}
            {['evidence','contradictions','investigation'].includes(page)&&<section className="px-surface observation-context" aria-label="Parsel ve gözlem bağlamı">
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
            {waterBalance&&['twin','scenarios'].includes(page)&&<WaterBalance key={activeId} fieldId={activeId} sowingDate={field.sowingDate} canRun={canCalculate&&!!field.geometry} spatialField={page==='scenarios'&&field.geometry?field:null}/>}
            {!waterBalance&&page==='scenarios'&&<Notice>Üç boyutlu etki karşılaştırması FAO-56 su dengesi modelinin bağlı olduğu çalışma alanlarında açılır. Kaynak ve maliyet kayıtları aşağıda kullanılabilir.</Notice>}
            {claimsEnabled&&['evidence','contradictions','investigation','intelligence'].includes(page)&&<ClaimsPanel key={activeId} fieldId={activeId} page={page} canWrite={canWrite}/>}
            {['intelligence','contradictions'].includes(page)&&<><section className="px-surface px-section"><h2>{page==='intelligence'?'İncelemeye nereden başlamalı?':'Kayıt hazırlık kontrolleri'}</h2><p>Kontroller: parsel sınırı, ürün bilgisi, güncel geometriye ait sonuç, eski sınırdaki kayıtlar ve son işlem hatası.</p><Checks context={context} onNavigate={onNavigate}/></section><Notice>{page==='intelligence'?'Yapay zekâ anomali modeli bağlı değil. Aşağıdaki işaretler açıklanabilir kayıt kurallarından gelir; hastalık veya neden teşhisi değildir.':'Bu aşama tam uydu–sensör–saha çelişki çözümlemesi değildir. İşaretlerin bulunmaması tarımsal doğruluk veya risksizlik onayı sayılmaz.'}</Notice><div className="px-actions"><button className="primary" onClick={()=>onNavigate('investigation',field.id)}>Saha incelemesi oluştur <Plus size={17}/></button><button className="secondary" onClick={()=>onNavigate('assistant',field.id)}>Filiz’i aç <ArrowUpRight size={16}/></button></div></>}
            {page==='evidence'&&<><div className="px-actions"><button className="secondary" disabled={busy} onClick={()=>exportFile()}><Download size={16}/> Kaynak paketini indir</button></div><Notice>Önceki ve güncel dönemlerin tarih kapsamı, gözlem sayısı ve kalite koşulları eşdeğer olmayabilir. Farklar müdahalenin etkisini kanıtlamaz; kontrol grubu ve saha doğrulaması gerekir.</Notice></>}
            {page==='temporal'&&<>
              <TemporalStudio key={activeId} context={context} onHistory={()=>onNavigate('history')} onField={()=>onSelect(field)}/>
              <div className="temporal-links">{workspaceActions}</div>
              <RecordList canWrite={canWrite} records={records} kind={kind} busy={busy} onNew={()=>setEditor({})} onEdit={setEditor} onExport={exportFile} onReview={review} onHistory={history}/>
            </>}
            {['scenarios','economics'].includes(page)&&<><Notice>Sonuçlar kullanıcı tarafından girilen miktar, fiyat ve gelir varsayımlarına dayanır. Her para birimi kendi ölçeğinde karşılaştırılır.</Notice><ScenarioComparison records={records} chart={page==='economics'} hectares={field.geometry ? field.area / 10 : null}/><RecordList canWrite={canWrite} records={records} kind={kind} busy={busy} onNew={()=>setEditor({})} onEdit={setEditor} onCopy={record=>setEditor({name:(record.name.slice(0,142)+' · Kopya'),payload:record.payload})} onExport={exportFile} onReview={review} onHistory={history}/>{page==='economics'&&commercial&&<button className="secondary" onClick={()=>onNavigate('finance')}>Gerçek maliyet kayıtlarını aç <ArrowUpRight size={16}/></button>}</>}
            {['prescriptions','investigation','drones'].includes(page)&&<>
              {page==='prescriptions'&&<>
                {!field.geometry && <Notice>Yönetim bölgelerini göstermek için önce parsel sınırı kaydedin.</Notice>}
                <Notice>Oranlar kullanıcı girdisidir. Bölge haritası inceleme içindir, uzman onayı ve cihaz aktarımı gerektirir.</Notice></>}
              {page==='investigation'&&<Checks context={context} onNavigate={onNavigate}/>}
              {page==='drones'&&<><SourceCards sources={bootstrap?.drones||[]}/><Notice>İndirilen JSON yalnızca inceleme dosyasıdır. DJI Agras, XAG veya başka bir cihazda çalıştırılabilir uçuş/uygulama görevi değildir.</Notice></>}
              <RecordList canWrite={canWrite} records={records} kind={kind} busy={busy} onNew={()=>setEditor({})} onEdit={setEditor} onExport={exportFile} onReview={review} onHistory={history}/>
            </>}
            {page==='mrv'&&<section className="px-surface px-section px-export"><ShieldCheck size={39}/><h2>Kaynağıyla birlikte sakla.</h2><p>Parsel geometrisi, analiz referansları, inceleme işaretleri, taslaklar ve sürüm referansları tek JSON paketinde. İçerik özeti SHA‑256 ile hesaplanır.</p><dl className="mrv-chain"><div><dt>Parsel kaydı</dt><dd>{field.name}</dd></div><div><dt>Analiz referansı</dt><dd>{context.history.length}</dd></div><div><dt>Çalışma dosyası</dt><dd>{data.records.length}</dd></div></dl><div className="px-actions"><button className="primary" onClick={()=>exportFile()} disabled={busy}><Download size={17}/> JSON kanıt paketini indir</button>{commercial&&<button className="secondary" onClick={()=>onNavigate('reports',field.id)}><FileText size={16}/> PDF raporları</button>}</div>{exportNotice && <p role="status">{exportNotice}</p>}<Notice>Bu paket izlenebilirlik kaydıdır. Bağımsız doğrulama, karbon kredisi, sertifikalı MRV raporu veya tarımsal başarı kanıtı değildir.</Notice></section>}
          </section><details className="px-side-panel"><summary>Kaynaklar ve çalışma kapsamı</summary><p>{feature?.available}</p>{feature?.needs.length>0&&<><h3>Bir sonraki bağlantılar</h3><ul>{feature.needs.map(need=><li key={need}><span/> {need}</li>)}</ul></>}<div className="px-private"><ShieldCheck size={18}/><p>{bootstrap?.ownership==='organization'?'Bu dosyalar yetkili işletme üyeleriyle paylaşılır.':'Bu dosyalar hesabına özeldir.'} Kaynak parsel ve sürüm bilgileri birlikte korunur.</p></div><button className="text-button" onClick={()=>onNavigate('integrations')}>Veri bağlantıları <ArrowRight size={16}/></button></details></div>
        </>}
      </>}
    </>}
    {editor&&field&&<DraftEditor kind={kind} field={field} record={editor} latestAnalysis={context?.latestAnalysis} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);setReload(n=>n+1);}}/>}
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
function Checks({context,onNavigate}) {
  const levels = { critical: 'Kritik', review: 'İnceleme', info: 'Bilgi' };
  return <div className="px-checks">{context.issues.length ? context.issues.map(issue =>
    <article key={issue.code + (issue.reference || '')}>
      <Info size={18} aria-hidden="true"/><div><small>{levels[issue.level]}</small><strong>{issue.title}</strong>
        <p>{issue.detail}</p>{issue.reference && <small title={issue.reference}>Kayıt {issue.reference.slice(0, 8)}</small>}</div>
      <button aria-label={issue.title + ' · ilgili modülü aç'} onClick={()=>onNavigate(issue.action,context.field.id)}><ArrowUpRight size={17}/></button>
    </article>) : <article><Check size={19}/><div><strong>Bu kayıt kontrollerinde işaret yok.</strong></div></article>}</div>;
}
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

function ScenarioComparison({records, chart, hectares}) {
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
      <thead><tr><th>Senaryo</th><th>Su (m³)</th><th>Gübre (kg)</th><th>İşçilik (sa)</th><th>Toplam</th>{chart && <><th>Hektar başına</th><th>Varsayımsal net etki</th></>}</tr></thead>
      <tbody>{active.map((record) => {
        const {currency, revenue, totalMinor} = record.calculation;
        return <tr key={record.id}>
        <th scope="row">{record.name}</th><td>{num(record.payload.waterM3)}</td>
        <td>{num(record.payload.fertilizerKg)}</td><td>{num(record.payload.laborHours)}</td><td>{money(record.calculation)}</td>
        {chart && <><td>{hectares > 0 ? money({currency, totalMinor:totalMinor / hectares}) : '—'}</td>
        <td>{revenue ? <details><summary>{money({currency,totalMinor:revenue.netMinor})}</summary>
          <p>Brüt gelir {money({currency,totalMinor:revenue.grossMinor})}</p>
          <p>Gelir ±%{num(revenue.sensitivityPercent)} iken net aralık {money({currency,totalMinor:revenue.lowNetMinor})} – {money({currency,totalMinor:revenue.highNetMinor})}</p>
          <p>Girdi kaynağı {revenue.source}</p></details> : 'Gelir varsayımı girilmedi'}</td></>}
      </tr>;
      })}</tbody>
    </table></div> : <div className="px-empty-inline">İlk senaryonu kaydettiğinde karşılaştırma burada oluşur.</div>}
    </div>
  </section>;
}
const investigationStates = {open:'Açık',in_progress:'Sahada',closed:'Kapandı'};
function RecordList({records,kind,busy,canWrite,onNew,onEdit,onCopy,onExport,onReview,onHistory}) {
  return <section className="px-surface px-section px-records">
    <header><div><h2>{kindLabels[kind]} dosyaları</h2><p>{records.length} çalışma kaydı · Sürümleri sunucuda saklanır.</p></div>
      <button className="primary" onClick={onNew} disabled={!canWrite}><Plus size={16}/> Yeni {kindLabels[kind]?.toLocaleLowerCase('tr-TR')}</button></header>
    {records.length ? <div className="px-record-list">{records.map(record=>{
      const {payload, calculation} = record;
      const summary = kind==='scenario' ? money(calculation) + (payload.assumptions ? ' · ' + payload.assumptions : '') :
        kind==='investigation' ? investigationStates[payload.state || 'open'] + ' · ' + payload.region :
        kind==='prescription' ? num(payload.rate) + ' ' + payload.unit + ' · ' + payload.scope :
        kind==='drone' ? payload.vendor.toUpperCase() + ' · ' + payload.model : payload.notes;
      return <article key={record.id}><div><span className="px-stage stage-foundation">{statuses[record.status]}</span><small>v{record.version} · {date(record.updatedAt)}</small></div>
        <h3>{record.name}</h3><p>{summary}</p>
        {kind==='investigation' && (payload.result || payload.analysisId) && <details><summary>İnceleme dayanağı</summary>
          {payload.analysisId && <p>Uydu analizi <code>{payload.analysisId}</code></p>}
          {payload.visitedAt && <p>Saha tarihi {payload.visitedAt}</p>}
          {payload.measurement && <p>{sensorMetrics[payload.measurement.metric].label} · {num(payload.measurement.value)} {sensorMetrics[payload.measurement.metric].unit}</p>}
          {payload.result && <p>{payload.result}</p>}</details>}
        {kind==='prescription' && calculation && <details><summary>Toplam {num(calculation.quantity)} {calculation.unit}</summary>
          <ul>{calculation.zones.map((zone,index)=><li key={index}>{zone.name} · {num(zone.hectares)} ha · {num(zone.quantity)} {calculation.unit}</li>)}</ul></details>}
        <footer><button onClick={()=>onEdit(record)} disabled={busy||!canWrite}>Düzenle</button>
          {onCopy && <button onClick={()=>onCopy(record)} disabled={busy||!canWrite}>Kopyala</button>}
          <button onClick={()=>onHistory(record)} disabled={busy}>Sürümler</button>
          <button onClick={()=>onExport(record)} disabled={busy}><Download size={14}/> İnceleme dosyası</button>
          {record.status==='draft'&&canWrite&&<button onClick={()=>onReview(record)} disabled={busy}>İnceleme iste <ArrowUpRight size={14}/></button>}</footer>
      </article>;
    })}</div> : <div className="px-empty-inline">Henüz dosya yok. Yeni kayıt oluşturduğunda kaynak parseli ve sürümü burada görünür.</div>}
  </section>;
}
function ObservationFields({ payload, geometry }) {
  const [category, setCategory] = useState(payload.category || 'crop');
  const [metric, setMetric] = useState(payload.sensor?.metric || 'soilMoisture');
  const sensor = category === 'sensor', infrastructure = category === 'irrigation';
  const needsPosition = sensor || infrastructure;
  const reading = sensorMetrics[metric];
  const coordinates = <div className="px-form-grid">
    <label>Enlem<input name="latitude" type="number" min="-85" max="85" step="any"
      defaultValue={payload.coordinate?.[1]} required={needsPosition} /></label>
    <label>Boylam<input name="longitude" type="number" min="-180" max="180" step="any"
      defaultValue={payload.coordinate?.[0]} required={needsPosition} /></label>
  </div>;
  return <>
    <label>Gözlem tarihi<input name="observedAt" type="date" defaultValue={payload.observedAt || ''} required /></label>
    <label>Gözlem türü<select name="category" value={category} onChange={event => setCategory(event.target.value)}>
      <option value="crop">Bitki</option><option value="soil">Toprak</option>
      <option value="water">Su</option><option value="other">Diğer</option>
      <option value="sensor" disabled={!geometry}>Sensör ölçümü</option>
      <option value="irrigation" disabled={!geometry}>Sulama altyapısı</option>
    </select></label>
    {sensor && <>
      <label>Cihaz kimliği<input name="device" defaultValue={payload.sensor?.device} required maxLength={150} /></label>
      <div className="px-form-grid">
        <label>Ölçüm türü<select name="metric" value={metric} onChange={event => setMetric(event.target.value)}>
          {Object.entries(sensorMetrics).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
        </select></label>
        <label>Ölçüm ({reading.unit})<input key={metric} name="reading" type="number" step="any"
          min={reading.min} max={reading.max} required
          defaultValue={payload.sensor?.metric === metric ? payload.sensor.value : undefined} /></label>
      </div>
    </>}
    {infrastructure && <label>Altyapı türü<select name="asset" defaultValue={payload.asset || 'valve'}>
      {Object.entries(irrigationAssets).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>}
    {geometry && (needsPosition ? coordinates : <details><summary>Konum ekle</summary>{coordinates}</details>)}
    {needsPosition && <p>Konumu parselin içinden WGS84 derece olarak gir. Bu kayıt elle girilir.</p>}
  </>;
}
function DraftEditor({kind,field,record,latestAnalysis,onClose,onSaved}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const ref=useDialogFocus(()=>{if(!busy)onClose();});
  const [application,setApplication]=useState(record.payload?.application||'irrigation');
  const p=record?.payload||{};
  async function submit(event) {
    event.preventDefault();setBusy(true);setError('');
    const form=new FormData(event.currentTarget),read=name=>String(form.get(name)||''),number=name=>Number(form.get(name));
    let payload;
    if(kind==='scenario') {
      payload = Object.fromEntries(['waterM3','waterUnitCost','fertilizerKg','fertilizerUnitCost','laborHours',
        'laborHourlyCost','otherCost','energyKwh','energyUnitCost','equipmentHours','equipmentHourlyCost'].map(name => [name, number(name)]));
      Object.assign(payload, {currency:read('currency'),assumptions:read('assumptions'),strategy:read('strategy') || undefined});
      if (['quantityKg','unitPrice','revenueSource','sensitivityPercent'].some(name => read(name))) {
        if (!['quantityKg','unitPrice','revenueSource','sensitivityPercent'].every(name => read(name).trim())) {
          setError('Gelir hesabı için miktar, fiyat, kaynak ve duyarlılık girin.');setBusy(false);return;
        }
        payload.revenue = {quantityKg:number('quantityKg'),unitPrice:number('unitPrice'),
          source:read('revenueSource'),sensitivityPercent:number('sensitivityPercent')};
      }
    }
    else if(kind==='investigation') {
      payload = {priority:read('priority'),region:read('region'),requestedData:read('requestedData'),notes:read('notes'),
        state:read('state'),result:read('result').trim() || undefined,visitedAt:read('visitedAt') || undefined,
        analysisId:read('analysisId') || undefined};
      if (read('longitude') || read('latitude')) {
        if (!read('longitude') || !read('latitude')) {
          setError('Konum için enlem ve boylamı birlikte girin.');setBusy(false);return;
        }
        payload.coordinate = [number('longitude'), number('latitude')];
      }
      if (read('device') || read('reading')) {
        if (!read('device').trim() || !read('reading')) {
          setError('Ölçüm için cihaz adı ve değer girin.');setBusy(false);return;
        }
        payload.measurement = { device:read('device'), metric:read('metric'), value:number('reading') };
      }
    }
    else if(kind==='prescription'){
      payload={application,rate:number('rate'),unit:application==='irrigation'?'m3/ha':'kg/ha',scope:read('scope'),notes:read('notes')};
      const zones=read('zones').trim();
      if(zones){
        try {
          const collection=JSON.parse(zones);
          if(collection?.type!=='FeatureCollection'||!Array.isArray(collection.features))
            throw new Error('GeoJSON FeatureCollection gerekli.');
          payload.zones=collection.features.map(item=>({name:item.properties?.name,rate:item.properties?.rate,geometry:item.geometry}));
        } catch {
          setError('Yönetim bölgeleri geçerli bir GeoJSON FeatureCollection olmalı.');
          setBusy(false);return;
        }
      }
    }
    else if(kind==='drone')payload={vendor:read('vendor'),model:read('model'),notes:read('notes')};
    else {
      payload={observedAt:read('observedAt'),category:read('category'),notes:read('notes')};
      if(read('longitude')||read('latitude')){
        if(!read('longitude')||!read('latitude')){
          setError('Gözlem noktası için enlem ve boylamı birlikte girin.');setBusy(false);return;
        }
        payload.coordinate=[number('longitude'),number('latitude')];
      }
      if (payload.category === 'sensor')
        payload.sensor = { device: read('device'), metric: read('metric'), value: number('reading') };
      if (payload.category === 'irrigation') payload.asset = read('asset');
    }
    try{await api(record.id?`platform/records/${record.id}`:'platform/records',{fieldId:field.id,kind,name:read('name'),payload,status:record.status||'draft',...(record.id?{version:record.version}:{})},record.id?'PATCH':'POST');onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const amount=(name,label)=><label key={name}>{label}<input name={name} type="number" min="0" max="100000000" step="any" defaultValue={p[name]??0} required/></label>;
  const text=(name,label,required=true)=><label key={name}>{label}<textarea name={name} defaultValue={p[name]||''} required={required} maxLength={name==='notes'&&kind==='observation'?4000:2000}/></label>;
  return <div className="modal-backdrop"><section ref={ref} className="px-editor" role="dialog" aria-modal="true" aria-labelledby="platform-editor-title"><header><div><span className="px-kicker">{field.name}</span><h2 id="platform-editor-title">{record.id?'Dosyayı düzenle':`Yeni ${kindLabels[kind]?.toLocaleLowerCase('tr-TR')}`}</h2></div><button aria-label="Dosya düzenleyicisini kapat" onClick={onClose} disabled={busy}><X size={21}/></button></header><form onSubmit={submit}><label>Dosya adı<input name="name" defaultValue={record.name||''} required maxLength={150}/></label>
    {kind==='scenario'&&<>
      <label>Strateji<select name="strategy" defaultValue={p.strategy || ''}>
        <option value="">Belirtilmedi</option><option value="irrigation">Sulama</option><option value="fertilization">Gübreleme</option>
        <option value="drought">Kuraklık</option><option value="weather">Hava koşulları</option><option value="management">Yönetim</option>
      </select></label>
      <div className="px-form-grid">{amount('waterM3','Su miktarı (m³)')}{amount('waterUnitCost','Su birim fiyatı / m³')}{amount('fertilizerKg','Gübre miktarı (kg)')}{amount('fertilizerUnitCost','Gübre birim fiyatı / kg')}{amount('laborHours','İşçilik (saat)')}{amount('laborHourlyCost','İşçilik saat ücreti')}{amount('otherCost','Diğer maliyet')}<label>Para birimi<select name="currency" defaultValue={p.currency||'TRY'}><option>TRY</option><option>EUR</option><option>USD</option></select></label></div>
      <details open={Boolean(p.energyKwh || p.equipmentHours)}><summary>Enerji ve ekipman</summary><div className="px-form-grid">
        {amount('energyKwh','Enerji (kWh)')}{amount('energyUnitCost','Enerji birim fiyatı / kWh')}
        {amount('equipmentHours','Ekipman (saat)')}{amount('equipmentHourlyCost','Ekipman saat ücreti')}
      </div></details>
      <details open={Boolean(p.revenue)}><summary>Gelir ve duyarlılık varsayımı</summary><div className="px-form-grid">
        <label>Varsayılan satış miktarı (kg)<input name="quantityKg" type="number" min="0" max="100000000" step="any" defaultValue={p.revenue?.quantityKg}/></label>
        <label>Varsayılan satış fiyatı / kg<input name="unitPrice" type="number" min="0" max="100000000" step="any" defaultValue={p.revenue?.unitPrice}/></label>
        <label>Gelir değişimi (%)<input name="sensitivityPercent" type="number" min="0" max="100" step="any" defaultValue={p.revenue?.sensitivityPercent}/></label>
        <label>Miktar ve fiyat kaynağı<input name="revenueSource" maxLength={600} defaultValue={p.revenue?.source}/></label>
      </div></details>
      {text('assumptions','Varsayımlar ve açıklama',false)}
    </>}
    {kind==='investigation'&&<>
      <div className="px-form-grid">
        <label>Öncelik<select name="priority" defaultValue={p.priority||'normal'}><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option></select></label>
        <label>Durum<select name="state" defaultValue={p.state||'open'}>{Object.entries(investigationStates).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label>Saha tarihi<input name="visitedAt" type="date" defaultValue={p.visitedAt}/></label>
        <label>Uydu analizi<select name="analysisId" defaultValue={p.analysisId || ''}><option value="">Bağlantı yok</option>
          {p.analysisId && p.analysisId !== latestAnalysis?.id && <option value={p.analysisId}>Kayıtlı analiz · {p.analysisId.slice(0,8)}</option>}
          {latestAnalysis && <option value={latestAnalysis.id}>Son analiz · {latestAnalysis.source} · {date(latestAnalysis.fetchedAt)}</option>}
        </select></label>
      </div>
      {text('region','Kontrol edilecek bölge')}{text('requestedData','İstenen veri veya saha kontrolü')}{text('notes','İnceleme notu',false)}{text('result','Saha sonucu',false)}
      <details open={Boolean(p.coordinate || p.measurement)}><summary>Saha konumu ve ölçüm</summary><div className="px-form-grid">
        {field.geometry && <>
          <label>Boylam (WGS84)<input name="longitude" type="number" step="any" min="-180" max="180" defaultValue={p.coordinate?.[0]}/></label>
          <label>Enlem (WGS84)<input name="latitude" type="number" step="any" min="-85" max="85" defaultValue={p.coordinate?.[1]}/></label>
        </>}
        <label>Ölçüm cihazı<input name="device" maxLength={150} defaultValue={p.measurement?.device}/></label>
        <label>Ölçüm türü<select name="metric" defaultValue={p.measurement?.metric || 'soilMoisture'}>{Object.entries(sensorMetrics).map(([id,metric])=><option key={id} value={id}>{metric.label} ({metric.unit})</option>)}</select></label>
        <label>Ölçüm değeri<input name="reading" type="number" step="any" defaultValue={p.measurement?.value}/></label>
      </div></details>
    </>}
    {kind==='prescription'&&<><div className="px-form-grid"><label>Uygulama<select name="application" aria-label="Uygulama türü" value={application} onChange={event=>setApplication(event.target.value)}><option value="irrigation">Sulama</option><option value="fertilization">Gübreleme</option></select></label><label>Birim<input readOnly value={application==='irrigation'?'m³/ha':'kg/ha'} /></label>{amount('rate','Uzman incelemesine sunulan oran')}</div>{text('scope','Kapsam ve ihtiyaç bölgesi açıklaması')}{text('notes','Uzman için not',false)}
      <details><summary>Yönetim bölgeleri ekle</summary>
        <label>Yönetim bölgeleri (GeoJSON)<small>WGS84 FeatureCollection. Her Polygon veya MultiPolygon için properties.name ve sayısal properties.rate girin. Oran, yukarıdaki uygulama birimini kullanır.</small>
          <textarea name="zones" rows={5} maxLength={190000} defaultValue={p.zones?.length?JSON.stringify({type:'FeatureCollection',features:p.zones.map(({geometry,name,rate})=>({type:'Feature',geometry,properties:{name,rate}}))},null,2):''}/>
        </label>
      </details><Notice>Bu dosya uzman onayı değildir ve cihazda uygulanabilir görev oluşturmaz.</Notice></>}
    {kind==='drone'&&<><label>Hedef sistem<select name="vendor" defaultValue={p.vendor||'dji'}><option value="dji">DJI Agras</option><option value="xag">XAG</option><option value="generic">Diğer</option></select></label><label>Cihaz modeli<input name="model" defaultValue={p.model||''} required maxLength={150}/></label>{text('notes','Uyumluluk ve aktarım notları',false)}<Notice>Kaydedilen profil bir bağlantı veya çalıştırılabilir uçuş dosyası değildir.</Notice></>}
    {kind==='observation'&&<><ObservationFields payload={p} geometry={field.geometry}/>{text('notes','Saha gözlemi')}
      <Notice>Bu bilgi kullanıcı saha kaydıdır; otomatik doğrulanmış ölçüm olarak etiketlenmez.</Notice></>}
    {error&&<p className="error" role="alert">{error}</p>}<footer><button className="secondary" type="button" onClick={onClose} disabled={busy}>Vazgeç</button><button className="primary" disabled={busy}>{busy?'Kaydediliyor…':'Dosyayı kaydet'} <Check size={16}/></button></footer></form></section></div>;
}
function RevisionDialog({value,onClose}) {const ref=useDialogFocus(onClose);return <div className="modal-backdrop"><section ref={ref} className="px-editor" role="dialog" aria-modal="true" aria-labelledby="revision-title"><header><h2 id="revision-title">{value.name} · Sürümler</h2><button aria-label="Sürümleri kapat" onClick={onClose}><X size={20}/></button></header><ol className="px-revisions">{value.revisions.map(record=><li key={record.version}><span>v{record.version}</span><div><strong>{record.name}</strong><p>{date(record.updatedAt)} · {statuses[record.status]}</p><small>Parsel sınırı: {record.fieldSnapshot.geometryHash.slice(0,16)}</small></div></li>)}</ol></section></div>;}

import { randomBytes, createHash } from 'node:crypto';
import { platformFeatures, sourceAdapters, droneAdapters } from '../shared/platform.js';
import { parseDraft, scenarioTotals } from '../shared/platform-contracts.js';
import { satelliteStatus } from './satellite.js';
import { geometryHash } from './analysis-jobs.js';
import { availableMetrics } from '../shared/metrics.js';
import { validateManagementZones } from './management-zones.js';
import { containsPoint } from '../shared/spatial.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const stamp=()=>new Date().toISOString();
const id=()=>randomBytes(16).toString('hex');
export async function createPlatformService(db, { ownership = 'account_private' } = {}) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS platform_records(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,field_id TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS platform_records_owner ON platform_records(user_id,field_id,updated_at);
    CREATE TABLE IF NOT EXISTS platform_revisions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,record_id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS platform_revision_unique ON platform_revisions(record_id,version);
  `);
  async function ownField(tx,userId,fieldId) {
    const row=await tx.prepare("SELECT id,body FROM records WHERE id=? AND user_id=? AND kind='field'").get(fieldId,userId);
    if(!row) throw fail('Parsel bulunamadı.',404);
    const value=JSON.parse(row.body);
    if(value.deletedAt) throw fail('Parsel kaldırılmış.',404);
    return {...value,id:row.id};
  }
  function publicRecord(row) {
    const body=JSON.parse(row.body);
    return {id:row.id,fieldId:row.field_id,kind:row.kind,name:row.name,status:row.status,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,...body,...(row.kind==='scenario'?{calculation:scenarioTotals(body.payload)}:{})};
  }
  async function records(userId,fieldId) {
    await ownField(db,userId,fieldId);
    return (await db.prepare('SELECT * FROM platform_records WHERE user_id=? AND field_id=? ORDER BY updated_at DESC LIMIT 250').all(userId,fieldId)).map(publicRecord);
  }
  async function save(userId,input,recordId,actorId=userId) {
    let value;
    try { value=parseDraft(input); } catch { throw fail('Taslak alanları veya birimleri geçersiz. Gerekli alanları kontrol edin.'); }
    if(value.kind==='scenario') scenarioTotals(value.payload);
    return db.transaction(async tx=>{
      const field=await ownField(tx,userId,value.fieldId);
      if (value.kind === 'prescription') {
        try { validateManagementZones(value.payload.zones, field.geometry); }
        catch (error) { throw fail(error.message); }
      }
      if (value.kind === 'observation' && value.payload.coordinate &&
          (!field.geometry || !containsPoint(field.geometry, value.payload.coordinate)))
        throw fail('Gözlem noktası kayıtlı parsel sınırının içinde olmalı.');
      const existing=recordId?await tx.prepare('SELECT * FROM platform_records WHERE id=? AND user_id=?').get(recordId,userId):null;
      if(recordId&&!existing) throw fail('Dosya bulunamadı.',404);
      if(existing&&(existing.field_id!==value.fieldId||existing.kind!==value.kind)) throw fail('Dosyanın parseli veya türü değiştirilemez.');
      if(existing&&existing.version!==value.version) throw fail('Dosya başka bir işlemde değişti. Yenileyip tekrar deneyin.',409);
      if(existing&&JSON.parse(existing.body).fieldSnapshot.geometryHash!==geometryHash(field.geometry)) throw fail('Parsel sınırı bu dosyadan sonra değişmiş. Kaynağı korumak için güncel sınırla yeni dosya oluşturun.',409);
      if(!existing) {
        const count=await tx.prepare('SELECT COUNT(*) AS count FROM platform_records WHERE user_id=? AND field_id=?').get(userId,value.fieldId);
        if(Number(count.count)>=250) throw fail('Bu parsel için 250 dosya sınırına ulaşıldı.',409);
      }
      const record={id:existing?.id||id(),user_id:userId,field_id:value.fieldId,kind:value.kind,name:value.name,status:value.status,version:(existing?.version||0)+1,created_at:existing?.created_at||stamp(),updated_at:stamp()};
      record.body=JSON.stringify({createdBy:existing?JSON.parse(existing.body).createdBy:actorId,updatedBy:actorId,payload:value.payload,fieldSnapshot:{id:field.id,name:field.name,area:field.area,geometry:field.geometry||null,geometryHash:geometryHash(field.geometry)},review:{approval:'not_approved',machineExecution:false}});
      if(existing) {
        const result=await tx.prepare('UPDATE platform_records SET name=?,status=?,version=?,body=?,updated_at=? WHERE id=? AND user_id=? AND version=?').run(record.name,record.status,record.version,record.body,record.updated_at,record.id,userId,value.version);
        if(result.changes!==1) throw fail('Dosya sürümü değişti.',409);
      } else await tx.prepare('INSERT INTO platform_records(id,user_id,field_id,kind,name,status,version,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(record.id,userId,record.field_id,record.kind,record.name,record.status,record.version,record.body,record.created_at,record.updated_at);
      await tx.prepare('INSERT INTO platform_revisions(id,user_id,record_id,version,body,created_at) VALUES(?,?,?,?,?,?)').run(id(),userId,record.id,record.version,JSON.stringify(publicRecord(record)),record.updated_at);
      return publicRecord(record);
    });
  }
  async function fieldContext(userId,fieldId) {
    const field=await ownField(db,userId,fieldId),hash=geometryHash(field.geometry);
    const rows=await db.prepare('SELECT id,state,created_at,finished_at,geometry_hash,result,error FROM analysis_jobs WHERE user_id=? AND field_id=? ORDER BY created_at DESC LIMIT 50').all(userId,fieldId);
    const latest=rows.find(row=>row.state==='completed'&&row.geometry_hash===hash&&row.result);
    const analysis=latest?JSON.parse(latest.result):null;
    const issues=[];
    if(!field.geometry) issues.push({code:'boundary_missing',level:'review',title:'Parsel sınırı eksik',detail:'Konuma bağlı analiz için sınır çizilmeli.',action:'fields'});
    if(!field.crop) issues.push({code:'crop_missing',level:'info',title:'Ürün bilgisi eksik',detail:'Ürün ve sezon yorumu için saha kaydını tamamlayın.',action:'fields'});
    if(!analysis) issues.push({code:'observation_missing',level:'review',title:'Güncel sınır için tamamlanmış analiz yok',detail:'Uydu değerlendirmesi henüz yapılamaz.',action:'fields'});
    if(rows.some(row=>row.state==='completed'&&row.geometry_hash!==hash)) issues.push({code:'geometry_changed',level:'review',title:'Farklı parsel sınırıyla alınmış gözlemler var',detail:'Bu kayıtlar mevcut alanla eşdeğer kabul edilmez; tarihçede saklanır.',action:'history'});
    if(rows[0]?.state==='failed') issues.push({code:'analysis_failed',level:'review',title:'Son analiz tamamlanamadı',detail:'Yeni sonuç varmış gibi değerlendirme yapılmaz.',action:'history'});
    const comparison=Object.entries(analysis?.comparison||{}).filter(([,item])=>item&&Number.isFinite(item.current?.mean)&&Number.isFinite(item.previous?.mean)).map(([metric,item])=>({metric,current:item.current.mean,previous:item.previous.mean,delta:item.current.mean-item.previous.mean,currentCoverage:item.current.meanCoverage??null,previousCoverage:item.previous.meanCoverage??null}));
    return {field,geometryHash:hash,generatedAt:stamp(),issues,comparison,latestAnalysis:analysis?{id:latest.id,source:analysis.source,method:analysis.method,range:analysis.range,fetchedAt:analysis.fetchedAt,observationCount:analysis.observations?.length||0,minimumCoverage:analysis.minimumCoverage}:null,history:rows.map(row=>{const value=row.result?JSON.parse(row.result):null;return {id:row.id,state:row.state,createdAt:row.created_at,finishedAt:row.finished_at,geometryHash:row.geometry_hash,comparable:row.geometry_hash===hash,source:value?.source||null,range:value?.range||null,observationCount:value?.observations?.length||0,error:row.error||null};}),limitations:['Parsel özeti, kalibre edilmiş tarımsal simülasyon modeli değildir.','İndeks değişimi gözlemseldir; müdahalenin etkisini veya hastalık nedenini kanıtlamaz.','Eksik ölçümler sıfır kabul edilmez.']};
  }
  async function spatialCatalog(userId, fieldId) {
    const field = await ownField(db, userId, fieldId);
    const hash = geometryHash(field.geometry);
    const rows = await db.prepare(
      "SELECT id,result FROM analysis_jobs WHERE user_id=? AND field_id=? AND geometry_hash=? AND state='completed' ORDER BY created_at DESC,id DESC LIMIT 20"
    ).all(userId, fieldId, hash);
    const byDate = new Map();
    for (const row of rows) {
      if (!row.result) continue;
      const analysis = JSON.parse(row.result);
      if (analysis.method !== "s2-l2a-v3" || !["cdse", "sentinelhub"].includes(analysis.provider)) continue;
      const supported = availableMetrics(analysis.provider);
      const observations = (analysis.observations || []).map(day => ({
        from: Date.parse(day.from), to: Date.parse(day.to),
        metrics: Object.fromEntries(supported
          .filter(metric => Number.isFinite(day.stats?.[metric.id]?.mean))
          .map(metric => [metric.id, day.stats[metric.id].mean])),
      }));
      for (const scene of analysis.scenes || []) {
        const timestamp = scene.properties?.datetime;
        if (typeof timestamp !== "string") continue;
        const date = timestamp.slice(0, 10), instant = Date.parse(timestamp);
        if (byDate.has(date)) continue;
        const day = observations.find(observation => instant >= observation.from && instant < observation.to);
        if (!day || !Object.keys(day.metrics).length) continue;
        byDate.set(date, { id: row.id, date, metrics: day.metrics, source: analysis.source,
          provider: analysis.provider, method: analysis.method });
      }
    }
    return { geometryHash: hash, observations: [...byDate.values()]
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 180) };
  }
  async function bundle(userId,fieldId) {
    const context=await fieldContext(userId,fieldId),saved=await records(userId,fieldId);
    const revisions=await db.prepare('SELECT r.record_id,r.version,r.created_at FROM platform_revisions r JOIN platform_records p ON p.id=r.record_id WHERE r.user_id=? AND p.user_id=? AND p.field_id=? ORDER BY r.created_at DESC LIMIT 1000').all(userId,userId,fieldId);
    const content={schema:'agromax.evidence-bundle.v1',usage:'review_only',certified:false,machineExecution:false,context,records:saved,revisions};
    return {...content,integrity:{algorithm:'SHA-256',digest:createHash('sha256').update(JSON.stringify(content)).digest('hex'),scope:'Üstteki içerik; bağımsız doğrulama veya dijital imza değildir.'}};
  }
  async function routes({req,body,session,reply,res}) {
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/api/platform/')) return false;
    try {
      const spatial = url.pathname.match(/^\/api\/platform\/fields\/([a-f0-9]{32})\/spatial$/);
      if (spatial && req.method === "GET") {
        reply(200, await spatialCatalog(session.id, spatial[1]));
        return true;
      }
      const archive = url.pathname.match(/^\/api\/platform\/fields\/([a-f0-9]{32})\/spatial\/earth-search(?:\/(raster))?$/);
      if (archive && req.method === "GET") {
        const field = await ownField(db, session.id, archive[1]);
        const hash = geometryHash(field.geometry);
        if (!field.geometry) throw fail("Önce parsel sınırını kaydet.", 422);
        if (hash !== url.searchParams.get("geometry"))
          throw fail("Parsel sınırı değişti. Çalışma alanını yeniden aç.", 409);
        const { searchOpenSentinel, readOpenSentinel } = await import("./open-sentinel.js");
        const data = archive[2]
          ? await readOpenSentinel(field.geometry, url.searchParams.get("scene"), url.searchParams.get("layer"))
          : await searchOpenSentinel(field.geometry, url.searchParams.get("month"));
        reply(200, { ...data, geometryHash: hash });
        return true;
      }
      if(url.pathname==='/api/platform/bootstrap'&&req.method==='GET') {
        const counts=await db.prepare('SELECT kind,COUNT(*) AS count FROM platform_records WHERE user_id=? GROUP BY kind').all(session.id);
        const satellite = satelliteStatus();
        const sources = sourceAdapters.map((source) => {
          if (source.id === 'sentinel2')
            return {...source, state:satellite.configured?'configured':'unconfigured'};
          if (ownership === 'organization' && source.id === 'sentinel1')
            return {...source, state:satellite.configured && satellite.provider === 'cdse'?'configured':'unconfigured',
              detail:'CDSE yörüngesine göre VV/VH ve radar kalite istatistikleri. Gerçek sağlayıcı kabulü ayrı doğrulanır.'};
          if (ownership === 'organization' && source.id === 'landsat')
            return {...source, state:process.env.AGROMAX_LANDSAT_AWS_ENABLED === 'true'?'configured':'catalog',
              detail:'USGS kataloğunda yüzey yansıtımı ve sıcaklığı. Piksel işlemesi için yetkili COG erişimi gerekir.'};
          return source;
        });
        reply(200,{schemaVersion:1,features:platformFeatures,sources,drones:droneAdapters,counts:Object.fromEntries(counts.map(row=>[row.kind,Number(row.count)])),capabilities:{predictiveTwin:false,aiAnomalyModel:false,machinePrescription:false,certifiedMrv:false,draftPersistence:true,scenarioArithmetic:true},ownership});return true;
      }
      const fieldRoute=url.pathname.match(/^\/api\/platform\/fields\/([a-f0-9]{32})(?:\/(export))?$/);
      if(fieldRoute&&req.method==='GET') {
        if(fieldRoute[2]) {res.setHeader('Content-Disposition',`attachment; filename="agromax-evidence-${fieldRoute[1]}.json"`);reply(200,await bundle(session.id,fieldRoute[1]));}
        else reply(200,{context:await fieldContext(session.id,fieldRoute[1]),records:await records(session.id,fieldRoute[1])});
        return true;
      }
      if(url.pathname==='/api/platform/records'&&req.method==='POST') {reply(201,{record:await save(session.id,body,undefined,session.actorId||session.id)});return true;}
      const recordRoute=url.pathname.match(/^\/api\/platform\/records\/([a-f0-9]{32})(?:\/(revisions|export))?$/);
      if(recordRoute) {
        const row=await db.prepare('SELECT * FROM platform_records WHERE id=? AND user_id=?').get(recordRoute[1],session.id);
        if(!row) throw fail('Dosya bulunamadı.',404);
        await ownField(db,session.id,row.field_id);
        if(req.method==='PATCH'&&!recordRoute[2]) {reply(200,{record:await save(session.id,body,row.id,session.actorId||session.id)});return true;}
        if(req.method==='GET') {
          if(recordRoute[2]==='revisions') reply(200,{revisions:(await db.prepare('SELECT body FROM platform_revisions WHERE record_id=? AND user_id=? ORDER BY version DESC').all(row.id,session.id)).map(item=>JSON.parse(item.body))});
          else if(recordRoute[2]==='export') {const field=await ownField(db,session.id,row.field_id);res.setHeader('Content-Disposition',`attachment; filename="agromax-review-${row.id}.json"`);reply(200,{schema:'agromax.review.v1',usage:'review_only',machineExecution:false,expertApproval:'not_approved',geometryChanged:publicRecord(row).fieldSnapshot.geometryHash!==geometryHash(field.geometry),record:publicRecord(row)});}
          else reply(200,{record:publicRecord(row)});
          return true;
        }
      }
      reply(404,{error:'Platform yolu veya işlem türü desteklenmiyor.'});
    } catch(error) {reply(error.status||500,{error:error.status?error.message:'Platform verisi işlenemedi.'});}
    return true;
  }
  return {routes,save,records,fieldContext,bundle};
}

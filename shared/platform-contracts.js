import { z } from 'zod';
const amount = z.number().finite().min(0).max(1e8);
export const draftKinds = ['scenario','investigation','prescription','drone','observation'];
const payloads = {
  scenario:z.object({ waterM3:amount, waterUnitCost:amount, fertilizerKg:amount, fertilizerUnitCost:amount, laborHours:amount, laborHourlyCost:amount, otherCost:amount, currency:z.enum(['TRY','EUR','USD']), assumptions:z.string().max(2000).default('') }).strict(),
  investigation:z.object({ priority:z.enum(['low','normal','high']), region:z.string().min(1).max(1000), requestedData:z.string().min(1).max(2000), notes:z.string().max(2000).default('') }).strict(),
  prescription:z.object({ application:z.enum(['irrigation','fertilization']), rate:amount, unit:z.enum(['m3/ha','kg/ha']), scope:z.string().min(1).max(2000), notes:z.string().max(2000).default('') }).strict().refine(p => p.application === 'irrigation' ? p.unit === 'm3/ha' : p.unit === 'kg/ha', 'Uygulama ve birim uyumsuz.'),
  drone:z.object({ vendor:z.enum(['dji','xag','generic']), model:z.string().min(1).max(150), notes:z.string().max(2000).default('') }).strict(),
  observation:z.object({ observedAt:z.iso.date(), category:z.enum(['crop','soil','water','other']), notes:z.string().min(1).max(4000) }).strict(),
};
export const draftEnvelope = z.object({ fieldId:z.string().regex(/^[a-f0-9]{32}$/), kind:z.enum(draftKinds), name:z.string().trim().min(1).max(150), status:z.enum(['draft','review_requested','archived']).default('draft'), payload:z.unknown(), version:z.number().int().positive().optional() }).strict();
export function parseDraft(input) {
  const value=draftEnvelope.parse(input);
  return {...value,payload:payloads[value.kind].parse(value.payload)};
}
export function scenarioTotals(payload) {
  const p=payloads.scenario.parse(payload);
  const lines={water:Math.round(p.waterM3*p.waterUnitCost*100),fertilizer:Math.round(p.fertilizerKg*p.fertilizerUnitCost*100),labor:Math.round(p.laborHours*p.laborHourlyCost*100),other:Math.round(p.otherCost*100)};
  const totalMinor=Object.values(lines).reduce((sum,value)=>sum+value,0);
  if(!Number.isSafeInteger(totalMinor) || totalMinor>1e12) throw Object.assign(new Error('Toplam maliyet desteklenen sınırı aşıyor.'),{status:400});
  return {currency:p.currency,lines,totalMinor,method:'Girilen miktar × birim fiyat; her kalem kuruşa yuvarlanır.',prediction:false};
}

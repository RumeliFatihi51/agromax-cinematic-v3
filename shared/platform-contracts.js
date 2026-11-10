import { z } from 'zod';
import { irrigationAssets, sensorMetrics } from './field-observations.js';
const amount = z.number().finite().min(0).max(1e8);
const position = z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]);
const polygon = z.array(z.array(position).min(4).max(2500)).min(1).max(30);
const zone = z.object({
  name: z.string().trim().min(1).max(120),
  rate: amount,
  geometry: z.discriminatedUnion("type", [
    z.object({ type: z.literal("Polygon"), coordinates: polygon }).strict(),
    z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygon).min(1).max(30) }).strict(),
  ]),
}).strict();
const observation = { observedAt: z.iso.date(), notes: z.string().min(1).max(4000) };
const sensor = z.object({
  device: z.string().trim().min(1).max(150),
  metric: z.enum(Object.keys(sensorMetrics)),
  value: z.number().finite(),
}).strict().refine(({ metric, value }) =>
  value >= sensorMetrics[metric].min && value <= sensorMetrics[metric].max,
);
export const draftKinds = ['scenario','investigation','prescription','drone','observation'];
const payloads = {
  scenario:z.object({ waterM3:amount, waterUnitCost:amount, fertilizerKg:amount, fertilizerUnitCost:amount, laborHours:amount, laborHourlyCost:amount, otherCost:amount, currency:z.enum(['TRY','EUR','USD']), assumptions:z.string().max(2000).default('') }).strict(),
  investigation:z.object({ priority:z.enum(['low','normal','high']), region:z.string().min(1).max(1000), requestedData:z.string().min(1).max(2000), notes:z.string().max(2000).default('') }).strict(),
  prescription:z.object({ application:z.enum(['irrigation','fertilization']), rate:amount, unit:z.enum(['m3/ha','kg/ha']), scope:z.string().min(1).max(2000), notes:z.string().max(2000).default(''), zones:z.array(zone).max(24).optional() }).strict().refine(p => p.application === 'irrigation' ? p.unit === 'm3/ha' : p.unit === 'kg/ha', 'Uygulama ve birim uyumsuz.'),
  drone:z.object({ vendor:z.enum(['dji','xag','generic']), model:z.string().min(1).max(150), notes:z.string().max(2000).default('') }).strict(),
  observation:z.discriminatedUnion('category', [
    z.object({ ...observation, category: z.enum(['crop','soil','water','other']), coordinate: position.optional() }).strict(),
    z.object({ ...observation, category: z.literal('sensor'), coordinate: position, sensor }).strict(),
    z.object({ ...observation, category: z.literal('irrigation'), coordinate: position,
      asset: z.enum(Object.keys(irrigationAssets)) }).strict(),
  ]),
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

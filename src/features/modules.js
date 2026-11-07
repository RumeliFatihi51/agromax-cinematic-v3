import { platformFeatures, platformPages } from '../../shared/platform.js';
export const modules = [
  ['overview','Genel bakış','LayoutDashboard','green'],
  ['platform','Platform merkezi','Layers3','green'],
  ['fields','Parseller ve analiz','Sprout','green'],
  ...platformFeatures.filter(feature=>feature.id!=='fields').map(feature=>[feature.id,feature.title,feature.icon,feature.group==='assure'?'blue':'green']),
  ['history','Analiz geçmişi','History','green'],
  ['weather','Hava durumu','CloudSun','blue'],
  ['tasks','Takvim & görevler','CalendarDays','orange'],
  ['operations','Sezon ve saha','Leaf','green'],
  ['finance','Maliyet yönetimi','Wallet','purple'],
  ['reports','Raporlar','ChartNoAxesCombined','blue'],
  ['notifications','Bildirimler','Bell','green'],
  ['assistant','Filiz','Sprout','green'],
  ['integrations','Veri bağlantıları','Cable','purple'],
  ['settings','Hesap ve işletme','ShieldCheck','green'],
];
const legacyPages=new Set(['overview','fields','history','weather','tasks','notifications','assistant','integrations',...platformPages]);
export const availableModules=(commercial=false)=>commercial?modules:modules.filter(([id])=>legacyPages.has(id));
export const navigationGroups = [
  {id:'observe',label:'Gözlem ve arazi',pages:['fields','satellite','twin','temporal','intelligence','weather','history']},
  {id:'decide',label:'Karar ve uygulama',pages:['scenarios','economics','prescriptions','drones','tasks','operations','finance']},
  {id:'assure',label:'Doğrulama ve rapor',pages:['evidence','contradictions','investigation','mrv','reports','access']},
];
export const operationPages=['seasons','irrigation','nutrition','protection','soil','evaluations'];
export const canonicalPage=id=>operationPages.includes(id)?'operations':id;

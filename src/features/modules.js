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
  {id:'observe',label:'Araziler ve gözlem',pages:['fields','satellite','temporal','weather','history']},
  {id:'intelligence',label:'Zekâ ve analiz',pages:['intelligence','evidence','contradictions','investigation']},
  {id:'decide',label:'Dijital ikiz ve kararlar',pages:['twin','scenarios','economics','finance']},
  {id:'operate',label:'Operasyon ve uygulama',pages:['tasks','operations','prescriptions','drones']},
  {id:'assure',label:'Raporlama ve doğrulama',pages:['reports','mrv','access']},
];
export const operationPages=['seasons','irrigation','nutrition','protection','soil','evaluations'];
export const canonicalPage=id=>operationPages.includes(id)?'operations':id;

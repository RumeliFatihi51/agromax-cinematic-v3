import { useState } from "react";
import { ArrowUpRight, CloudSun } from "lucide-react";
import { ReferenceParcels, SceneCards, SceneLeaders, WeatherBand, sceneSlots } from "./StudioOverlay";
import { useMedia } from "./SpatialWorkbench";

const stages = [
  ["Toprak hazırlığı", "28 Ağu", "Tohum yatağı hazırlandı"],
  ["Ekim", "4 Eyl", "Ekim kaydı oluşturuldu"],
  ["Çıkış", "13 Eyl", "İlk yapraklar gözlendi"],
  ["Vejetatif gelişim", "28 Eyl", "Yaprak ve kardeşlenme gelişimi"],
  ["Sapa kalkma", "14 Eki", "Sap ve boğum gelişimi"],
  ["Başaklanma", "30 Eki", "Başaklar görünür"],
  ["Olgunlaşma", "13 Kas", "Tane olgunlaşması"],
  ["Hasat", "2 Ara", "Hasat dönemi"],
];
const exampleTasks = [
  { id: "1", name: "Hasat hazırlığı", date: "3–6 May" },
  { id: "2", name: "Saha kontrolü", date: "6 May" },
  { id: "3", name: "Toprak örnekleme", date: "8 May" },
];
const zoneNames = ["Yüksek canlılık", "Geçiş bölgesi", "Düşük canlılık"];
const hectares = [4.29, 3.18, 2.62];
const details = {
  season: ["Büyüme ve sezon", "Zaman çizgisinden bir evre seçerek sahadaki kayıt akışını inceleyebilirsin."],
  zones: ["Uygulama oranları", "Örnek bölge oranları değiştikçe toplam planlanan su hacmi yeniden hesaplanır."],
  change: ["İndeks değişimi", "Önce ve Sonra arasında geçerek örnek indeks yüzeyindeki değişimi incele."],
  index: ["İndeks ölçümü", "Renk ölçeğinden bir aralık seçerek örnek yüzeyi vurgula."],
  tasks: ["Faaliyetler", "Bu sahnedeki faaliyetler etkileşimi göstermek için hazırlanmış örnek kayıtlardır."],
};
const points = Object.fromEntries(sceneSlots.map(slot => [slot.id, slot.anchor]));
const format = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export default function StudioReference({ onLive, empty }) {
  const mobile = useMedia("(max-width: 760px)");
  const [stage, setStage] = useState(3);
  const [rates, setRates] = useState([70, 80, 20]);
  const [band, setBand] = useState(6);
  const [before, setBefore] = useState(false);
  const [selected, setSelected] = useState("");
  const toggle = id => setSelected(old => old === id ? "" : id);
  const season = { labels: stages.map(item => item[0]), selected: stage, title: stages[stage][0], date: stages[stage][1], caption: stages[stage][2] };
  const zones = {
    rows: zoneNames.map((name, i) => ({ name, detail: format.format(hectares[i]) + " ha", rate: rates[i] })),
    unit: "m³/ha",
    footer: { label: "Planlanan su", value: format.format(rates.reduce((total, rate, i) => total + Number(rate) * hectares[i], 0)) + " m³" },
  };
  const change = { metric: "NDVI", beforeDate: "11 Haz", afterDate: "13 Haz", before: 0.75, after: 0.45, delta: -0.30 };
  const index = { metric: "NDVI", value: before ? 0.55 : 0.70, series: [0.25, 0.44, 0.7, 0.42, 0.33], band };
  return <div className="field-studio-scene scene-reference" data-before={before} aria-label="Örnek panorama">
    <div className="scene-photo" aria-hidden="true" />
    <ReferenceParcels {...{ selected, before, band, mobile }} onSelect={toggle} />
    <h1 className="sr-only">3D Saha Stüdyosu</h1>
    <div className="scene-view-actions">
      <button type="button" onClick={() => setBefore(!before)} aria-label={before ? "Sonra görünümüne geç" : "Önce görünümüne geç"}>{before ? "Önce" : "Sonra"}</button>
    </div>
    <WeatherBand values={{ temperature: 17, rain: 0.3, humidity: 44, cloud: 3, wind: 1 }}
      condition="Parçalı bulutlu" Icon={CloudSun} />
    <SceneLeaders points={points} selected={selected} onSelect={toggle} />
    <SceneCards {...{ season, zones, change, index, selected }} tasks={{ rows: exampleTasks }} onOpen={toggle} onStage={setStage}
      onRate={(i, rate) => setRates(old => old.map((value, index) => index === i ? rate === "" ? "" : Math.max(0, Math.min(999, Number(rate))) : value))} onPalette={setBand} />
    {selected && <div className="scene-reference-info" role="status">
      <strong>{details[selected][0]}</strong><p>{details[selected][1]}</p>
      <button type="button" onClick={() => setSelected("")} aria-label="Örnek açıklamayı kapat">×</button>
    </div>}
    <div className="scene-reference-footer">
      <span>Örnek panorama · Gösterim verisi</span>
      <button type="button" onClick={onLive}>{empty ? "Parsel çiz" : "Canlı parsellerim"} <ArrowUpRight size={15} /></button>
    </div>
  </div>;
}

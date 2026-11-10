import { openSentinelMetrics } from "../../../shared/open-sentinel";

const format = value => Number.isFinite(value)
  ? value.toLocaleString("tr-TR", { maximumFractionDigits: 3 }) : "—";
const date = value => new Date(value).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
const priority = ["NDVI", "NDRE", "NDMI", "NDWI", "EVI", "WDRVI"];
const sourceLabels = { radar: "Sentinel‑1 radar", landsat: "Landsat 8/9" };
const measurementLabels = {
  LST: "Yüzey sıcaklığı", VV: "Radar geri saçılımı (VV)", VH: "Radar geri saçılımı (VH)",
  "VV/VH": "Radar bantları oranı (VV/VH)", red: "Kırmızı bant", green: "Yeşil bant",
  blue: "Mavi bant", coastal: "Kıyı / aerosol bandı", nir08: "Yakın kızılötesi",
  swir16: "Kısa dalga kızılötesi 1", swir22: "Kısa dalga kızılötesi 2",
};

export default function AnalysisReport({ analysis, onAssistant }) {
  const { interpretation, supplementary } = analysis.report ?? {};
  const optical = priority.flatMap(id => {
    const row = analysis.comparison?.[id];
    return row?.current || row?.previous ? [{ id, ...row }] : [];
  });
  return (
    <section className="panel parcel-analysis-report" aria-label="Parsel sonuç raporu">
      <h2>Parsel sonuç raporu</h2>
      <p>{analysis.source} · {date(analysis.fetchedAt)}</p>
      {interpretation ? (
        <>
          <h3>Filiz’in değerlendirmesi</h3>
          <p>{interpretation.overview}</p>
          <ul>{interpretation.findings.map(({ indicators, explanation }, index) => (
            <li key={index}><strong>{indicators.join(", ")}</strong> · {explanation}</li>
          ))}</ul>
          {interpretation.fieldChecks.length > 0 && <>
            <h3>Sahada bakılacak noktalar</h3>
            <ul>{interpretation.fieldChecks.map((check, index) => <li key={index}>{check}</li>)}</ul>
          </>}
        </>
      ) : <p>{analysis.report ? "Filiz bu kayıt için bir yorum üretemedi. Ölçümler aşağıda."
        : "Bu kayıt ölçüm özeti içeriyor. Yeni analizle Filiz değerlendirmesi de eklenir."}</p>}
      {optical.length > 0 ? <div className="table-wrap">
        <table>
          <caption>Sentinel‑2 dönem karşılaştırması</caption>
          <thead><tr><th scope="col">Gösterge</th><th scope="col">Bu ay</th><th scope="col">Önceki ay</th><th scope="col">Fark</th></tr></thead>
          <tbody>{optical.map(({ id, current, previous, delta }) => <tr key={id}>
            <th scope="row">{openSentinelMetrics.find(metric => metric.id === id)?.label} ({id})</th>
            <td>{format(current?.mean)}</td><td>{format(previous?.mean)}</td><td>{format(delta)}</td>
          </tr>)}</tbody>
        </table>
        <p>Çizgi, ilgili dönemde karşılaştırmaya uygun ölçüm olmadığını gösterir.</p>
      </div> : <p>Sentinel‑2 dönem ortalaması için yeterli kaliteli ölçüm yok.</p>}
      {supplementary && Object.entries(supplementary).map(([key, source]) => (
        <details key={key} className="parcel-report-details" open>
          <summary>{sourceLabels[key]} · {source.date ? date(source.date) :
            source.state === "empty" ? "Uygun ölçüm yok" : "Veri alınamadı"}</summary>
          {source.metrics && <div className="table-wrap">
            <p>{source.source} · {source.sceneId}{source.orbit ? " · " + source.orbit : ""}</p>
            <table>
              <thead><tr><th scope="col">Ölçüm</th><th scope="col">Ortalama</th><th scope="col">Geçerli kapsam</th></tr></thead>
              <tbody>{Object.entries(source.metrics).map(([id, stat]) => <tr key={id}>
                <th scope="row">{measurementLabels[id] || openSentinelMetrics.find(metric => metric.id === id)?.label || id}</th>
                <td>{format(stat.mean)} {stat.unit}</td><td>%{format(stat.coverage * 100)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </details>
      ))}
      {onAssistant && <button className="secondary" onClick={onAssistant}>Bu parseli Filiz’e sor</button>}
    </section>
  );
}

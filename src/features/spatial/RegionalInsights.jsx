import { useMemo, useState } from "react";
import { Crosshair, Download } from "lucide-react";
import { groupOutlierFootprints, measuredCells, mergeRegion, parcelFootprints, summarizeFootprints } from "../../../shared/raster-footprints";
import { colorFor, rgb } from "./colors";

const number = (value, digits = 1) => value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
const hectares = value => number(value / 10_000, 3) + " ha";

export function PixelArea({ raster, geometry, index }) {
  const measurement = useMemo(() => parcelFootprints(raster, geometry)(index), [raster, geometry, index]);
  return measurement ? <p>Parsel içindeki hücre alanı · {number(measurement.squareMeters)} m²</p> : null;
}

function downloadRegion(region, raster, name, earlierDate) {
  const feature = { type: "Feature", geometry: mergeRegion(region), properties: {
    name, purpose: "field-review", metric: raster.metric, unit: raster.unit,
    squareMeters: region.squareMeters, meanDifference: region.mean, date: raster.date, earlierDate,
    source: raster.source, sceneId: raster.sceneId || null, geometryHash: raster.geometryHash, method: raster.screen.method,
  } };
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([JSON.stringify({ type: "FeatureCollection", features: [feature] }, null, 2)],
    { type: "application/geo+json" }));
  link.href = url;
  link.download = "agromax-inceleme-" + raster.date + "-" + region.id + ".geojson";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RegionalInsights({ raster, geometry, scale, earlierDate, onFocus }) {
  const cells = useMemo(() => measuredCells(raster, geometry), [raster, geometry]);
  const { buckets, covered } = useMemo(() =>
    summarizeFootprints(raster, cells, scale.min, scale.max), [raster, cells, scale.min, scale.max]);
  const regions = useMemo(() => raster.screen ? groupOutlierFootprints(raster, cells) : [], [raster, cells]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const region = regions.find(item => String(item.id) === selected);
  if (covered <= 0) return <p>Bu görünümde alan hesaplanabilecek geçerli hücre yok.</p>;
  const largest = Math.max(...buckets), span = scale.max - scale.min;
  const regionName = region ? "İnceleme bölgesi " + (regions.indexOf(region) + 1) : "";
  return <>
    {span > 0 ? <div className="spatial-histogram" aria-label="Geçerli alan dağılımı">
      {buckets.map((bucket, index) => {
        const from = scale.min + span * index / buckets.length;
        const to = scale.min + span * (index + 1) / buckets.length;
        const range = index === 0 ? "< " + number(to, 3) : index === buckets.length - 1
          ? "≥ " + number(from, 3) : number(from, 3) + " – " + number(to, 3);
        return <div key={index} title={range + " · " + hectares(bucket)} style={{
          "--bucket-size": bucket / largest,
          "--bucket-color": rgb(colorFor((from + to) / 2, scale)),
        }}><span>%{number(bucket / covered * 100, 0)}</span><i /><small>{range}</small></div>;
      })}
    </div> : <p>Geçerli alanın tamamı aynı değerde · {number(scale.min, 4)}</p>}
    <p>Ölçülen alan {hectares(covered)}. Yüzdeler parsel sınırına kırpılmış geçerli alan üzerinden hesaplanır.</p>
    {regions.length > 0 && <div className="spatial-region-list">
      <label>İnceleme bölgesi<select value={selected} onChange={event => { setSelected(event.target.value); setError(""); }}>
        <option value="">Bölge seçin</option>
        {regions.slice(0, 24).map((item, index) => <option key={item.id} value={item.id}>
          {index + 1} · {item.direction === "low" ? "Düşük değişim" : "Yüksek değişim"} · {hectares(item.squareMeters)}
        </option>)}
      </select></label>
      {regions.length > 24 && <p>Alanı en büyük 24 bölge listeleniyor.</p>}
      {region && <>
        <p>{region.cellCount} hücre · {hectares(region.squareMeters)} · Alan ağırlıklı fark {number(region.mean, 4)} {raster.unit}</p>
        <button className="secondary" type="button" onClick={() => {
          try { onFocus(cells[region.seed].coordinate, mergeRegion(region)); }
          catch { setError("Bölgenin sınırı birleştirilemedi."); }
        }}><Crosshair size={15} /> Bölgeye odaklan</button>
        <button className="text-button" type="button" onClick={() => {
          try { downloadRegion(region, raster, regionName, earlierDate); }
          catch { setError("Bölge GeoJSON dosyası oluşturulamadı."); }
        }}><Download size={15} /> Bölgeyi GeoJSON indir</button>
        <p>GeoJSON saha incelemesi için alan ve kaynak bilgisini taşır. Reçete taslağında kullanılacaksa uygulama oranını ayrıca gir.</p>
      </>}
      {error && <p role="alert">{error}</p>}
    </div>}
  </>;
}

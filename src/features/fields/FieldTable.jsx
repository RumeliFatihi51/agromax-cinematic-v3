import { useState } from "react";
import { ArrowUpRight, PenTool, Trash2, SlidersHorizontal } from "lucide-react";
import { metrics } from "../../../shared/metrics";
import { number, date } from "./FieldAnalysis";
import { useAreaFormat } from "../../components/PreferenceProvider";
export default function FieldTable({
  fields,
  cache,
  onSelect,
  onEdit,
  onDelete,
}) {
  const areaFormat = useAreaFormat();
  const [columns, setColumns] = useState(["NDVI", "NDWI", "NDMI", "NDRE"]);
  function toggle(id) {
    setColumns((c) =>
      c.includes(id) ? c.filter((x) => x !== id) : [...c, id],
    );
  }
  return (
    <>
      <details className="metric-column-picker">
        <summary>
          <SlidersHorizontal size={15} />
          Gösterge sütunlarını seç ({columns.length})
        </summary>
        <div>
          <button
            className="text-button"
            onClick={() => setColumns(metrics.map((m) => m.id))}
          >
            Tümünü göster
          </button>
          <button
            className="text-button"
            onClick={() => setColumns(["NDVI", "NDWI", "NDMI", "NDRE"])}
          >
            Varsayılan
          </button>
          <div className="metric-checkboxes">
            {metrics.map((m) => (
              <label key={m.id} title={m.label}>
                <input
                  type="checkbox"
                  checked={columns.includes(m.id)}
                  onChange={() => toggle(m.id)}
                />
                {m.id}
              </label>
            ))}
          </div>
        </div>
      </details>
      <div className="analysis-table-wrap">
        <table className="analysis-table field-comparison-table">
          <thead>
            <tr>
              <th>Tarla</th>
              <th>Alan</th>
              {columns.map((id) => (
                <th key={id}>
                  {id}
                  <small>bu ay / fark</small>
                </th>
              ))}
              <th>Son işleme</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id}>
                <td>
                  <button
                    className="metric-link"
                    onClick={() => onSelect(f.id)}
                  >
                    {f.name}
                    <ArrowUpRight size={14} />
                  </button>
                  <small>
                    {f.crop || "Ürün belirtilmedi"} ·{" "}
                    {f.geometry ? "Sınır kayıtlı" : "Sınır eksik"}
                  </small>
                </td>
                <td>{areaFormat.format(f.area)}</td>
                {columns.map((id) => {
                  const c = cache[f.id]?.comparison?.[id];
                  return (
                    <td key={id}>
                      <button
                        className="table-metric"
                        onClick={() => onSelect(f.id)}
                      >
                        {number(c?.current?.mean)}
                        <small>
                          {Number.isFinite(c?.delta)
                            ? `${c.delta > 0 ? "+" : ""}${number(c.delta)} puan`
                            : "Karşılaştırma yok"}
                        </small>
                      </button>
                    </td>
                  );
                })}
                <td>{date(cache[f.id]?.fetchedAt)}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={f.name + " düzenle"}
                    onClick={() => onEdit(f)}
                  >
                    <PenTool size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={f.name + " sil"}
                    onClick={() => onDelete(f)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { choose, type Locale } from "./i18n";
export default function MeasurementsField({
  initial,
  locale,
}: {
  initial?: unknown;
  locale: Locale;
}) {
  const values = Array.isArray(initial)
    ? (initial as { parameter: string; value: number; unit: string }[])
    : [];
  const [rows, setRows] = useState(() =>
    (values.length ? values : [{ parameter: "", value: "", unit: "" }]).map(
      (v) => ({ ...v, id: crypto.randomUUID() }),
    ),
  );
  const t = (tr: string, en: string) => choose(locale, tr, en);
  return (
    <div className="business-measurements">
      {rows.map((row) => (
        <div key={row.id} className="business-measurements-row">
          <input
            name="measurement.parameter"
            aria-label={t("Analiz parametresi", "Analysis parameter")}
            required
            maxLength={100}
            defaultValue={row.parameter}
            placeholder={t("Parametre", "Parameter")}
          />
          <input
            name="measurement.value"
            aria-label={t("Analiz değeri", "Analysis value")}
            required
            type="number"
            step="any"
            defaultValue={row.value}
            placeholder={t("Değer", "Value")}
          />
          <input
            name="measurement.unit"
            aria-label={t("Sonuç birimi", "Result unit")}
            required
            maxLength={50}
            defaultValue={row.unit}
            placeholder={t("Birim", "Unit")}
          />
          <button
            type="button"
            disabled={rows.length === 1}
            aria-label={t("Sonuç satırını kaldır", "Remove result row")}
            onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={rows.length >= 100}
        onClick={() =>
          setRows((all) => [
            ...all,
            { id: crypto.randomUUID(), parameter: "", value: "", unit: "" },
          ])
        }
      >
        <Plus size={16} />
        {t("Sonuç satırı ekle", "Add result row")}
      </button>
    </div>
  );
}

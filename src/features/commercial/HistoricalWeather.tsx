import { useState, type FormEvent } from "react";
import { CloudSun, Download, LoaderCircle } from "lucide-react";
import { api } from "../../api";
import { choose, type Locale } from "./i18n";
import type { Field } from "./types";
import type { normalizePower } from "../../../commercial/weather/power";
import "./commercial.css";
type History = ReturnType<typeof normalizePower>;
export default function HistoricalWeather({
  fields,
  locale,
}: {
  fields: Field[];
  locale: Locale;
}) {
  const [data, setData] = useState<History | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const t = (tr: string, en: string) => choose(locale, tr, en);
  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    setData(null);
    try {
      setData(await api("v1/weather/history", values));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!data) return;
    const link = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = link;
    a.download = `agromax-nasa-power-${data.range.start}-${data.range.end}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(link), 1000);
  }
  const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return (
    <div className="business-workspace">
      <div className="studio-page-title">
        <div>
          <span className="studio-kicker">NASA POWER</span>
          <h1>{t("Geçmiş hava verileri", "Historical weather")}</h1>
          <p>
            {t(
              "Kaynak ızgarasından günlük meteoroloji ve güneş ışınımı verileri.",
              "Daily meteorology and solar radiation from the source grid.",
            )}
          </p>
        </div>
        <CloudSun size={30} />
      </div>
      <section className="business-settings-section">
        <form onSubmit={load}>
          <label>
            {t("Parsel", "Parcel")}
            <select name="fieldId" required defaultValue={fields[0]?.id || ""}>
              <option value="">{t("Parsel seç", "Select parcel")}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <div className="business-form-grid">
            <label>
              {t("Başlangıç", "Start")}
              <input
                name="start"
                type="date"
                defaultValue={start}
                required
                max={end}
              />
            </label>
            <label>
              {t("Bitiş", "End")}
              <input
                name="end"
                type="date"
                defaultValue={end}
                required
                max={end}
              />
            </label>
          </div>
          <button className="primary" disabled={busy || !fields.length}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {t("Geçmiş verileri getir", "Load historical data")}
          </button>
        </form>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <section className="business-register">
          <header className="business-toolbar">
            <div>
              <h2>{data.source}</h2>
              <p>
                {data.range.start} - {data.range.end} · {data.timeStandard}
              </p>
            </div>
            <button className="secondary" onClick={download}>
              <Download size={16} />
              JSON
            </button>
          </header>
          <div className="business-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Tarih", "Date")}</th>
                  {Object.entries(data.parameters).map(([key, p]) => (
                    <th key={key}>
                      {t(p.tr, p.en)}
                      <br />({p.unit})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.observations.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    {Object.keys(data.parameters).map((key) => (
                      <td key={key}>
                        {typeof day.values[key] === "number"
                          ? day.values[key]!.toLocaleString(locale, {
                              maximumFractionDigits: 3,
                            })
                          : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="business-data-note">
            <p>
              {t(
                "Bu veriler ızgara tabanlı model tahminidir; parselde yerinde ölçüm değildir. Günler yerel güneş zamanına (LST) aittir, telefonun saat dilimine çevrilmez. Eksik değerler çizgiyle gösterilir.",
                "These are gridded model estimates, not on-site parcel measurements. Dates use local solar time (LST) and are not converted to the device time zone. Missing values appear as a dash.",
              )}
              <br />
              {data.methodVersion} · {data.sources.join(", ")}
              <br />
              <a href={data.sourceURL} target="_blank" rel="noreferrer">
                {t("Kaynak ve yöntem", "Source and methodology")}
              </a>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

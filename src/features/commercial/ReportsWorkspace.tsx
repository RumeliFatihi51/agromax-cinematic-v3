import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Download,
  LoaderCircle,
  Eye,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { api } from "../../api";
import type { Field } from "./types";
import { choose, type Locale } from "./i18n";
import type { ReportSnapshot } from "../../../commercial/reports/service";
import "./commercial.css";
type Row = {
  id: string;
  state: string;
  fieldId: string;
  createdAt: string;
  error: string | null;
};
type Job = { id: string; state: string; createdAt: string };
export default function ReportsWorkspace({
  fields,
  organizationId,
  locale,
  canCreate,
  dailyLimit,
}: {
  fields: Field[];
  organizationId: string;
  locale: Locale;
  canCreate: boolean;
  dailyLimit?: number;
}) {
  const t = (tr: string, en: string) => choose(locale, tr, en);
  const [fieldId, setFieldId] = useState(fields[0]?.id || ""),
    [jobs, setJobs] = useState<Job[]>([]),
    [analysisId, setAnalysisId] = useState(""),
    [rows, setRows] = useState<Row[] | null>(null),
    [preview, setPreview] = useState<{
      id: string;
      snapshot: ReportSnapshot;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const requestKey = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setJobs([]);
    setAnalysisId("");
    if (fieldId)
      api(`analyses?fieldId=${encodeURIComponent(fieldId)}`, undefined, "GET", {
        signal: controller.signal,
      })
        .then((r) => {
          if (!controller.signal.aborted) {
            const completed = r.jobs.filter(
              (j: Job) => j.state === "completed",
            );
            setJobs(completed);
            setAnalysisId(completed[0]?.id || "");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => controller.abort();
  }, [fieldId, organizationId]);
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      api("v1/reports", undefined, "GET", { signal: controller.signal })
        .then((r) => {
          if (!controller.signal.aborted) setRows(r.reports);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    load();
    const timer = setInterval(load, 6000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [organizationId, reload]);
  useEffect(() => {
    requestKey.current = null;
  }, [analysisId, locale]);
  const date = (value: string) =>
    new Date(value).toLocaleString(locale === "tr" ? "tr-TR" : "en-GB");
  async function create() {
    setBusy(true);
    setError("");
    requestKey.current ||= crypto.randomUUID();
    try {
      const report = await api("v1/reports", { analysisId, locale }, "POST", {
        headers: { "Idempotency-Key": requestKey.current },
      });
      requestKey.current = null;
      await show(report.id);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function show(id: string) {
    setError("");
    try {
      const r = await api(`v1/reports/${id}`);
      setPreview(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }
  async function download(id: string) {
    setBusy(true);
    setError("");
    try {
      const { url } = await api(`v1/reports/${id}/download-link`, {});
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: { "X-Organization-ID": organizationId },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const link = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = link;
      a.download = `agromax-${id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(link), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }
  const state = (value: string) =>
    ({
      queued: t("Sırada", "Queued"),
      running: t("Hazırlanıyor", "Generating"),
      completed: t("Hazır", "Ready"),
      failed: t("Başarısız", "Failed"),
    })[value] || value;
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString(locale, { maximumFractionDigits: 5 })
      : "—";
  return (
    <div className="business-workspace">
      <div className="studio-page-title">
        <div>
          <span className="studio-kicker">
            {t("KAYDI BELLİ, KAYNAĞI AÇIK", "TRACEABLE RECORDS AND SOURCES")}
          </span>
          <h1>{t("Raporların", "Your reports")}</h1>
          <p>
            {t(
              "Tamamlanmış analizi ve saha kayıtlarını tarihli bir PDF'te sakla.",
              "Preserve completed analyses and field records in dated PDF reports.",
            )}
          </p>
          {dailyLimit !== undefined && (
            <p className="business-muted">
              {t(
                `Günlük en fazla ${dailyLimit} rapor oluşturma isteği.`,
                `Up to ${dailyLimit} report requests per day.`,
              )}
            </p>
          )}
        </div>
        <FileText size={30} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {canCreate && (
        <section className="business-settings-section">
          <h2>{t("Yeni rapor oluştur", "Create a report")}</h2>
          <div className="business-form-grid">
            <label>
              {t("Parsel", "Parcel")}
              <select
                value={fieldId}
                onChange={(e) => setFieldId(e.target.value)}
              >
                <option value="">{t("Parsel seç", "Select parcel")}</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Tamamlanan analiz", "Completed analysis")}
              <select
                value={analysisId}
                onChange={(e) => setAnalysisId(e.target.value)}
                disabled={!jobs.length}
              >
                {!jobs.length && (
                  <option value="">
                    {t(
                      "Tamamlanmış analiz bulunmuyor",
                      "No completed analyses",
                    )}
                  </option>
                )}
                {jobs.map((j) => (
                  <option value={j.id} key={j.id}>
                    {date(j.createdAt)} · {j.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="primary"
            disabled={busy || !analysisId}
            onClick={create}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <FileText size={16} />
            )}
            {t("PDF raporu hazırla", "Generate PDF report")}
          </button>
        </section>
      )}
      <section className="business-register">
        <header className="business-toolbar">
          <div>
            <h2>{t("Rapor arşivi", "Report archive")}</h2>
            <p>
              {t(
                "Raporlar oluşturuldukları veri ve parsel sürümünü korur.",
                "Reports preserve their original data and geometry versions.",
              )}
            </p>
          </div>
          <button className="secondary" onClick={() => setReload((n) => n + 1)}>
            <RefreshCw size={15} />
            {t("Yenile", "Refresh")}
          </button>
        </header>
        {rows === null ? (
          <LoaderCircle className="spin" />
        ) : rows.length ? (
          <div className="business-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Parsel", "Parcel")}</th>
                  <th>{t("Tarih", "Date")}</th>
                  <th>{t("Durum", "Status")}</th>
                  <th>{t("İşlemler", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {fields.find((f) => f.id === r.fieldId)?.name ||
                        t("Arşiv parseli", "Archived parcel")}
                    </td>
                    <td>{date(r.createdAt)}</td>
                    <td>
                      <span className="business-state">{state(r.state)}</span>
                      {r.error && <p>{r.error}</p>}
                    </td>
                    <td>
                      <div className="business-row-actions">
                        <button
                          onClick={() => show(r.id)}
                          aria-label={t("Önizle", "Preview")}
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          onClick={() => download(r.id)}
                          disabled={busy || r.state !== "completed"}
                          aria-label={t("PDF indir", "Download PDF")}
                        >
                          <Download size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="business-empty">
            <FileText size={32} />
            <h2>{t("Henüz rapor oluşturmadın.", "No reports yet.")}</h2>
            <p>
              {t(
                "Önce bir parselin uydu analizini tamamla.",
                "Complete a parcel analysis first.",
              )}
            </p>
          </div>
        )}
      </section>
      {preview && (
        <section className="business-settings-section">
          <span className="studio-kicker">
            {t("RAPOR ÖNİZLEMESİ", "REPORT PREVIEW")}
          </span>
          <h2>{preview.snapshot.field.name}</h2>
          <p>
            {preview.snapshot.analysis.source} ·{" "}
            {preview.snapshot.analysis.method}
          </p>
          <p>{date(preview.snapshot.createdAt)}</p>
          <p className="business-muted">
            {t("Geometri sürümü", "Geometry version")}:{" "}
            {preview.snapshot.geometryVersion}
          </p>
          <div className="business-table-scroll">
            <table className="business-table">
              <thead>
                <tr>
                  <th>{t("Gösterge", "Metric")}</th>
                  <th>{t("Önceki", "Previous")}</th>
                  <th>{t("Güncel", "Current")}</th>
                  <th>{t("Mutlak fark", "Absolute difference")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.snapshot.analysis.comparison).map(
                  ([key, v]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{number(v.previous?.mean)}</td>
                      <td>{number(v.current?.mean)}</td>
                      <td>{number(v.delta)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <p>
            {t("Saha kaydı sayısı", "Field records")}:{" "}
            {preview.snapshot.records.length}
          </p>
        </section>
      )}
      <aside className="business-data-note">
        <ShieldCheck size={18} />
        <p>
          {t(
            "Rapor dosyaları özeldir. İndirme bağlantıları 5 dakika geçerlidir ve oturum/işletme yetkisi gerektirir.",
            "Report files are private. Download links expire in 5 minutes and require an authorized session and workspace membership.",
          )}
        </p>
      </aside>
    </div>
  );
}

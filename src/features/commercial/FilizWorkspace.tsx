import { useEffect, useState, type FormEvent } from "react";
import {
  ShieldCheck,
  LoaderCircle,
  Check,
  X,
  ClipboardList,
  FileText,
} from "lucide-react";
import { FilizAvatar } from "../../components/Brand";
import { api } from "../../api";
import { choose, type Locale } from "./i18n";
import type { Field, Workspace } from "./types";
import type { Fact } from "../../../commercial/assistant/model";
import "./commercial.css";
type Draft = {
  id: string;
  kind: "task" | "report";
  payload: Record<string, unknown>;
  state: string;
};
export default function FilizWorkspace({
  fields,
  initialFieldId,
  workspace,
  locale,
  onConfirmed,
}: {
  fields: Field[];
  initialFieldId?: string;
  workspace: Workspace;
  locale: Locale;
  onConfirmed: () => void;
}) {
  const [fieldId, setFieldId] = useState(fields.find((field) => field.id === initialFieldId)?.id || fields[0]?.id || ""),
    [facts, setFacts] = useState<Fact[] | null>(null),
    [status, setStatus] = useState<{
      modelAvailable: boolean;
      reason: string | null;
    } | null>(null),
    [jobs, setJobs] = useState<{ id: string; createdAt: string }[]>([]),
    [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [answer, setAnswer] = useState<{
      introduction: string;
      facts: Fact[];
      limitations: string;
    } | null>(null);
  const t = (a: string, b: string) => choose(locale, a, b),
    canWrite = workspace.role !== "viewer";
  useEffect(() => {
    const controller = new AbortController();
    setFacts(null);
    setAnswer(null);
    setDraft(null);
    setError("");
    api("v1/assistant/status", undefined, "GET", { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setStatus(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    if (fieldId) {
      Promise.all([
        api(
          `v1/assistant/facts?fieldId=${encodeURIComponent(fieldId)}&locale=${locale}`,
          undefined,
          "GET",
          { signal: controller.signal },
        ),
        api(
          `analyses?fieldId=${encodeURIComponent(fieldId)}`,
          undefined,
          "GET",
          { signal: controller.signal },
        ),
      ])
        .then(([f, j]) => {
          if (!controller.signal.aborted) {
            setFacts(f.facts);
            setJobs(
              j.jobs.filter(
                (job: { state: string }) => job.state === "completed",
              ),
            );
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    } else setFacts([]);
    return () => controller.abort();
  }, [workspace.id, fieldId, locale]);
  async function proposal(
    e: FormEvent<HTMLFormElement>,
    kind: "task" | "report",
  ) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      setDraft(
        await api("v1/assistant/proposals", {
          kind,
          payload: kind === "task" ? { ...form, fieldId } : { ...form, locale },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function decide(confirm: boolean) {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const r = await api(
        `v1/assistant/proposals/${draft.id}/${confirm ? "confirm" : "reject"}`,
        {},
      );
      setDraft(null);
      setMessage(
        confirm
          ? t(
              "Onayladığın işlem kaydedildi.",
              "Your confirmed action was saved.",
            )
          : t("Taslak iptal edildi.", "Draft rejected."),
      );
      if (confirm) onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      setAnswer(
        await api(
          "v1/assistant/ask",
          {
            question: form.question,
            fieldId,
            locale,
            consent: form.consent === "on",
          },
          "POST",
          { headers: { "Idempotency-Key": crypto.randomUUID() } },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const sourceKind = (kind: string) =>
    ({
      user_statement: t("Kullanıcı beyanı", "User statement"),
      calculated: t("Hesaplanmış veri", "Calculated data"),
    })[kind] || kind;
  return (
    <div className="business-workspace">
      <div className="studio-page-title">
        <div>
          <span className="studio-kicker">
            {t("KAYITLARINDAN KONUŞALIM", "LET YOUR RECORDS GUIDE YOU")}
          </span>
          <h1>Filiz</h1>
          <p>
            {t(
              "Kaynaklı kayıtlarını incele; görev ve rapor taslaklarını onaylayarak kaydet.",
              "Review sourced records and confirm task or report drafts before saving.",
            )}
          </p>
        </div>
        <FilizAvatar size={80} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="business-action-status" role="status">
          {message}
        </p>
      )}
      <div className="filiz-source-layout">
        <section className="business-settings-section">
          <label>
            {t("Hangi parsele bakalım?", "Which parcel shall we review?")}
            <select value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
              <option value="">{t("Parsel seç", "Select parcel")}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {!status?.modelAvailable && (
            <p className="business-muted">
              {t(
                "Dil modeli bağlantısı beklemede. Rehber kayıtlı verileri doğrudan gösterir.",
                "The language model connection is on hold. The guide displays saved records directly.",
              )}
            </p>
          )}
        </section>
        <section className="business-settings-section">
        <h2>{t("Parselin kayıt rehberi", "Parcel record guide")}</h2>
        {facts === null ? (
          <LoaderCircle className="spin" size={20} />
        ) : facts.length ? (
          facts.map((fact) => (
            <article className="business-fact" key={fact.id}>
              <p>{fact.text}</p>
              <small>
                {sourceKind(fact.kind)} · {fact.source}
                {fact.methodVersion ? ` · ${fact.methodVersion}` : ""}
              </small>
            </article>
          ))
        ) : (
          <p>
            {t(
              "Önce haritadan bir parsel oluştur.",
              "Create a parcel on the map first.",
            )}
          </p>
        )}
        </section>
      </div>
      {status?.modelAvailable && (
        <section className="business-settings-section">
          <h2>{t("Filiz'e sor", "Ask Filiz")}</h2>
          <form onSubmit={ask}>
            <label>
              {t("Sorun", "Your question")}
              <textarea name="question" required maxLength={1000} rows={3} />
            </label>
            <label>
              <span>
                <input
                  type="checkbox"
                  name="consent"
                  required
                  style={{ width: "auto" }}
                />{" "}
                {t(
                  "Seçili parselin sınırlı kayıtlarının model hizmetine gönderilmesini onaylıyorum.",
                  "I consent to sending limited records for this parcel to the model service.",
                )}
              </span>
            </label>
            <button className="primary" disabled={busy || !fieldId}>
              {t("Kaynaklı yanıt al", "Get a sourced answer")}
            </button>
          </form>
          {answer && (
            <article>
              <p>{answer.introduction}</p>
              {answer.facts.map((f) => (
                <p key={f.id}>
                  {f.text}
                  <br />
                  <small>{f.source}</small>
                </p>
              ))}
              <p>{answer.limitations}</p>
            </article>
          )}
        </section>
      )}
      {canWrite && fieldId && (
        <section className="business-settings-section">
          <h2>
            {t("Onaylı işlem taslakları", "Action drafts for your approval")}
          </h2>
          <details>
            <summary>
              <ClipboardList size={17} /> {t("Görev taslağı", "Task draft")}
            </summary>
            <form onSubmit={(e) => proposal(e, "task")}>
              <label>
                {t("Görev adı", "Task name")}
                <input name="name" maxLength={150} required />
              </label>
              <label>
                {t("Planlanan tarih", "Planned date")}
                <input name="date" type="date" required />
              </label>
              <button className="secondary" disabled={busy}>
                {t("Taslağı önizle", "Preview draft")}
              </button>
            </form>
          </details>
          <details>
            <summary>
              <FileText size={17} /> {t("Rapor taslağı", "Report draft")}
            </summary>
            <form onSubmit={(e) => proposal(e, "report")}>
              <label>
                {t("Tamamlanan analiz", "Completed analysis")}
                <select name="analysisId" required disabled={!jobs.length}>
                  {!jobs.length && (
                    <option value="">
                      {t("Tamamlanan analiz yok", "No completed analysis")}
                    </option>
                  )}
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {new Date(j.createdAt).toLocaleString(locale)} ·{" "}
                      {j.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary" disabled={busy || !jobs.length}>
                {t("Taslağı önizle", "Preview draft")}
              </button>
            </form>
          </details>
          {draft && (
            <div className="business-proposal">
              <h3>{t("Kaydetmeden önce incele", "Review before saving")}</h3>
              <p>
                {draft.kind === "task"
                  ? t(
                      "Yeni görev oluşturulacak.",
                      "A new task will be created.",
                    )
                  : t(
                      "Seçilen analizden PDF raporu hazırlanacak; paket kullanımından düşebilir.",
                      "A PDF report will be generated from the selected analysis and may use your plan allowance.",
                    )}
              </p>
              {Object.entries(draft.payload).map(([key, value]) => (
                <p key={key}>
                  <strong>
                    {{
                      name: t("Görev", "Task"),
                      date: t("Tarih", "Date"),
                      fieldId: t("Parsel", "Parcel"),
                      analysisId: t("Analiz", "Analysis"),
                      locale: t("Dil", "Language"),
                    }[key] || key}
                    :
                  </strong>{" "}
                  {key === "fieldId"
                    ? fields.find((f) => f.id === value)?.name
                    : String(value)}
                </p>
              ))}
              <div className="business-row-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => decide(true)}
                >
                  <Check size={16} />
                  {t("Onayla ve kaydet", "Confirm and save")}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => decide(false)}
                >
                  <X size={16} />
                  {t("İptal et", "Reject")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <aside className="business-data-note">
        <ShieldCheck size={18} />
        <p>
          {t(
            "Filiz kullanıcı onayı olmadan kayıt değiştirmez. Spektral indekslerden doğrudan sulama veya gübre dozu üretilmez.",
            "Filiz never changes records without your approval. Spectral indices do not directly produce irrigation or fertilizer dosage.",
          )}
        </p>
      </aside>
    </div>
  );
}

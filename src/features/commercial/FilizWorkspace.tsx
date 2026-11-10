import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ShieldCheck,
  Check,
  X,
  ClipboardList,
  FileText,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Send,
} from "lucide-react";
import FilizMasthead from "../assistant/FilizMasthead";
import FilizConversation from "../assistant/FilizConversation";
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
    [sourceError, setSourceError] = useState(""),
    [modelError, setModelError] = useState(""),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pendingQuestion, setPendingQuestion] = useState(""),
    [answers, setAnswers] = useState<{
      introduction: string;
      facts: Fact[];
      limitations: string;
      question: string;
    }[]>([]);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const t = (a: string, b: string) => choose(locale, a, b),
    canWrite = workspace.role !== "viewer";
  useEffect(() => {
    const controller = new AbortController();
    api("v1/assistant/status", undefined, "GET", { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setStatus(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setModelError(e.message);
      });
    return () => controller.abort();
  }, [workspace.id]);
  useEffect(() => {
    const controller = new AbortController();
    setFacts(fieldId ? null : []);
    setJobs([]);
    setSourceError("");
    setAnswers([]);
    setDraft(null);
    setError("");
    if (!fieldId) return;
    api(`v1/assistant/facts?fieldId=${encodeURIComponent(fieldId)}&locale=${locale}`,
      undefined, "GET", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setFacts(result.facts); })
      .catch((e) => { if (!controller.signal.aborted) setSourceError(e.message); });
    api(`analyses?fieldId=${encodeURIComponent(fieldId)}`, undefined, "GET", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted)
          setJobs(result.jobs.filter((job: { state: string }) => job.state === "completed"));
      })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
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
    const submittedQuestion = question.trim();
    if (!submittedQuestion || busy) return;
    setBusy(true);
    setPendingQuestion(submittedQuestion);
    setError("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api(
        fieldId ? "v1/assistant/ask" : "v1/assistant/help",
        {
          question: submittedQuestion,
          ...(fieldId ? { fieldId } : {}),
          locale,
          consent: form.consent === "on",
          conversation: answers.slice(-4).map(({ question, introduction }) => ({ question, answer: introduction })),
        },
        "POST",
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setAnswers((previous) => [...previous, { ...result, question: submittedQuestion }]);
      setQuestion((current) => current.trim() === submittedQuestion ? "" : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPendingQuestion("");
      setBusy(false);
    }
  }
  const sourceKind = (kind: string) =>
    ({
      user_statement: t("Kullanıcı beyanı", "User statement"),
      calculated: t("Hesaplanmış veri", "Calculated data"),
    })[kind] || kind;
  return (
    <div className="business-workspace filiz-workbench">
      <FilizMasthead
        eyebrow={t("TARIMSAL ZEKÂ / ÇALIŞMA MASASI", "AGRICULTURAL INTELLIGENCE / WORKSPACE")}
        description={t("Sorularını, parsel kayıtlarınla birlikte incele.", "Explore questions alongside your parcel records.")}
        status={status?.modelAvailable ? t("Canlı yapay zekâ bağlı", "Live AI connected") : t("Kayıt rehberi", "Record guide")}
        modelAvailable={!!status?.modelAvailable}
      />
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
      <div className="filiz-research">
        <section className="business-settings-section filiz-composer" aria-labelledby="filiz-composer-heading">
          <header className="filiz-section-heading"><h2 id="filiz-composer-heading">{t("Sohbet ve yardım", "Chat and help")}</h2></header>
          <label>
            {t("Hangi parsele bakalım?", "Which parcel shall we review?")}
            <select value={fieldId} disabled={busy} onChange={(e) => setFieldId(e.target.value)}>
              <option value="">{t("Genel sohbet ve uygulama yardımı", "General chat and app help")}</option>
              {fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
            </select>
          </label>
          {status?.modelAvailable ? (
            <>
            <FilizConversation messages={answers}
              label={t("Filiz sohbeti", "Filiz conversation")} userLabel={t("Sen", "You")}
              empty={t("Filiz’e bir soru yaz veya bir öneri seç.", "Write a question or choose a suggestion.")}
              pending={pendingQuestion ? { question: pendingQuestion, text: t("Yanıt hazırlanıyor…", "Preparing a reply…") } : undefined}
              renderAnswer={(answer: typeof answers[number]) => <>
                <p>{answer.introduction}</p>
                {answer.facts.length > 0 && <ol>{answer.facts.map((fact) => <li key={fact.id}>
                  {fact.text}<small>{fact.source}{fact.methodVersion ? ` · ${fact.methodVersion}` : ""}</small>
                </li>)}</ol>}
                {answer.limitations && <p>{answer.limitations}</p>}
              </>} />
            <form className="filiz-question-form" onSubmit={ask}>
              <label>{t("Sorun", "Your question")}
                <textarea ref={questionInput} name="question" value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={t("Örneğin, bu parselde son gözlemler ne gösteriyor?", "For example, what do recent observations show?")}
                  required maxLength={1000} rows={3} />
              </label>
              <div className="filiz-query-starters" aria-label={t("Soru önerileri", "Suggested questions")}>
                {[t("Son gözlemleri özetle", "Summarize recent observations"), t("Analiz sonuçlarını nerede görebilirim?", "Where can I view analysis results?")].map((prompt) =>
                  <button key={prompt} type="button" onClick={() => { setQuestion(prompt); questionInput.current?.focus(); }}>
                    {prompt}<ArrowUpRight size={14} aria-hidden="true" />
                  </button>)}
              </div>
              <label className="filiz-consent">
                <input type="checkbox" name="consent" required />
                {fieldId ? t("Sorunun ve seçili parselin sınırlı kayıtlarının Filiz’e gönderilmesini onaylıyorum.",
                  "I agree to send my question and limited parcel records to Filiz.")
                  : t("Sohbet mesajlarının Filiz’e gönderilmesini onaylıyorum.", "I agree to send the conversation to Filiz.")}
              </label>
              <button className="primary" disabled={busy || !question.trim()}>
                <Send size={16} aria-hidden="true" />
                {busy ? t("İstek işleniyor…", "Processing request…") : t("Gönder", "Send")}
              </button>
            </form>
            </>
          ) : <p className="filiz-model-note" role="status"><BookOpen size={18} aria-hidden="true" />{status || modelError
            ? t("Dil modeli kullanılamıyor. Kayıt rehberi bu parselin kaynaklarını gösterir.",
              "The language model connection is on hold. The guide displays saved records directly.")
            : t("Filiz bağlantısı kontrol ediliyor…", "Checking Filiz availability…")}</p>}
        </section>
        <details className="business-settings-section filiz-source-drawer">
          <summary>
            <div className="filiz-section-heading"><span>02 / {t("KAYNAKLAR", "SOURCES")}</span><h2>{t("Parselin kayıt rehberi", "Parcel record guide")}</h2></div>
            <ChevronDown size={19} aria-hidden="true" />
          </summary>
          {sourceError ? <p role="alert">{sourceError}</p> : facts === null ? <p role="status">{t("Kaynaklar yükleniyor…", "Loading sources…")}</p> : facts.length ? (
            facts.map((fact) => <article className="business-fact" key={fact.id}>
              <p>{fact.text}</p>
              <small>{sourceKind(fact.kind)} · {fact.source}{fact.methodVersion ? ` · ${fact.methodVersion}` : ""}</small>
            </article>)
          ) : <p>{fieldId ? t("Bu parsel için kayıtlı kaynak bulunamadı.", "No saved sources for this parcel.")
            : t("Bir parsel seç veya haritadan oluştur.", "Select a parcel or create one on the map.")}</p>}
        </details>
        {canWrite && fieldId && (
          <section className="business-settings-section filiz-actions">
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
      </div>
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

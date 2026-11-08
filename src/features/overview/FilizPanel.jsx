import { useEffect, useState } from "react";
import { ArrowUpRight, ChartNoAxesColumnIncreasing, Sprout } from "lucide-react";
import { api } from "../../api";

export default function FilizPanel({ field, workspace, onOpenField, onNavigate }) {
  const [status, setStatus] = useState(null);
  const [facts, setFacts] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!workspace || !field) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      api("v1/assistant/status", undefined, "GET", options),
      api("v1/assistant/facts?locale=tr&fieldId=" + encodeURIComponent(field.id), undefined, "GET", options),
    ]).then(([status, result]) => {
      if (controller.signal.aborted) return;
      setStatus(status);
      setFacts(result.facts || []);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [workspace?.id, field?.id]);

  async function ask(event) {
    event.preventDefault();
    if (!status?.modelAvailable || !question.trim() || busy) return;
    setBusy(true);
    setError("");
    setSent(question);
    setAnswer(null);
    try {
      const result = await api("v1/assistant/ask", {
        fieldId: field.id, locale: "tr", question: question.trim(), consent: true,
      }, "POST", { headers: { "Idempotency-Key": crypto.randomUUID() } });
      setAnswer(result);
      setQuestion("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visibleFacts = answer?.facts || facts?.slice(0, 4);
  const available = status?.modelAvailable && !!field;
  return (
    <aside className="dashboard-filiz" aria-label="Filiz araştırma paneli" data-enter>
      <header><span><Sprout size={19} /></span><div><h2>Filiz</h2><p>Tarımsal Zekâ Asistanınız</p></div></header>
      <div className="dashboard-filiz-scroll">
        {sent && <p className="dashboard-question">{sent}</p>}
        <section className="dashboard-filiz-answer" aria-live="polite">
          <div className="dashboard-filiz-heading"><ChartNoAxesColumnIncreasing size={20} />
            <strong>{field ? field.name : "Parsel çalışma alanı"}</strong></div>
          {busy && <p role="status">Filiz yanıtı alınıyor…</p>}
          {error && <p role="alert">{error}</p>}
          {answer?.introduction && <p>{answer.introduction}</p>}
          {!busy && visibleFacts?.length > 0 && <ul>
            {visibleFacts.map((fact) => <li key={fact.id}>{fact.text}<small>{fact.source}</small></li>)}
          </ul>}
          {!busy && !visibleFacts?.length && !error && <p>{!field ? "Bir parsel oluşturduğunuzda kaynaklı kayıtlar burada görünür."
            : !workspace ? "Parsel bilgilerini Filiz çalışma alanında inceleyin."
              : facts ? "Bu parsel için kayıt özeti yok." : "Parsel kayıtları alınıyor…"}</p>}
          {answer?.limitations && <p>{answer.limitations}</p>}
        </section>
        <div className="dashboard-filiz-actions">
          {field && <button onClick={onOpenField}>Grafiği Göster</button>}
          {field && <button onClick={() => onNavigate("evidence", field.id)}>Kanıtları İncele</button>}
          <button onClick={() => onNavigate("assistant", field?.id)}>Filiz’i Aç <ArrowUpRight size={13} /></button>
        </div>
      </div>
      <form className="dashboard-filiz-form" onSubmit={ask}>
        {available && <label className="dashboard-consent">
          <input type="checkbox" required /> Parsel verilerinin Filiz sağlayıcısına gönderilmesine izin veriyorum.
        </label>}
        <div><input aria-label="Filiz’e bir soru sorun" placeholder={available ? "Filiz’e bir soru sorun…" : "Filiz kayıt rehberi"}
          value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} disabled={!available || busy} required />
          {available ? <button aria-label="Soruyu gönder" disabled={busy}><ArrowUpRight size={19} /></button>
            : <button type="button" aria-label="Filiz çalışma alanını aç" onClick={() => onNavigate("assistant", field?.id)}><ArrowUpRight size={19} /></button>}</div>
      </form>
    </aside>
  );
}

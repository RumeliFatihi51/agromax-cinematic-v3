import { useState } from "react";
import { ArrowUpRight, BookOpen, Send, ShieldCheck } from "lucide-react";
import FilizMasthead from "./FilizMasthead";
import FilizConversation from "./FilizConversation";
export default function Filiz({ fields, tasks, onNavigate }) {
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState([]);
  function ask(text) {
    if (!text.trim()) return;
    const pending = tasks.filter((t) => !t.done);
    const query = text.toLocaleLowerCase("tr-TR");
    let answer;
    if (/^(selam|merhaba|hey|günaydın|iyi akşamlar)[!.\s]*$/.test(query))
      answer = "Merhaba! Parsellerini özetleyebilir veya bekleyen görevlerine birlikte bakabiliriz.";
    else if (/görev|plan|takvim/.test(query))
      answer = pending.length
        ? `Kayıtlı ${pending.length} tamamlanmamış göreviniz var: ${pending.map((t) => `${t.name} (${t.date})`).join("; ")}. Kaynak: kendi görev kayıtlarınız.`
        : "Kayıtlarınızda tamamlanmamış görev bulunmuyor. Kaynak: kendi görev kayıtlarınız.";
    else if (
      /tarla|parsel|alan/.test(query) &&
      !/sula|hast|gübre|verim|neden|ndv[iı]|ndm[iı]|ndw[iı]/.test(query)
    )
      answer = fields.length
        ? `${fields.length} kayıtlı tarlanız var: ${fields.map((f) => `${f.name}, ${f.area.toLocaleString("tr-TR")} dekar (${f.geometry ? "çizilmiş sınırdan yaklaşık hesap" : "kullanıcı beyanı"})`).join("; ")}. Kaynak: kendi tarla kayıtlarınız.`
        : "Henüz tarla kaydınız bulunmuyor. Haritadan ilk parselinizi çizebilirsiniz.";
    else
      answer =
        "Bu soruyu kayıt rehberiyle yanıtlayamıyorum. Parsellerin veya bekleyen görevlerin hakkında soru sorabilirsin.";
    setMessages((m) => [...m, { question: text, answer }]);
    setQuestion("");
  }
  return (
    <section className="filiz-workbench filiz-guide">
      <FilizMasthead eyebrow="TARIMSAL ZEKÂ / ÇALIŞMA MASASI"
        description="Sorularını, parsel kayıtlarınla birlikte incele." status="Kayıt rehberi" />
      <div className="filiz-research">
        <section className="business-settings-section filiz-composer" aria-labelledby="guide-composer-heading">
          <header className="filiz-section-heading"><span>01 / SORU ALANI</span><h2 id="guide-composer-heading">Filiz’e sor</h2></header>
          <p className="filiz-model-note"><BookOpen size={18} aria-hidden="true" /> Dil modeli kullanılamıyor. Filiz, parsel ve görev kayıtlarını özetleyebilir.</p>
          <FilizConversation messages={messages} renderAnswer={(message) => <p>{message.answer}</p>} />
          <div className="filiz-query-starters" aria-label="Soru önerileri">
            {["Tarlalarımı özetle", "Bekleyen görevlerim neler?"].map((prompt) => (
              <button type="button" onClick={() => ask(prompt)} key={prompt}>
                {prompt}<ArrowUpRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          <form className="filiz-question-form" onSubmit={(event) => { event.preventDefault(); ask(question.trim()); }}>
            <label>Sorun
              <textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)}
                maxLength={1000} required placeholder="Filiz’e bir soru yazın…" aria-label="Filiz'e sorunuz" />
            </label>
            <button className="primary" disabled={!question.trim()}><Send size={17} aria-hidden="true" /> Soruyu gönder</button>
          </form>
        </section>
        <aside className="business-settings-section filiz-source-drawer">
          <header className="filiz-section-heading"><span>02 / KAYNAKLAR</span><h2>Kayıtların</h2></header>
          <dl className="filiz-guide-sources">
            <div><dt>Parseller</dt><dd>{fields.length}</dd></div>
            <div><dt>Bekleyen görevler</dt><dd>{tasks.filter((task) => !task.done).length}</dd></div>
          </dl>
          <button className="text-button" onClick={() => onNavigate("fields")}>Parsellerime git <ArrowUpRight size={16} /></button>
        </aside>
      </div>
      <aside className="business-data-note"><ShieldCheck size={18} /><p>Rehber yalnızca çalışma alanındaki kayıtları kullanır.</p></aside>
    </section>
  );
}

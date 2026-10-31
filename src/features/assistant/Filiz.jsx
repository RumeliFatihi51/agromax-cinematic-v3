import { useState } from "react";
import { Sprout, ArrowUpRight, Send, ShieldCheck } from "lucide-react";
import { FilizAvatar } from "../../components/Brand";
export default function Filiz({ fields, tasks, onNavigate }) {
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState([]);
  function ask(text) {
    if (!text.trim()) return;
    const pending = tasks.filter((t) => !t.done);
    let answer;
    if (/görev|plan|takvim/i.test(text))
      answer = pending.length
        ? `Kayıtlı ${pending.length} tamamlanmamış göreviniz var: ${pending.map((t) => `${t.name} (${t.date})`).join("; ")}. Kaynak: kendi görev kayıtlarınız.`
        : "Kayıtlarınızda tamamlanmamış görev bulunmuyor. Kaynak: kendi görev kayıtlarınız.";
    else if (
      /tarla|parsel|alan/i.test(text) &&
      !/sula|hast|gübre|verim|neden|ndvi|ndmi|ndwi/i.test(text)
    )
      answer = fields.length
        ? `${fields.length} kayıtlı tarlanız var: ${fields.map((f) => `${f.name}, ${f.area.toLocaleString("tr-TR")} dekar (${f.geometry ? "çizilmiş sınırdan yaklaşık hesap" : "kullanıcı beyanı"})`).join("; ")}. Kaynak: kendi tarla kayıtlarınız.`
        : "Henüz tarla kaydınız bulunmuyor. Haritadan ilk parselinizi çizebilirsiniz.";
    else
      answer =
        "Bu soruya doğrulanmış bir yanıt verecek bağlı model ve yeterli saha verisi henüz yok. Şimdilik kayıtlı tarlalarınızı ve görevlerinizi özetleyebilirim. Sulama, hastalık veya gübre önerisi uydurmam. Uydu sonuçlarını parselin analiz ekranından inceleyebilirsiniz.";
    setMessages((m) => [...m, { question: text, answer }]);
    setQuestion("");
  }
  return (
    <section className="filiz-page">
      <div className="filiz-hero">
        <span className="filiz-avatar">
          <FilizAvatar size={94} />
        </span>
        <span className="eyebrow">TOPRAĞINIZIN YANINDA</span>
        <h2>Merhaba, ben Filiz.</h2>
        <p>
          Kayıtlarınızı birlikte okuyalım.
          <br />
          Her yanıt, bildiğimiz kadar.
        </p>
        <span className="tag">
          Kayıt rehberi · Yapay zekâ modeli bağlı değil
        </span>
      </div>
      <div className="filiz-prompts">
        {["Tarlalarımı özetle", "Bekleyen görevlerim neler?"].map((q) => (
          <button onClick={() => ask(q)} key={q}>
            {q}
            <ArrowUpRight size={18} />
          </button>
        ))}
      </div>
      <div className="filiz-messages" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i}>
            <p className="question-bubble">{m.question}</p>
            <div className="answer-bubble">
              <FilizAvatar size={30} />
              <p>{m.answer}</p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="filiz-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          required
          placeholder="Filiz’e bir soru yazın…"
          aria-label="Filiz'e sorunuz"
        />
        <button className="primary" aria-label="Soruyu gönder">
          <Send size={18} />
        </button>
      </form>
      <p className="filiz-note">
        <ShieldCheck size={16} /> Filiz şu anda kurallı bir kayıt rehberidir.
        Doğal dil modeli ve agronomik öneri servisi henüz bağlı değil.
      </p>
      <button className="text-button" onClick={() => onNavigate("fields")}>
        Parsellerime git <ArrowUpRight size={16} />
      </button>
    </section>
  );
}

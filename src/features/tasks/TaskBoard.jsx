import { useState } from "react";
import { Plus, CalendarDays, Check, ChevronLeft, ChevronRight, ArrowRight, ListFilter } from "lucide-react";

const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

export default function TaskBoard({ tasks, onToggle, onCreate }) {
  const today = localToday();
  const [filter, setFilter] = useState("pending");
  const [selectedDate, setSelectedDate] = useState("");
  const [month, setMonth] = useState(() => new Date(`${today.slice(0, 7)}-01T12:00:00`));
  const pending = tasks.filter(t => !t.done);
  const completed = tasks.length - pending.length;
  const filtered = tasks.filter(t => (filter === "all" || (filter === "completed" ? t.done : !t.done)) && (!selectedDate || t.date === selectedDate)).sort((a, b) => a.date.localeCompare(b.date));
  const groups = [...new Set(filtered.map(t => t.date))];
  const firstDay = (month.getDay() + 6) % 7;
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  function shiftMonth(offset) {
    setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1, 12));
    setSelectedDate("");
  }
  return <div className="fw-planner">
    <header className="fw-page-heading"><div><span className="fw-overline">HER ADIM BİR SONRAKİNE HAZIRLAR</span><h1>Görevlerim</h1><p>Sezonunu planla, işlerini takip et ve güne hazır başla.</p></div><button className="primary" onClick={onCreate}><Plus size={17} /> Yeni görev</button></header>
    <div className="fw-planner-stats"><div><span><CalendarDays size={17} /> Bekleyen işler</span><strong>{pending.length}</strong></div><div><span><Check size={17} /> Tamamlananlar</span><strong>{completed}</strong></div><div><span>Sezon ilerlemesi</span><strong>{tasks.length ? Math.round(completed / tasks.length * 100) : 0}<small>%</small></strong><progress value={completed} max={tasks.length || 1} aria-label="Tamamlanan görev oranı" /></div></div>
    <div className="fw-planner-layout">
      <aside className="fw-calendar fw-surface"><header><h2>{month.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</h2><div><button aria-label="Önceki ay" onClick={() => shiftMonth(-1)}><ChevronLeft size={17} /></button><button aria-label="Sonraki ay" onClick={() => shiftMonth(1)}><ChevronRight size={17} /></button></div></header><div className="fw-calendar-grid">{["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map(day => <span key={day} className="fw-weekday">{day}</span>)}{Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: dayCount }, (_, index) => {
        const day = index + 1, date = `${monthKey}-${String(day).padStart(2, "0")}`;
        const hasTasks = tasks.some(task => task.date === date);
        return <button key={date} className={`${date === today ? "is-today" : ""} ${hasTasks ? "has-tasks" : ""}`} aria-label={dateLabel(date)} aria-pressed={selectedDate === date} onClick={() => setSelectedDate(previous => previous === date ? "" : date)}>{day}{hasTasks && <i />}</button>;
      })}</div><footer><span><i /> Görev olan gün</span><button onClick={() => { setMonth(new Date(`${today.slice(0, 7)}-01T12:00:00`)); setSelectedDate(today); }}>Bugüne git</button></footer><div className="fw-calendar-note"><CalendarDays size={20} /><p>Takvimden bir gün seç.<br />O günün işlerine odaklan.</p></div></aside>
      <section className="fw-surface fw-planner-agenda"><header className="fw-planner-toolbar"><div className="fw-view-tabs" aria-label="Görev filtresi">{[["pending", "Bekleyen", pending.length], ["completed", "Tamamlanan", completed], ["all", "Tümü", tasks.length]].map(([id, label, count]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{count}</span></button>)}</div><span><ListFilter size={15} /> Tarihe göre</span></header>
        {selectedDate && <div className="fw-selected-date"><span>{dateLabel(selectedDate)}</span><button onClick={() => setSelectedDate("")}>Tüm tarihleri göster</button></div>}
        {groups.length ? <div className="fw-planner-groups">{groups.map(date => <section key={date}><header><h2>{dateLabel(date)}</h2><span>{date === today ? "Bugün" : date < today ? "Geçmiş tarih" : "Planlandı"}</span></header>{filtered.filter(task => task.date === date).map(task => <label key={task.id} className={`fw-planner-task ${task.done ? "is-done" : ""}`}><input type="checkbox" checked={!!task.done} onChange={() => onToggle(task)} /><span><strong>{task.name}</strong><small>{task.done ? "Tamamlandı · Geri alabilirsin" : "Tamamladığında işaretle"}</small></span><span className="fw-task-badge">{task.done ? "Tamamlandı" : "Bekliyor"}</span></label>)}</section>)}</div> : <div className="fw-empty"><CalendarDays size={33} strokeWidth={1.5} /><h3>{filter === "completed" ? "Güzel işler burada birikir." : selectedDate ? "Bu gün için planın yok." : "Yeni bir plana yer aç."}</h3><p>{filter === "completed" ? "Tamamladığın görevleri buradan tekrar inceleyebilirsin." : "Saha kontrolü, ekim veya sulama. Bir sonraki adımını kaydederek başla."}</p>{filter !== "completed" && <button className="primary" onClick={onCreate}>Görev oluştur <ArrowRight size={17} /></button>}</div>}
      </section>
    </div>
  </div>;
}

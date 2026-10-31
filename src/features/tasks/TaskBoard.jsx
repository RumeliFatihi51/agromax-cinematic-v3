import { useState } from "react";
import {
  Plus,
  CalendarDays,
  ArrowRight,
  CheckCheck,
  Clock3,
} from "lucide-react";
export default function TaskBoard({ tasks, onToggle, onCreate }) {
  const [filter, setFilter] = useState("pending");
  const completed = tasks.filter((t) => t.done).length,
    pending = tasks.length - completed;
  const displayed = tasks
    .filter(
      (t) => filter === "all" || (filter === "completed" ? t.done : !t.done),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="studio-task-page">
      <div className="studio-page-title">
        <div>
          <span className="studio-kicker">BİR SONRAKİ ADIMIN BELLİ OLSUN</span>
          <h1>Sezonun, planlı ilerlesin.</h1>
          <p>Günlük işlerini kaydet, sıraya koy ve tamamladıkça işaretle.</p>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={18} />
          Yeni görev
        </button>
      </div>
      <div className="task-summary-row">
        <article>
          <span className="task-summary-icon citrus">
            <Clock3 size={22} />
          </span>
          <div>
            <small>Bekleyen işler</small>
            <strong>
              {pending}
              <em>görev</em>
            </strong>
          </div>
        </article>
        <article>
          <span className="task-summary-icon lilac">
            <CheckCheck size={22} />
          </span>
          <div>
            <small>Tamamlananlar</small>
            <strong>
              {completed}
              <em>görev</em>
            </strong>
          </div>
        </article>
        <div className="task-summary-note">
          <CalendarDays size={22} />
          <p>
            Her küçük adım,
            <br />
            <strong>daha düzenli bir sezon.</strong>
          </p>
        </div>
      </div>
      <section className="studio-task-board">
        <div className="task-board-toolbar">
          <div className="studio-segmented">
            {[
              ["pending", "Bekleyen", pending],
              ["completed", "Tamamlanan", completed],
              ["all", "Tümü", tasks.length],
            ].map(([id, label, count]) => (
              <button
                key={id}
                className={id === filter ? "active" : ""}
                onClick={() => setFilter(id)}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
        </div>
        {displayed.length ? (
          <div className="studio-task-rows">
            {displayed.map((task) => (
              <label className={task.done ? "is-completed" : ""} key={task.id}>
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => onToggle(task)}
                />
                <div>
                  <strong>{task.name}</strong>
                  <small>
                    <CalendarDays size={13} />
                    {new Date(task.date + "T12:00:00").toLocaleDateString(
                      "tr-TR",
                      { day: "numeric", month: "long", year: "numeric" },
                    )}
                  </small>
                </div>
                <span>{task.done ? "Tamamlandı" : "Planlandı"}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="studio-task-empty">
            <span>
              <CalendarDays size={35} />
            </span>
            <h2>
              {filter === "completed"
                ? "Tamamladığın işler burada görünecek."
                : "Yeni bir plana yer aç."}
            </h2>
            <p>
              {filter === "completed"
                ? "Bir görevi tamamladığında buradan tekrar inceleyebilirsin."
                : "Saha kontrolü, ekim veya sulama. Sıradaki işini ekleyerek başla."}
            </p>
            {filter !== "completed" && (
              <button className="primary" onClick={onCreate}>
                Görev oluştur
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

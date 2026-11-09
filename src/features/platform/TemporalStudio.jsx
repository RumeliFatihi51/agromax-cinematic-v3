import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, Clock3 } from "lucide-react";
import { api } from "../../api";
import SatelliteScene, { sceneDatesFor } from "../fields/SatelliteScene";
import ObservationPlot from "../fields/ObservationPlot";
import { indices } from "../../../shared/metrics";
import { states, timestamp } from "../history/format";

export default function TemporalStudio({ context, onHistory, onField }) {
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState(null);
  const active = context.history.find(({ id }) => id === selected)
    || context.history.find(({ state, comparable }) => state === "completed" && comparable)
    || context.history[0];
  const jobId = active?.id;
  const fieldId = context.field.id;
  const completed = active?.state === "completed";
  const current = detail?.id === jobId && detail?.fieldId === fieldId ? detail : null;

  useEffect(() => {
    if (!jobId || !completed) return;
    const controller = new AbortController();
    api(`analyses/${jobId}`, undefined, "GET", { signal: controller.signal })
      .then(({ job }) => {
        if (controller.signal.aborted) return;
        if (!job?.analysis || job.field?.id !== fieldId) {
          throw new Error("Kayıtlı analiz ve parsel sınırı birlikte alınamadı.");
        }
        setDetail({ id: jobId, fieldId, job });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDetail({ id: jobId, fieldId, error: error.message });
      });
    return () => controller.abort();
  }, [jobId, fieldId, completed]);

  return <section className="temporal-studio" aria-labelledby="temporal-studio-title">
    <header>
      <div>
        <span className="eyebrow"><CalendarDays size={15} aria-hidden="true" /> ARAZİ HAFIZASI</span>
        <h2 id="temporal-studio-title">Kaydedilmiş gözlem çizgisi</h2>
        <p>Son 50 işlem. Her sonuç kendi parsel sınırıyla açılır.</p>
      </div>
      <div className="temporal-links">
        <button className="text-button" onClick={onField}>Parseli aç <ArrowUpRight size={15} /></button>
        <button className="text-button" onClick={onHistory}>Analiz geçmişi <ArrowUpRight size={15} /></button>
      </div>
    </header>
    {active ? (
      <>
        <ol className="temporal-run-list" aria-label="Kayıtlı analiz işlemleri">
          {context.history.map((item) => <li key={item.id}>
            <button type="button" aria-pressed={item.id === jobId} onClick={() => setSelected(item.id)}>
              <small>{timestamp(item.finishedAt || item.createdAt)}</small>
              <strong>{states[item.state] || item.state}</strong>
              <span>{item.comparable ? "Güncel sınır" : "Eski sınır"} · {item.observationCount} gözlem</span>
            </button>
          </li>)}
        </ol>
        <div className="temporal-run-detail" aria-label="Seçili analiz işlemi">
          {completed ? current?.error ? <p className="error" role="alert">{current.error}</p> :
            current?.job ? <TemporalObservation key={jobId} job={current.job} comparable={active.comparable} /> :
              <p className="studio-module-loading" role="status">Kayıtlı gözlemler yükleniyor…</p> :
            <div className="temporal-empty">
              <Clock3 size={23} aria-hidden="true" />
              <strong>{states[active.state] || active.state}</strong>
              <p>{active.error || "Bu işleme ait tamamlanmış bir uydu sonucu yok."}</p>
            </div>}
        </div>
      </>
    ) : <div className="temporal-empty"><CalendarDays size={25} aria-hidden="true" />
      <strong>Henüz kaydedilmiş analiz yok.</strong>
      <p>İlk analiz tamamlandığında kayıtlı çekimleri, ölçümleri ve parsel sınırını burada inceleyebilirsiniz.</p>
    </div>}
  </section>;
}

const temporalLayers = indices
  .filter(({ id }) => ["NDVI", "NDRE", "NDMI", "NDWI"].includes(id))
  .map(({ id }) => ({ id, label: id }));

function TemporalObservation({ job, comparable }) {
  const { analysis, field } = job;
  const dates = sceneDatesFor(analysis);
  const [day, setDay] = useState(dates[0]);
  const [layer, setLayer] = useState("NDVI");
  const metric = indices.find(({ id }) => id === layer);
  return <>
    {!comparable && <p className="data-warning">Bu analiz, kaydedildiği eski parsel sınırıyla gösteriliyor.</p>}
    <div className="temporal-view">
      <SatelliteScene field={field} analysis={analysis} archiveId={job.id}
        dates={dates} day={day} onDay={setDay} layer={layer} onLayer={setLayer} layers={temporalLayers} />
      <aside className="temporal-observation">
        <span className="eyebrow">ZAMAN SERİSİ</span>
        <h3>{metric.id} · {metric.label}</h3>
        <ObservationPlot observations={analysis.observations || []} metric={metric} selectedDate={day} showEmpty />
        <dl>
          <div><dt>Kaynak</dt><dd>{analysis.source || "—"}</dd></div>
          <div><dt>Yöntem</dt><dd>{analysis.method || "—"}</dd></div>
          <div><dt>Analiz kaydı</dt><dd>{job.id.slice(0, 8)}</dd></div>
        </dl>
      </aside>
    </div>
  </>;
}

import { useEffect, useRef, useState } from "react";
import { History, RefreshCw, ArrowUpRight, Ban } from "lucide-react";
import { api } from "../../api";
import { PageHeading, EmptyState } from "../../components/ui/WorkspaceUI";
import FieldAnalysis from "../fields/FieldAnalysis";
import "./records.css";
import { states, timestamp } from "./format";

export default function AnalysisHistory({ focusJob = null, onField }) {
  const [jobs, setJobs] = useState(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState(null),
    [focused, setFocused] = useState(null),
    [busy, setBusy] = useState(null);
  const detail = useRef(null);
  const opener = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function load() {
      try {
        const data = await api("analyses", undefined, "GET", {
          signal: controller.signal,
        });
        if (!Array.isArray(data.jobs))
          throw new Error(
            "Sunucu analiz listesini doğrulanabilir biçimde döndürmedi.",
          );
        setJobs(data.jobs);
        setError("");
        if (data.jobs.some((j) => ["queued", "running"].includes(j.state)))
          timer = setTimeout(load, 3000);
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message);
      }
    }
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [reload]);
  useEffect(() => {
    if (focusJob) open(focusJob);
  }, [focusJob]);
  useEffect(() => {
    if (selected) detail.current?.focus();
  }, [selected]);
  async function open(jobId) {
    setBusy(jobId);
    setError("");
    try {
      const { job } = await api(`analyses/${jobId}`);
      if (job?.state === "completed" && job.analysis && job.field)
        setSelected(job);
      else if (job?.id) setFocused(job);
      else throw new Error("İşlem kaydı bulunamadı.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function cancel(jobId) {
    setBusy(jobId);
    setError("");
    try {
      await api(`analyses/${jobId}/cancel`, {});
      setReload((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  const filtered = (jobs || []).filter(
    (j) => filter === "all" || j.state === filter,
  );
  return (
    <div className="records-workspace">
      <PageHeading
        eyebrow="KALICI İŞLEM KAYITLARI"
        title="Analiz geçmişi"
        description="Başlattığın her analiz, gerçek işlem durumu ve kendi sonuç sürümüyle saklanır."
      >
        <button className="secondary" onClick={() => setReload((n) => n + 1)}>
          <RefreshCw size={16} />
          Yenile
        </button>
      </PageHeading>
      <dl className="history-counts" aria-label="Analiz işlemlerinin özeti">
        {[["all", "Tüm işlemler"], ["completed", "Tamamlanan"], ["running", "İşlenen"], ["queued", "Kuyrukta"], ["failed", "Başarısız"]].map(([id, label]) => (
          <div key={id}><dt>{label}</dt><dd>{jobs ? jobs.filter((job) => id === "all" || job.state === id).length : "—"}</dd></div>
        ))}
      </dl>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {selected && <section className="records-inline-detail" ref={detail} tabIndex={-1} aria-label="Açık analiz sonucu">
        {onField && <button className="text-button" onClick={() => onField(selected.field)}>Güncel parsel kaydını aç</button>}
        <FieldAnalysis key={selected.id} field={selected.field} initialAnalysis={selected.analysis}
          archiveId={selected.id} embedded onBack={() => { setSelected(null); opener.current?.focus(); }} />
      </section>}
      {focused && (
        <section className="panel records-filter" role="status">
          <div>
            <strong>{focused.fieldName}</strong>
            <p>
              {states[focused.state]} · {timestamp(focused.createdAt)}
            </p>
            {focused.error && <p className="record-error">{focused.error}</p>}
            <small>İşlem: {focused.id}</small>
          </div>
          <button className="text-button" onClick={() => setFocused(null)}>
            Kapat
          </button>
        </section>
      )}
      <section className="panel records-panel">
        <div className="records-filter">
          <label>
            İşlem durumu
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Tüm işlemler</option>
              {Object.entries(states).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span>En son 200 işlem · İlerleme yüzdesi tahmin edilmez.</span>
        </div>
        {jobs === null ? (
          <div className="records-loading" role="status">
            İşlem kayıtları yükleniyor…
          </div>
        ) : filtered.length ? (
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Parsel / işlem</th>
                  <th>Oluşturuldu</th>
                  <th>Durum</th>
                  <th>Kaynak</th>
                  <th>Sonuç</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <strong>{j.fieldName}</strong>
                      <small>{j.type}</small>
                      <code>{j.id.slice(0, 8)}</code>
                    </td>
                    <td>
                      {timestamp(j.createdAt)}
                      {j.finishedAt && (
                        <small>Bitiş: {timestamp(j.finishedAt)}</small>
                      )}
                    </td>
                    <td>
                      <span className={`record-state state-${j.state}`}>
                        {states[j.state] || j.state}
                      </span>
                      {j.error && (
                        <small className="record-error">{j.error}</small>
                      )}
                    </td>
                    <td>{j.source}</td>
                    <td>
                      {j.state === "completed" ? (
                        <button
                          className="text-button"
                          disabled={busy === j.id}
                          onClick={(event) => { opener.current = event.currentTarget; open(j.id); }}
                        >
                          Sonucu aç <ArrowUpRight size={15} />
                        </button>
                      ) : ["queued", "running"].includes(j.state) ? (
                        <button
                          className="text-button"
                          disabled={busy === j.id}
                          onClick={() => cancel(j.id)}
                        >
                          <Ban size={15} />
                          İptal et
                        </button>
                      ) : (
                        "Sonuç oluşturulmadı"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={History}
            title={
              filter === "all"
                ? "Henüz analiz başlatmadın."
                : "Bu durumda işlem yok."
            }
            description="Parselin detayından uydu verilerini güncellediğinde işlem burada kalıcı olarak izlenir."
          />
        )}
      </section>
    </div>
  );
}

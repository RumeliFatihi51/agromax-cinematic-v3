import { useEffect, useState } from "react";
import { Bell, CheckCheck, ArrowUpRight, RefreshCw } from "lucide-react";
import { api } from "../../api";
import { PageHeading, EmptyState } from "../../components/ui/WorkspaceUI";
import { timestamp } from "../history/format";
import "../history/records.css";

export default function Notifications({ onJob, onChanged }) {
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [unreadOnly, setUnreadOnly] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api("notifications", undefined, "GET", { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data.notifications))
          throw new Error("Bildirim yanıtı geçersiz.");
        setItems(data.notifications);
        setError("");
        onChanged?.(data.notifications);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [reload]);
  async function read(ids) {
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      await api("notifications/read", { ids });
      setReload((n) => n + 1);
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const unread = (items || []).filter((i) => !i.readAt),
    shown = (items || []).filter((i) => !unreadOnly || !i.readAt);
  return (
    <div className="records-workspace">
      <PageHeading
        eyebrow="GERÇEK OLAYLAR"
        title="Bildirimler"
        description="Analizlerinin tamamlanma, hata ve iptal olaylarını takip et."
      >
        <button className="secondary" onClick={() => setReload((n) => n + 1)}>
          <RefreshCw size={16} />
          Yenile
        </button>
        <button
          className="primary"
          disabled={busy || !unread.length}
          onClick={() => read(unread.map((i) => i.id)).catch(() => {})}
        >
          <CheckCheck size={16} />
          Tümünü okundu yap
        </button>
      </PageHeading>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel records-panel">
        <div className="records-filter">
          <label className="record-checkbox">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Yalnızca okunmamışlar
          </label>
          {items && <div className="notification-progress">
            <span>{unread.length} okunmamış · {items.length} alınan olay</span>
            {items.length > 0 && <progress max={items.length} value={items.length - unread.length} aria-label="Okunan bildirim oranı" />}
          </div>}
        </div>
        {items === null ? (
          <div className="records-loading" role="status">
            Bildirimler yükleniyor…
          </div>
        ) : shown.length ? (
          <div className="notification-list">
            {shown.map((n) => (
              <article
                key={n.id}
                className={n.readAt ? "is-read" : "is-unread"}
              >
                <span className="notification-event-icon">
                  <Bell size={18} />
                </span>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                  <small>
                    {timestamp(n.createdAt)} · {n.type}
                  </small>
                  <div className="notification-actions">
                    {!n.readAt && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => read([n.id]).catch(() => {})}
                      >
                        Okundu yap
                      </button>
                    )}
                    {n.jobId && (
                      <button
                        className="text-button"
                        onClick={() => {
                          if (!n.readAt) read([n.id]).catch(() => {});
                          onJob(n.jobId);
                        }}
                      >
                        İşlem kaydını aç <ArrowUpRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <i aria-label={n.readAt ? "Okundu" : "Okunmadı"} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bell}
            title={
              unreadOnly ? "Okunmamış bildirim yok." : "Henüz bildirim yok."
            }
            description="Sadece gerçekten gerçekleşen işlemlerin olayları burada gösterilir."
          />
        )}
      </section>
    </div>
  );
}

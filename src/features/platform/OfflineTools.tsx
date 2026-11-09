import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api";
import { clearOffline, readOffline, writeOffline } from "../../offline";

type Field = { id: string; name: string; crop?: string; version?: number };
type Task = { name: string; date: string; done?: boolean };
type Draft = { draftId: string; fieldVersion: number; date: string; observation: string };
type OfflineState = {
  userId: string;
  organizationId: string;
  field: Field & { version: number };
  tasks: Task[];
  drafts: Draft[];
};
type Conflict = { name: string; currentVersion: number; draftVersion: number; draft: Draft };

export default function OfflineTools({ userId, organizationId, fields, tasks }: {
  userId: string; organizationId: string; fields: Field[]; tasks: Task[];
}) {
  const sameAccount = (state: OfflineState | null) =>
    state?.userId === userId && state.organizationId === organizationId;
  const [saved, setSaved] = useState<OfflineState | null>(() => {
    const state = readOffline();
    return sameAccount(state) ? state : null;
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const current = readOffline();
      setSaved(current?.userId === userId && current.organizationId === organizationId ? current : null);
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [organizationId, userId]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = fields.find((item) => item.id === form.get("field"));
    if (!field) return;
    setBusy(true);
    setError("");
    try {
      await navigator.serviceWorker.register("/agromax-offline-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const state: OfflineState = {
        userId, organizationId,
        field: { id: field.id, name: field.name, crop: field.crop, version: field.version || 1 },
        tasks: form.get("tasks") ? tasks.filter((item) => !item.done).slice(0, 20)
          .map(({ name, date }) => ({ name, date })) : [],
        drafts: [],
      };
      const current = readOffline();
      if (sameAccount(current) && current.drafts.length)
        throw new Error("Yeni kopya oluşturmadan önce bekleyen notları eşitleyin.");
      writeOffline(state);
      setSaved(state);
      setMessage("Çevrimdışı parsel kopyası bu tarayıcıda hazır.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Çevrimdışı kopya hazırlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function sync(confirmed?: Conflict) {
    const state = readOffline() as OfflineState | null;
    if (!state || !sameAccount(state)) return;
    setError("");
    setMessage("");
    setConflict(null);
    setBusy(true);
    try {
      for (const draft of state.drafts) {
        const fieldVersion = confirmed?.draft.draftId === draft.draftId ? confirmed.currentVersion : draft.fieldVersion;
        try {
          await api("v1/offline/field-notes", { fieldId: state.field.id, ...draft, fieldVersion });
        } catch (e) {
          if (e instanceof ApiError && e.code === "FIELD_VERSION_CONFLICT" &&
            Number.isInteger(e.details?.currentVersion)) {
            setConflict({ ...e.details, draft });
            return;
          }
          throw e;
        }
        const current = readOffline() as OfflineState | null;
        if (!current || !sameAccount(current) || current.field.id !== state.field.id) return;
        current.drafts = current.drafts.filter(({ draftId }) => draftId !== draft.draftId);
        writeOffline(current);
        setSaved(current);
      }
      setMessage("Saha notları değerlendirme kayıtlarına eşitlendi.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eşitleme tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-surface px-section business-workspace offline-tools">
      <h2>Çevrimdışı saha kopyası</h2>
      <p>Bir parsel özetini bu tarayıcıda saklayın. Saha notları yetkili oturumla eşitlenir.</p>
      {!saved?.drafts.length && fields.length > 0 && <form onSubmit={prepare}>
        <label>Çevrimdışı parsel<select name="field" defaultValue={saved?.field.id} required>
          {fields.map((field) => <option value={field.id} key={field.id}>{field.name}</option>)}
        </select></label>
        <label><span><input name="tasks" type="checkbox" style={{ width: "auto" }} /> Açık görevleri de sakla</span></label>
        <button className="primary" disabled={busy} type="submit">Bu cihazda sakla</button>
      </form>}
      {saved && <>
        <p>{saved.field.name} · {saved.drafts.length} eşitlenmemiş not</p>
        <div className="px-actions">
          <a href="/agromax-offline.html">Çevrimdışı saha ekranını aç</a>
          {!!saved.drafts.length && <button className="secondary" disabled={busy} onClick={() => sync()}>Saha notlarını eşitle</button>}
          {!saved.drafts.length && <button className="secondary" disabled={busy} onClick={() => {
            clearOffline(); setSaved(null); setMessage("Çevrimdışı kopya bu tarayıcıdan kaldırıldı.");
          }}>Kopyayı kaldır</button>}
        </div>
      </>}
      {conflict && <div className="business-fact">
        <h3>Parsel sürümü değişti</h3>
        <p>Taslak sürümü {conflict.draftVersion} · Güncel parsel {conflict.name}, sürüm {conflict.currentVersion}</p>
        <blockquote>{conflict.draft.observation}</blockquote>
        <button className="secondary" disabled={busy} onClick={() => sync(conflict)}>Güncel parsel sürümüyle kaydet</button>
      </div>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}

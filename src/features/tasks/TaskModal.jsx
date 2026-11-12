import { CalendarPlus, X, ArrowRight } from "lucide-react";
import useDialogFocus from "../../components/useDialogFocus";
export default function TaskModal({ onClose, onSave, busy, error, initialDate, initialFieldId, fields }) {
  const ref = useDialogFocus(() => !busy && onClose());
  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <section
        className="studio-task-modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="studio-dialog-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Kapat"
        >
          <X size={20} />
        </button>
        <span className="studio-modal-icon">
          <CalendarPlus size={27} />
        </span>
        <span className="studio-kicker">SEZONUNA BİR ADIM EKLE</span>
        <h2 id="new-task-title">Sırada ne var?</h2>
        <p>Yapılacak işi ve planladığın tarihi kaydet.</p>
        <form onSubmit={onSave}>
          <label>
            Görev adı
            <input
              name="name"
              required
              maxLength={150}
              placeholder="Yapılacak işi yazın"
            />
          </label>
          <label>
            Planlanan tarih
            <input type="date" name="date" defaultValue={initialDate} required />
          </label>
          <label>
            Parsel (isteğe bağlı)
            <select name="fieldId" defaultValue={initialFieldId || ""}>
              <option value="">Parsel seçilmedi</option>
              {fields.map((field) => <option value={field.id} key={field.id}>{field.name}</option>)}
            </select>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "Kaydediliyor…" : "Görevi planla"}
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}

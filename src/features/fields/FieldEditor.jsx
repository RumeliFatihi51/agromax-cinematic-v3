import { useState } from "react";
import { Save, X, MapPinned, Info } from "lucide-react";
import { validateGeometry } from "../../../shared/geometry";
import { api } from "../../api";
export default function FieldEditor({
  field,
  geometry,
  drawing,
  onSaved,
  onCancel,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let measured = null,
    geometryError = "";
  try {
    if (geometry) measured = validateGeometry(geometry);
  } catch (e) {
    geometryError = e.message;
  }
  async function save(e) {
    e.preventDefault();
    setError("");
    if (!measured) {
      setError(geometryError || "Önce haritadan parsel sınırınızı çizin.");
      return;
    }
    setBusy(true);
    try {
      const record = await api(
        field ? "records/" + field.id : "records",
        {
          ...Object.fromEntries(new FormData(e.target)),
          kind: "field",
          geometry,
        },
        field ? "PATCH" : "POST",
      );
      onSaved(record);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="inline-parcel-editor editor-v2"
      aria-label="Parsel kayıt paneli"
    >
      <div className="editor-heading">
        <div>
          <span className="eyebrow">AÇIK HARİTADA ÇİZİM</span>
          <h2>{field ? "Parseli düzenle" : "Yeni parsel"}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Düzenlemeyi iptal et"
        >
          <X />
        </button>
      </div>
      <form className="parcel-details-form" onSubmit={save}>
        <p className="editor-form-intro">
          {drawing
            ? "Köşeleri işaretle; ilk köşeye tıklayarak sınırı tamamla."
            : "Çizimini tamamlayıp parsel bilgilerini kaydet."}
        </p>
        <div className="parcel-area">
          <MapPinned />
          <div>
            <strong>
              {measured
                ? measured.area.toLocaleString("tr-TR", {
                    maximumFractionDigits: 3,
                  }) + " da"
                : "Sınır bekleniyor"}
            </strong>
            <small>Çizimden hesaplanan yaklaşık alan</small>
          </div>
        </div>
        <div className="parcel-inputs">
          <label>
            Tarla adı
            <input
              name="name"
              defaultValue={field?.name}
              required
              maxLength={150}
              placeholder="Tarlanıza bir isim verin"
            />
          </label>
          <label>
            Ekili ürün
            <input
              name="crop"
              defaultValue={field?.crop}
              maxLength={100}
              placeholder="Ürün bilgisi"
            />
          </label>
          <label>
            Bölge / konum
            <input
              name="location"
              defaultValue={field?.location}
              maxLength={150}
              placeholder="İl, ilçe veya mevki"
            />
          </label>
          <label>
            Tarla notları <small>İsteğe bağlı</small>
            <textarea
              name="notes"
              defaultValue={field?.notes}
              maxLength={4000}
              rows={3}
              placeholder="Saha gözlemleri, ekim bilgisi veya hatırlatmalar"
            />
          </label>
        </div>
        {(error || geometryError) && (
          <p className="error" role="alert">
            {error || geometryError}
          </p>
        )}
        <div className="editor-actions">
          <p>
            <Info size={15} /> Çizim mülkiyet veya resmî kadastro sınırı beyanı
            değildir. Değişiklikler kaydettiğinizde uygulanır.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Vazgeç
          </button>
          <button className="primary" disabled={busy || !measured || drawing}>
            <Save size={17} />
            {busy ? "Kaydediliyor…" : "Parseli kaydet"}
          </button>
        </div>
      </form>
    </section>
  );
}

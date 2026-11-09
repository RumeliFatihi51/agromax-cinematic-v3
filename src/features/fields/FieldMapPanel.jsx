import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  ArrowUpRight,
  MapPinned,
  PenTool,
  Trash2,
  Satellite,
  ScanLine,
  Sprout,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ParcelMap from "./ParcelMap";
import ParcelPreview from "./ParcelPreview";
import FieldEditor from "./FieldEditor";
import { useAreaFormat } from "../../components/PreferenceProvider";
export default function FieldMapPanel({
  fields,
  atlas = false,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  editing = null,
  editSession = 0,
  draftGeometry,
  onGeometry,
  drawing,
  onDrawing,
  onCancel,
  onSaved,
}) {
  const areaFormat = useAreaFormat();
  const [query, setQuery] = useState("");
  const [browserCollapsed, setBrowserCollapsed] = useState(
    () => window.matchMedia("(max-width:640px)").matches,
  );
  const filtered = fields.filter((f) =>
    `${f.name} ${f.crop} ${f.location}`
      .toLocaleLowerCase("tr-TR")
      .includes(query.toLocaleLowerCase("tr-TR")),
  );
  const displayedFields = useMemo(
    () => fields.filter((f) => f.id !== editing?.id),
    [fields, editing?.id],
  );
  return (
    <section
      className={`field-map-stage ${editing ? "has-inline-editor" : ""}`}
    >
      <ParcelMap
        workbench
        fields={displayedFields}
        geometry={editing?.geometry || null}
        editable={!!editing}
        editSession={editSession}
        onChange={onGeometry}
        onDrawing={onDrawing}
        height={atlas ? "clamp(300px, 40vh, 480px)" : "clamp(450px, calc(100vh - 300px), 1000px)"}
        onSelect={editing ? undefined : onSelect}
      >
        {!atlas && <><div className="map-stage-title" hidden={!!editing}>
          <span className="map-kicker">
            <Satellite size={14} /> UYDU ÇALIŞMA ALANI
          </span>
          <h2>Toprağına yakından bak.</h2>
        </div>
        <aside
          hidden={!!editing}
          className={`map-field-browser ${browserCollapsed ? "map-browser-is-collapsed" : ""}`}
        >
          <div className="map-browser-title">
            <div>
              <span>İŞLETMENİZ</span>
              <h3>
                Tarlalarım <b>{fields.length}</b>
              </h3>
            </div>
            <button
              aria-label="Yeni parsel çiz"
              title="Yeni parsel çiz"
              onClick={onCreate}
            >
              <Plus size={20} />
            </button>
            <button
              className="browser-toggle"
              aria-label={
                browserCollapsed
                  ? "Tarla listesini genişlet"
                  : "Tarla listesini daralt"
              }
              aria-expanded={!browserCollapsed}
              onClick={() => setBrowserCollapsed((v) => !v)}
            >
              {browserCollapsed ? (
                <ChevronDown size={17} />
              ) : (
                <ChevronUp size={17} />
              )}
            </button>
          </div>
          <label className="map-field-search">
            <Search size={16} />
            <input
              placeholder="Tarlalarında ara…"
              aria-label="Tarlalarda ara"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="map-field-results">
            {filtered.map((f) => (
              <article className="map-field-result" key={f.id}>
                <button onClick={() => onSelect(f)}>
                  <ParcelPreview geometry={f.geometry} />
                  <span>
                    <strong>{f.name}</strong>
                    <small>
                      {f.crop || "Ürün eklenmedi"} · {areaFormat.format(f.area)}
                    </small>
                    <em>
                      {f.geometry
                        ? "Parsel sınırı kayıtlı"
                        : "Sınır çizilmesi gerekiyor"}
                    </em>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
                <div className="field-result-actions">
                  <button onClick={() => onEdit(f)}>
                    <PenTool size={12} />
                    Düzenle
                  </button>
                  <button
                    onClick={() => onDelete(f)}
                    aria-label={f.name + " kaldır"}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </article>
            ))}
            {!fields.length && (
              <div className="map-first-field">
                <span>
                  <Sprout size={29} />
                </span>
                <h4>İlk sınır, yeni bir başlangıç.</h4>
                <p>
                  Uydu görüntüsünde tarlanı bul.
                  <br />
                  Köşeleri işaretle, parselini oluştur.
                </p>
                <button onClick={onCreate}>
                  İlk parselimi çiz <ArrowUpRight size={16} />
                </button>
              </div>
            )}
            {fields.length > 0 && !filtered.length && (
              <p className="no-fields-found">Bu aramayla eşleşen tarla yok.</p>
            )}
          </div>
          <div className="map-browser-footer">
            <MapPinned size={15} />
            {fields.filter((f) => f.geometry).length} çizilmiş parsel{" "}
            <span>·</span>{" "}
            {areaFormat.format(fields.reduce((s, f) => s + f.area, 0))} kayıtlı
            alan
          </div>
        </aside></>}
        <div className="map-stage-bottom">
          <span>
            <i />
            Kayıtlı parsel sınırı
          </span>
          <span>
            <ScanLine size={14} />
            {editing
              ? "Açık haritada çiz; kaydederek tamamla."
              : fields.length
                ? "Bir parsele tıklayıp analizlerini aç"
                : "İlk sınırını haritada çiz"}
          </span>
        </div>
      </ParcelMap>
        {editing && (
          <FieldEditor
            key={editSession}
            field={editing.id ? editing : null}
            geometry={draftGeometry}
            drawing={drawing}
            onCancel={onCancel}
            onSaved={onSaved}
          />
        )}

    </section>
  );
}

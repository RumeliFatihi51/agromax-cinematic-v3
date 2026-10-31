import FieldMapPanel from "./FieldMapPanel";
import FieldTable from "./FieldTable";
import { useEffect, useState } from "react";
import {
  Map,
  LayoutList,
  Plus,
  Satellite,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { api, requestAnalysis } from "../../api";
import FieldAnalysis from "./FieldAnalysis";
import { PageHeading } from "../../components/ui/WorkspaceUI";
export default function FieldsWorkspace({
  fields,
  onSaved,
  onDeleted,
  onRestored,
  createRequest = 0,
  onCreateHandled,
  focusField = null,
  analysisMode = false,
}) {
  const [view, setView] = useState("map"),
    [editing, setEditing] = useState(null),
    [editSession, setEditSession] = useState(0),
    [draftGeometry, setDraftGeometry] = useState(null),
    [drawing, setDrawing] = useState(false),
    [savedNotice, setSavedNotice] = useState(""),
    [selected, setSelected] = useState(focusField),
    [cache, setCache] = useState({}),
    [error, setError] = useState(""),
    [deleted, setDeleted] = useState(null),
    [bulkBusy, setBulkBusy] = useState(false),
    [confirming, setConfirming] = useState(null);
  useEffect(() => {
    if (createRequest) {
      startEditing();
      onCreateHandled?.();
    }
  }, [createRequest]);
  useEffect(() => {
    setSelected(focusField || null);
  }, [focusField]);
  useEffect(() => {
    let active = true;
    Promise.all(
      fields.map((f) =>
        api("records/" + f.id + "/analysis").then((d) => [f.id, d.analysis]),
      ),
    )
      .then((pairs) => active && setCache(Object.fromEntries(pairs)))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [fields]);
  const field = fields.find((f) => f.id === selected);
  function startEditing(record = null) {
    setView("map");
    setSelected(null);
    setEditing(record || {});
    setDraftGeometry(record?.geometry || null);
    setDrawing(false);
    setSavedNotice("");
    setEditSession((n) => n + 1);
  }
  function finishEditing(record) {
    onSaved(record);
    setEditing(null);
    setDraftGeometry(null);
    setDrawing(false);
    setSelected(null);
    setSavedNotice(`${record.name} kaydedildi.`);
  }
  function cancelEditing() {
    setEditing(null);
    setDraftGeometry(null);
    setDrawing(false);
  }
  async function remove(f) {
    try {
      await api("records/" + f.id, null, "DELETE");
      setDeleted(f);
      onDeleted(f.id);
      setConfirming(null);
    } catch (e) {
      setError(e.message);
    }
  }
  async function restore() {
    try {
      const f = await api("records/" + deleted.id + "/restore", {});
      onRestored(f);
      setDeleted(null);
    } catch (e) {
      setError(e.message);
    }
  }
  async function bulk() {
    setBulkBusy(true);
    setError("");
    try {
      const status = await api("satellite/status");
      if (!status.configured)
        throw new Error(
          "Copernicus client secret eksik. Bağlantı tamamlanmadan uydu değerleri üretilemez.",
        );
      for (const f of fields.filter((f) => f.geometry)) {
        try {
          const d = await requestAnalysis(f.id);
          setCache((c) => ({ ...c, [f.id]: d.analysis }));
        } catch (e) {
          setError(
            (old) => (old ? old + " · " : "") + f.name + ": " + e.message,
          );
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy(false);
    }
  }
  return (
    <div className="fields-workspace">
      {field && (
        <FieldAnalysis
          key={field.id}
          field={field}
          onBack={() => setSelected(null)}
          onEdit={() => startEditing(field)}
          onAnalysis={(id, a) => setCache((c) => ({ ...c, [id]: a }))}
        />
      )}
      <div hidden={!!field}>
        <PageHeading
          eyebrow={analysisMode ? "UYDU ANALİZLERİ" : "HARİTA & PARSELLER"}
          title={
            analysisMode
              ? "Tarlanın verisine yakından bak."
              : "Toprağını haritaya taşı."
          }
          description="Konum ara, parsel sınırlarını çiz ve tarla kayıtlarını tek bir haritadan yönet."
        >
          <span className="field-count-pill">
            <Satellite size={15} />
            Uydu görünümü
          </span>
        </PageHeading>
        <div className="fields-toolbar">
          <div className="view-switch" aria-label="Tarla görünümü">
            <button
              className={view === "map" ? "active" : ""}
              onClick={() => setView("map")}
            >
              <Map size={17} />
              Harita
            </button>
            <button
              disabled={!!editing}
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <LayoutList size={17} />
              Liste
            </button>
          </div>
          <span>
            {fields.length} tarla · {fields.filter((f) => f.geometry).length}{" "}
            çizilmiş parsel
          </span>
          <button
            className="secondary"
            disabled={!!editing || bulkBusy || !fields.some((f) => f.geometry)}
            onClick={bulk}
          >
            <RefreshCw size={16} className={bulkBusy ? "spin" : ""} />
            {bulkBusy ? "Veriler güncelleniyor…" : "Tüm analizleri güncelle"}
          </button>
          <button
            className="primary"
            disabled={!!editing}
            onClick={() => startEditing()}
          >
            <Plus size={17} />
            Parsel çiz
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {deleted && (
          <div className="undo-banner">
            {deleted.name} kaldırıldı.
            <button className="text-button" onClick={restore}>
              <Undo2 size={15} />
              Geri al
            </button>
          </div>
        )}
        {savedNotice && (
          <div className="inline-parcel-saved" role="status">
            {savedNotice}
          </div>
        )}
        <div hidden={view !== "map"}>
          <FieldMapPanel
            fields={fields}
            onSelect={(f) => setSelected(f.id)}
            onEdit={startEditing}
            onDelete={setConfirming}
            onCreate={() => startEditing()}
            editing={editing}
            editSession={editSession}
            draftGeometry={draftGeometry}
            onGeometry={setDraftGeometry}
            drawing={drawing}
            onDrawing={setDrawing}
            onCancel={cancelEditing}
            onSaved={finishEditing}
          />
        </div>
        {view === "list" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Tarlalarınız, bir bakışta</h2>
                <p>
                  Bu ayın kısmi dönemi ile geçen ayın tamamı karşılaştırılır.
                  Değişimler indeks puanıdır.
                </p>
              </div>
              <Satellite size={20} />
            </div>
            <FieldTable
              fields={fields}
              cache={cache}
              onSelect={setSelected}
              onEdit={startEditing}
              onDelete={setConfirming}
            />
            {!fields.length && (
              <div className="empty">
                <Map size={28} />
                <h3>Henüz tarla kaydı yok.</h3>
                <button className="text-button" onClick={() => startEditing()}>
                  İlk parselinizi çizin
                </button>
              </div>
            )}
          </section>
        )}
      </div>
      {confirming && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Parsel kaldırılsın mı?</h2>
            <p>
              “{confirming.name}” çalışma alanından kaldırılacak. Sonrasında
              “Geri al” ile geri yükleyebilirsiniz.
            </p>
            <div className="editor-actions">
              <button className="secondary" onClick={() => setConfirming(null)}>
                Vazgeç
              </button>
              <button
                className="primary danger-button"
                onClick={() => remove(confirming)}
              >
                Parseli kaldır
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

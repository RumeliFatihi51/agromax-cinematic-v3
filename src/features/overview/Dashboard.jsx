import {
  ArrowUpRight,
  Plus,
  LandPlot,
  CalendarDays,
  Satellite,
  Sprout,
  ChevronRight,
  ArrowRight,
  MapPinned,
  ScanLine,
} from "lucide-react";
import { useEffect, useState } from "react";
import ParcelMap from "../fields/ParcelMap";
import ParcelPreview from "../fields/ParcelPreview";
import FieldEditor from "../fields/FieldEditor";
import { FilizAvatar } from "../../components/Brand";
import {
  PageHeading,
  MetricCard,
  SectionHeading,
  EmptyState,
} from "../../components/ui/WorkspaceUI";
import "./overview.css";

const format = (value) =>
  value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export default function Dashboard({
  user,
  fields,
  tasks,
  onCreate,
  onSelect,
  onNavigate,
  onTask,
  onToggle,
  createRequest = 0,
  onCreateHandled,
  onSaved,
}) {
  const [editing, setEditing] = useState(false),
    [editSession, setEditSession] = useState(0),
    [geometry, setGeometry] = useState(null),
    [drawing, setDrawing] = useState(false),
    [savedNotice, setSavedNotice] = useState("");
  useEffect(() => {
    if (createRequest) {
      setEditing(true);
      setGeometry(null);
      setDrawing(false);
      setSavedNotice("");
      setEditSession((n) => n + 1);
      onCreateHandled?.();
    }
  }, [createRequest]);
  const pending = tasks
      .filter((t) => !t.done)
      .sort((a, b) => a.date.localeCompare(b.date)),
    area = fields.reduce((s, f) => s + f.area, 0),
    mapped = fields.filter((f) => f.geometry).length;
  function finish(record) {
    if (record) {
      onSaved(record);
      setSavedNotice(`${record.name} kaydedildi.`);
    }
    setEditing(false);
    setGeometry(null);
    setDrawing(false);
  }
  return (
    <div className="overview-workspace">
      <PageHeading
        eyebrow="İŞLETMENİN KONTROL MERKEZİ"
        title={
          <>
            Merhaba, {user.name.split(" ")[0]}
            <span className="workspace-title-dot">.</span>
          </>
        }
        description="Tarlaların, planların ve bir sonraki adımın. Hepsi bir arada."
      >
        <button className="secondary" onClick={onTask}>
          <CalendarDays size={17} />
          Görev ekle
        </button>
        <button className="primary" disabled={editing} onClick={onCreate}>
          <Plus size={18} />
          Parsel çiz
        </button>
      </PageHeading>
      {savedNotice && (
        <div className="inline-parcel-saved" role="status">
          {savedNotice}
        </div>
      )}
      <div className="overview-metrics" hidden={editing}>
        <MetricCard
          icon={Sprout}
          label="Tarlalarım"
          value={fields.length}
          unit="tarla"
          detail="Kayıtlı tarla portföyün"
          onClick={() => onNavigate("fields")}
        />
        <MetricCard
          icon={LandPlot}
          label="Toplam alan"
          value={format(area)}
          unit="dekar"
          detail="Tarla kayıtlarından hesaplandı"
          tone="sand"
          onClick={() => onNavigate("fields")}
        />
        <MetricCard
          icon={ScanLine}
          label="Çizilmiş parseller"
          value={mapped}
          unit="parsel"
          detail={
            mapped === fields.length && mapped > 0
              ? "Tüm tarla sınırların kayıtlı"
              : "Haritada sınırı kayıtlı tarlalar"
          }
          tone="blue"
          onClick={() => onNavigate("fields")}
        />
        <MetricCard
          icon={CalendarDays}
          label="Sıradaki işler"
          value={pending.length}
          unit="görev"
          detail="Tamamlanmayı bekleyen planların"
          tone="lilac"
          onClick={() => onNavigate("tasks")}
        />
      </div>
      <div className={`overview-main-grid ${editing ? "is-editing" : ""}`}>
        <section
          className={`overview-map-card ${editing ? "has-inline-editor" : ""}`}
        >
          <SectionHeading
            eyebrow="UYDU ÇALIŞMA ALANI"
            title={editing ? "Parsel sınırını çiz" : "Tarlalarına yakından bak"}
          >
            {!editing && (
              <button
                className="text-button"
                onClick={() => onNavigate("fields")}
              >
                Haritayı aç <ArrowUpRight size={16} />
              </button>
            )}
          </SectionHeading>
          <ParcelMap
            fields={fields}
            height={editing ? 760 : 430}
            compact={false}
            editable={editing}
            editSession={editSession}
            onChange={setGeometry}
            onDrawing={setDrawing}
            onSelect={editing ? undefined : onSelect}
          >
            {!editing && (
              <div className="overview-map-caption">
                <span>
                  <Satellite size={15} />
                  Uydu görünümü
                </span>
                <strong>{mapped} çizilmiş parsel</strong>
              </div>
            )}
            {editing && (
              <FieldEditor
                key={editSession}
                field={null}
                geometry={geometry}
                drawing={drawing}
                onCancel={() => finish()}
                onSaved={finish}
              />
            )}
          </ParcelMap>
          {!editing && (
            <div className="overview-map-foot">
              <span>
                <MapPinned size={15} />
                {fields.length
                  ? "Analiz için bir parsel seç."
                  : "Tarlanı ara, sınırlarını çizerek başla."}
              </span>
              <button onClick={onCreate}>
                Yeni parsel <Plus size={15} />
              </button>
            </div>
          )}
        </section>
        <section className="overview-agenda" hidden={editing}>
          <SectionHeading eyebrow="PLANLA & TAKİP ET" title="Sıradaki işler">
            <button
              className="overview-icon-button"
              onClick={onTask}
              aria-label="Görev ekle"
            >
              <Plus size={18} />
            </button>
          </SectionHeading>
          {pending.length ? (
            <div className="overview-task-list">
              {pending.slice(0, 4).map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => onToggle(t)}
                  />
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {new Date(t.date + "T12:00:00").toLocaleDateString(
                        "tr-TR",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Sıradaki adımı sen belirle."
              description="Ekim, sulama veya saha ziyareti. Yapılacaklarını kaydet, sezonunu düzenle."
            >
              <button className="secondary" onClick={onTask}>
                <Plus size={16} />
                İlk görevini ekle
              </button>
            </EmptyState>
          )}
          <button
            className="overview-card-footer"
            onClick={() => onNavigate("tasks")}
          >
            Tüm görevleri gör <ArrowUpRight size={16} />
          </button>
          <div className="overview-agenda-note">
            <span />
            <p>Bu alan yalnızca kaydettiğin görevleri gösterir.</p>
          </div>
        </section>
      </div>
      <div className="overview-bottom-grid" hidden={editing}>
        <section className="overview-parcels">
          <SectionHeading eyebrow="SANA AİT TOPRAKLAR" title="Tarla portföyün">
            <button
              className="text-button"
              onClick={() => onNavigate("fields")}
            >
              Tümünü gör <ArrowUpRight size={16} />
            </button>
          </SectionHeading>
          {fields.length ? (
            <div className="overview-parcel-list">
              {fields.slice(0, 4).map((f) => (
                <button key={f.id} onClick={() => onSelect(f)}>
                  <ParcelPreview geometry={f.geometry} />
                  <span className="overview-parcel-name">
                    <strong>{f.name}</strong>
                    <small>{f.crop || "Ürün belirtilmedi"}</small>
                  </span>
                  <span
                    className={`overview-parcel-status ${f.geometry ? "has-boundary" : ""}`}
                  >
                    <i />
                    {f.geometry ? "Sınır kayıtlı" : "Sınır bekleniyor"}
                  </span>
                  <span className="overview-parcel-area">
                    {format(f.area)}
                    <small>da</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MapPinned}
              title="İlk tarlanla başlayalım."
              description="Uydu haritasında tarlanı bul, köşeleri işaretle ve ilk parselini kaydet."
            >
              <button className="text-button" onClick={onCreate}>
                İlk parselimi çiz <ArrowRight size={16} />
              </button>
            </EmptyState>
          )}
        </section>
        <section className="overview-guide">
          <div className="overview-guide-art" aria-hidden="true">
            <FilizAvatar size={84} />
            <span>Filiz</span>
          </div>
          <span className="workspace-eyebrow">TARLADAKİ YOL ARKADAŞIN</span>
          <h2>Birlikte bakalım mı?</h2>
          <p>
            Tarla ve görev kayıtlarını Filiz ile gözden geçir. Eksik adımlarını
            daha kolay fark et.
          </p>
          <button onClick={() => onNavigate("assistant")}>
            Filiz ile başla <ArrowUpRight size={17} />
          </button>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  X,
  LoaderCircle,
  Trash2,
  Pencil,
  Droplets,
  Leaf,
  ShieldCheck,
  Wallet,
  ClipboardList,
  FlaskConical,
  Sprout,
  RefreshCw,
  Search,
} from "lucide-react";
import { api } from "../../api";
import type { DomainKind } from "../../../shared/contracts/commercial";
import { choose, moneyMinor, displayMoney, type Locale } from "./i18n";
import type { Field, BusinessRecord, Workspace } from "./types";
import "./commercial.css";
import MeasurementsField from "./MeasurementsField";
import useDialogFocus from "../../components/useDialogFocus";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
interface Input {
  key: string;
  tr: string;
  en: string;
  type?: string;
  options?: string[];
  optional?: boolean;
  max?: number;
  min?: number;
}
const date: Input = { key: "date", tr: "Tarih", en: "Date", type: "date" };
const notes: Input = {
  key: "notes",
  tr: "Notlar",
  en: "Notes",
  type: "textarea",
  optional: true,
};
const state: Input = {
  key: "state",
  tr: "Durum",
  en: "State",
  options: ["planned", "applied"],
};
const config: Record<
  DomainKind,
  {
    tr: string;
    en: string;
    color: string;
    Icon: typeof Droplets;
    fields: Input[];
  }
> = {
  irrigation: {
    tr: "Sulama günlüğü",
    en: "Irrigation journal",
    color: "blue",
    Icon: Droplets,
    fields: [
      date,
      state,
      {
        key: "volumeM3",
        tr: "Su hacmi (m³)",
        en: "Water volume (m³)",
        type: "number",
        min: 0,
      },
      {
        key: "method",
        tr: "Sulama yöntemi",
        en: "Irrigation method",
        options: ["drip", "sprinkler", "surface", "other"],
      },
      {
        key: "durationHours",
        tr: "Süre (saat)",
        en: "Duration (hours)",
        type: "number",
        optional: true,
        min: 0,
      },
      notes,
    ],
  },
  nutrition: {
    tr: "Bitki besleme",
    en: "Crop nutrition",
    color: "green",
    Icon: Leaf,
    fields: [
      date,
      state,
      {
        key: "product",
        tr: "Ürün / gübre adı",
        en: "Product / fertilizer name",
      },
      {
        key: "amountKg",
        tr: "Ürün miktarı (kg)",
        en: "Product amount (kg)",
        type: "number",
        min: 0,
      },
      ...["nitrogen", "phosphorus", "potassium"].map((key, i) => ({
        key: key + "Percent",
        tr: ["Azot", "Fosfor", "Potasyum"][i] + " oranı (%)",
        en: ["Nitrogen", "Phosphorus", "Potassium"][i] + " (%)",
        type: "number",
        optional: true,
        min: 0,
        max: 100,
      })),
      notes,
    ],
  },
  protection: {
    tr: "Bitki koruma",
    en: "Crop protection",
    color: "orange",
    Icon: ShieldCheck,
    fields: [
      date,
      { ...state, options: ["observation", "planned", "applied"] },
      {
        key: "observation",
        tr: "Saha gözlemi",
        en: "Field observation",
        type: "textarea",
      },
      {
        key: "product",
        tr: "Kullanılan ürün",
        en: "Product used",
        optional: true,
      },
      {
        key: "amount",
        tr: "Miktar",
        en: "Amount",
        type: "number",
        optional: true,
        min: 0,
      },
      {
        key: "unit",
        tr: "Miktar birimi",
        en: "Amount unit",
        options: ["L", "kg", "g", "mL"],
        optional: true,
      },
      {
        key: "labelReference",
        tr: "Ruhsat / etiket referansı",
        en: "Authorization / label reference",
        optional: true,
      },
      notes,
    ],
  },
  cost: {
    tr: "Maliyet yönetimi",
    en: "Cost management",
    color: "purple",
    Icon: Wallet,
    fields: [
      date,
      {
        key: "category",
        tr: "Gider kategorisi",
        en: "Expense category",
        options: [
          "seed",
          "irrigation",
          "fertilizer",
          "protection",
          "labor",
          "equipment",
          "other",
        ],
      },
      { key: "title", tr: "Gider adı", en: "Expense title" },
      { key: "amountMinor", tr: "Tutar", en: "Amount", type: "money" },
      {
        key: "currency",
        tr: "Para birimi",
        en: "Currency",
        options: ["TRY", "EUR", "USD", "GBP", "PLN", "RON"],
      },
      notes,
    ],
  },
  season: {
    tr: "Sezon planı",
    en: "Season plan",
    color: "green",
    Icon: Sprout,
    fields: [
      { key: "name", tr: "Sezon adı", en: "Season name" },
      {
        key: "crop",
        tr: "Ürün",
        en: "Crop",
        options: ["wheat", "maize", "other"],
      },
      {
        key: "cropName",
        tr: "Diğer ürün adı",
        en: "Other crop name",
        optional: true,
      },
      { key: "sowingDate", tr: "Ekim tarihi", en: "Sowing date", type: "date" },
      {
        key: "harvestDate",
        tr: "Hasat tarihi",
        en: "Harvest date",
        type: "date",
        optional: true,
      },
      { key: "countryCode", tr: "Ülke kodu", en: "Country code" },
    ],
  },
  soil: {
    tr: "Toprak analizleri",
    en: "Soil reports",
    color: "orange",
    Icon: FlaskConical,
    fields: [
      date,
      { key: "laboratory", tr: "Laboratuvar", en: "Laboratory" },
      { key: "reportReference", tr: "Rapor numarası", en: "Report reference" },
      { key: "method", tr: "Analiz yöntemi", en: "Analysis method" },
      {
        key: "depthCm",
        tr: "Örnek derinliği (cm)",
        en: "Sampling depth (cm)",
        type: "number",
        min: 0,
        max: 300,
      },
      {
        key: "measurements",
        tr: "Analiz sonuçları",
        en: "Analysis results",
        type: "measurements",
      },
      notes,
    ],
  },
  evaluation: {
    tr: "Saha değerlendirmeleri",
    en: "Field evaluations",
    color: "purple",
    Icon: ClipboardList,
    fields: [
      date,
      {
        key: "analysisId",
        tr: "Analiz kaydı kimliği (isteğe bağlı)",
        en: "Analysis record ID (optional)",
        optional: true,
      },
      {
        key: "state",
        tr: "İnceleme durumu",
        en: "Review state",
        options: [
          "pending",
          "in_review",
          "evaluated",
          "needs_field_observation",
        ],
      },
      {
        key: "observation",
        tr: "Değerlendirme ve dayanak",
        en: "Evaluation and evidence",
        type: "textarea",
      },
      notes,
    ],
  },
};
const optionLabels: Record<string, [string, string]> = {
  planned: ["Planlandı", "Planned"],
  applied: ["Uygulandı", "Applied"],
  observation: ["Gözlem", "Observation"],
  drip: ["Damla", "Drip"],
  sprinkler: ["Yağmurlama", "Sprinkler"],
  surface: ["Yüzey", "Surface"],
  other: ["Diğer", "Other"],
  seed: ["Tohum", "Seed"],
  irrigation: ["Sulama", "Irrigation"],
  fertilizer: ["Gübre", "Fertilizer"],
  protection: ["Koruma", "Protection"],
  labor: ["İşçilik", "Labor"],
  equipment: ["Ekipman", "Equipment"],
  wheat: ["Buğday", "Wheat"],
  maize: ["Mısır", "Maize"],
  pending: ["İnceleme bekliyor", "Pending review"],
  in_review: ["İnceleniyor", "In review"],
  evaluated: ["Değerlendirildi", "Evaluated"],
  needs_field_observation: [
    "Ek saha gözlemi gerekli",
    "Field observation needed",
  ],
};
export default function BusinessWorkspace({
  kind,
  fields,
  workspace,
  userId,
  locale,
}: {
  kind: DomainKind;
  fields: Field[];
  workspace: Workspace;
  userId: string;
  locale: Locale;
}) {
  const [records, setRecords] = useState<BusinessRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [pendingDelete, setPendingDelete] = useState<BusinessRecord | null>(null),
    [editor, setEditor] = useState<BusinessRecord | "new" | null>(null),
    [saving, setSaving] = useState(false),
    [summary, setSummary] = useState<
      { currency: string; amountMinor: number }[]
    >([]);
  const definition = config[kind],
    Icon = definition.Icon,
    canWrite = workspace.role !== "viewer";
  const t = (tr: string, en: string) => choose(locale, tr, en);
  const option = (value: string) =>
    optionLabels[value] ? t(...optionLabels[value]) : value;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRecords([]);
    setSummary([]);
    const query = filter ? `?fieldId=${encodeURIComponent(filter)}` : "";
    Promise.all([
      api(`v1/records/${kind}${query}`, undefined, "GET", {
        signal: controller.signal,
      }),
      ...(kind === "cost"
        ? [
            api(`v1/costs/summary${query}`, undefined, "GET", {
              signal: controller.signal,
            }),
          ]
        : []),
    ])
      .then(([data, costs]) => {
        if (!controller.signal.aborted) {
          setRecords(data.records);
          if (costs) setSummary(costs.totals);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, filter, reload, workspace.id]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget),
        data: Record<string, unknown> = { fieldId: form.get("fieldId") };
      for (const field of definition.fields) {
        const raw = String(form.get(field.key) || "").trim();
        if (field.type === "number") data[field.key] = raw ? Number(raw) : null;
        else if (field.type === "money")
          data[field.key] = moneyMinor(raw, locale);
        else if (field.key === "measurements") {
          const parameters = form.getAll("measurement.parameter"),
            values = form.getAll("measurement.value"),
            units = form.getAll("measurement.unit");
          data[field.key] = parameters.map((parameter, i) => ({
            parameter: String(parameter).trim(),
            value: String(values[i]).trim() ? Number(values[i]) : null,
            unit: String(units[i]).trim(),
          }));
        } else if (["analysisId", "harvestDate", "unit"].includes(field.key))
          data[field.key] = raw || null;
        else data[field.key] = raw;
      }
      if (editor && editor !== "new")
        await api(
          `v1/records/${kind}/${editor.id}`,
          { version: editor.version, data },
          "PATCH",
        );
      else await api(`v1/records/${kind}`, data);
      setEditor(null);
      setReload((n) => n + 1);
      setPendingDelete(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("Kaydedilemedi.", "Unable to save."),
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(record: BusinessRecord) {
    setError("");
    setSaving(true);
    try {
      await api(
        `v1/records/${kind}/${record.id}`,
        { version: record.version },
        "DELETE",
      );
      setPendingDelete(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("Kaldırılamadı.", "Unable to remove."),
      );
    } finally {
      setSaving(false);
    }
  }
  function defaultValue(field: Input) {
    if (!editor || editor === "new")
      return field.key === "countryCode"
        ? workspace.countryCode
        : field.key === "currency"
          ? workspace.countryCode === "TR"
            ? "TRY"
            : "EUR"
          : "";
    const value = editor.data[field.key];
    if (field.key === "amountMinor" && typeof value === "number")
      return (value / 100).toFixed(2).replace(".", locale === "tr" ? "," : ".");
    return typeof value === "object" && value !== null
      ? JSON.stringify(value, null, 2)
      : value === null || value === undefined
        ? ""
        : String(value);
  }
  const displayed = records.filter((record) => {
    const field = fields.find((f) => f.id === record.fieldId);
    return `${field?.name || ""} ${Object.values(record.data).join(" ")}`
      .toLocaleLowerCase(locale)
      .includes(query.trim().toLocaleLowerCase(locale));
  });
  return (
    <div className={`business-workspace business-${definition.color}`}>
      <div className="studio-page-title">
        <div>
          <span className="studio-kicker">
            {t(
              "GERÇEK KAYITLAR, İZLENEBİLİR ADIMLAR",
              "REAL RECORDS, TRACEABLE ACTIONS",
            )}
          </span>
          <h1>{t(definition.tr, definition.en)}</h1>
          <p>
            {t(
              "Kendi saha ve uygulama kayıtlarını planla, kaydet ve takip et.",
              "Plan, record and track your own field observations and operations.",
            )}
          </p>
        </div>
        <button
          className="primary"
          disabled={!canWrite || !fields.length}
          onClick={() => setEditor("new")}
        >
          <Plus size={18} />
          {t("Yeni kayıt", "New record")}
        </button>
      </div>
      <div
        className="canopy-record-summary"
        aria-label={t("Kayıt özeti", "Record overview")}
      >
        <article>
          <span className={`canopy-summary-icon ${definition.color}`}>
            <Icon size={22} aria-hidden="true" />
          </span>
          <div>
            <small>{t("Kayıtlı işlem", "Saved records")}</small>
            <strong>{loading ? "—" : records.length}</strong>
          </div>
        </article>
        <article>
          <span className="canopy-summary-icon green">
            <LandParcelIcon />
          </span>
          <div>
            <small>{t("İlgili parseller", "Parcels with records")}</small>
            <strong>
              {loading ? "—" : new Set(records.map((r) => r.fieldId)).size}
            </strong>
          </div>
        </article>
        <article>
          <span className="canopy-summary-icon orange">
            <ClipboardList size={22} aria-hidden="true" />
          </span>
          <div>
            <small>{t("Planlanan işlem", "Planned records")}</small>
            <strong>
              {loading
                ? "—"
                : records.filter((r) => r.data.state === "planned").length}
            </strong>
          </div>
        </article>
      </div>
      <div className="business-toolbar">
        <Icon size={21} />
        <select
          value={filter}
          aria-label={t("Parsel filtresi", "Parcel filter")}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">{t("Tüm tarlalar", "All parcels")}</option>
          {fields.map((f) => (
            <option value={f.id} key={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <label className="canopy-record-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label={t("Kayıtlarda ara", "Search records")}
            placeholder={t("Kayıtlarda ara…", "Search records…")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span>
          {loading ? "…" : records.length} {t("kayıt", "records")}
        </span>
        <button
          className="secondary"
          onClick={() => setReload((n) => n + 1)}
          disabled={loading}
        >
          <RefreshCw size={16} />
          {t("Yenile", "Refresh")}
        </button>
      </div>
      {kind === "cost" && summary.length > 0 && (
        <div className="business-money-summary">
          {summary.map((s) => (
            <article key={s.currency}>
              <small>{s.currency}</small>
              <strong>{displayMoney(s.amountMinor, s.currency, locale)}</strong>
              <span>
                {t("Kayıtlı gider toplamı", "Recorded expense total")}
              </span>
            </article>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="business-register">
        {loading ? (
          <div className="business-empty" role="status">
            <LoaderCircle size={27} className="spin" />
            {t("Kayıtlar yükleniyor…", "Loading records…")}
          </div>
        ) : displayed.length ? (
          <div className="business-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Parsel", "Parcel")}</th>
                  <th>{t("Tarih / sezon", "Date / season")}</th>
                  <th>{t("Kayıt özeti", "Record summary")}</th>
                  <th>{t("Durum / miktar", "State / amount")}</th>
                  <th>
                    <span className="sr-only">{t("İşlemler", "Actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" data-label={t("Parsel", "Parcel")}>
                      {fields.find((f) => f.id === r.fieldId)?.name ||
                        r.fieldId}
                    </th>
                    <td data-label={t("Tarih / sezon", "Date / season")}>
                      {String(r.data.date || r.data.sowingDate || "—")}
                    </td>
                    <td data-label={t("Kayıt özeti", "Record summary")}>
                      {String(
                        r.data.title ||
                          r.data.name ||
                          r.data.product ||
                          r.data.observation ||
                          r.data.laboratory ||
                          "—",
                      )}
                      <small>
                        {t("Kullanıcı kaydı", "User-entered record")}
                      </small>
                    </td>
                    <td data-label={t("Durum / miktar", "State / amount")}>
                      {kind === "cost"
                        ? displayMoney(
                            Number(r.data.amountMinor),
                            String(r.data.currency),
                            locale,
                          )
                        : kind === "irrigation"
                          ? `${r.data.volumeM3} m³`
                          : kind === "nutrition"
                            ? `${r.data.amountKg} kg`
                            : option(
                                String(r.data.state || r.data.crop || "—"),
                              )}
                    </td>
                    <td>
                      {canWrite &&
                        (workspace.role !== "worker" ||
                          r.createdBy === userId) && (
                          <div className="business-row-actions">
                            <button
                              aria-label={t("Kaydı düzenle", "Edit record")}
                              onClick={() => setEditor(r)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              aria-label={t("Kaydı kaldır", "Remove record")}
                              disabled={saving}
                              onClick={() => {
                                setError("");
                                setPendingDelete(r);
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="business-empty">
            <Icon size={35} />
            <h2>
              {query
                ? t("Aramana uygun kayıt yok.", "No matching records.")
                : t("Bu alanda henüz kaydın yok.", "No records here yet.")}
            </h2>
            <p>
              {fields.length
                ? t(
                    "Yeni kayıt oluşturarak kendi verilerinle başla.",
                    "Create a record with your own data.",
                  )
                : t(
                    "Önce harita üzerinden bir parsel ekle.",
                    "Add a parcel on the map first.",
                  )}
            </p>
            {query ? (
              <button className="secondary" onClick={() => setQuery("")}>
                {t("Aramayı temizle", "Clear search")}
              </button>
            ) : fields.length && canWrite ? (
              <button className="primary" onClick={() => setEditor("new")}>
                <Plus size={17} />
                {t("İlk kaydını oluştur", "Create your first record")}
              </button>
            ) : !fields.length ? (
              <a className="primary" href="#fields">
                {t("Haritaya git", "Open map")}
              </a>
            ) : null}
          </div>
        )}
      </section>
      <aside className="business-data-note">
        <ShieldCheck size={18} />
        <p>
          {kind === "cost"
            ? t(
                "Para birimleri ayrı toplanır. Belgeli kur olmadan döviz dönüşümü yapılmaz.",
                "Currencies are totaled separately. No exchange conversion is invented.",
              )
            : t(
                "Bu kayıtlar kullanıcı beyanıdır. Otomatik agronomik öneriler yalnızca doğrulanmış ürün/bölge yöntemi ve yeterli girdilerle etkinleşir.",
                "These are user-entered records. Automatic agronomic advice requires a validated crop/region method and sufficient inputs.",
              )}
        </p>
      </aside>
      {pendingDelete && (
        <ConfirmDialog
          title={t("Kayıt kaldırılsın mı?", "Remove this record?")}
          description={t(
            "Bu işlem kaydı aktif listeden kaldırır. Devam etmek istediğinden emin misin?",
            "This removes the record from the active list. Do you want to continue?",
          )}
          confirmLabel={
            saving
              ? t("Kaldırılıyor…", "Removing…")
              : t("Kaydı kaldır", "Remove record")
          }
          cancelLabel={t("Vazgeç", "Cancel")}
          closeLabel={t("Pencereyi kapat", "Close dialog")}
          busy={saving}
          error={error}
          onConfirm={() => remove(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}
      {editor && (
        <RecordDialog
          onClose={() => {
            if (!saving) setEditor(null);
          }}
        >
          <header>
            <div>
              <span className="studio-kicker">
                {t(definition.tr, definition.en)}
              </span>
              <h2 id="business-editor-title">
                {editor === "new"
                  ? t("Yeni kayıt", "New record")
                  : t("Kaydı düzenle", "Edit record")}
              </h2>
            </div>
            <button
              aria-label={t("Kapat", "Close")}
              onClick={() => setEditor(null)}
              disabled={saving}
            >
              <X size={21} />
            </button>
          </header>
          <form onSubmit={save}>
            <label>
              {t("Parsel", "Parcel")}
              <select
                name="fieldId"
                required
                defaultValue={
                  editor === "new" ? filter || fields[0]?.id : editor.fieldId
                }
              >
                {fields.map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="business-form-grid">
              {definition.fields.map((f) => (
                <label
                  key={f.key}
                  className={
                    ["textarea", "measurements"].includes(f.type || "")
                      ? "full"
                      : ""
                  }
                >
                  {t(f.tr, f.en)}
                  {f.type === "measurements" ? (
                    <MeasurementsField
                      key={editor === "new" ? "new" : editor.id}
                      initial={
                        editor === "new" ? undefined : editor.data.measurements
                      }
                      locale={locale}
                    />
                  ) : f.options ? (
                    <select
                      name={f.key}
                      required={!f.optional}
                      defaultValue={defaultValue(f)}
                    >
                      {f.optional && <option value="">—</option>}
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {option(o)}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      name={f.key}
                      required={!f.optional}
                      defaultValue={defaultValue(f)}
                      rows={3}
                      maxLength={f.key === "measurements" ? 12000 : 4000}
                    />
                  ) : (
                    <input
                      name={f.key}
                      type={f.type === "money" ? "text" : f.type || "text"}
                      inputMode={f.type === "money" ? "decimal" : undefined}
                      step={f.type === "number" ? "any" : undefined}
                      min={f.min}
                      max={f.max}
                      maxLength={
                        f.type !== "number" && f.type !== "date"
                          ? 500
                          : undefined
                      }
                      required={!f.optional}
                      defaultValue={defaultValue(f)}
                    />
                  )}
                </label>
              ))}
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor(null)}
                disabled={saving}
              >
                {t("Vazgeç", "Cancel")}
              </button>
              <button className="primary" disabled={saving}>
                {saving && <LoaderCircle size={16} className="spin" />}
                {t("Kaydı kaydet", "Save record")}
              </button>
            </footer>
          </form>
        </RecordDialog>
      )}
    </div>
  );
}

function LandParcelIcon() {
  return <Sprout size={22} aria-hidden="true" />;
}

function RecordDialog({
  children,
  onClose,
}: {
  children: import("react").ReactNode;
  onClose: () => void;
}) {
  const ref = useDialogFocus(onClose);
  return createPortal(
    <div className="business-dialog-backdrop">
      <section
        ref={ref}
        className="business-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-editor-title"
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

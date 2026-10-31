import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Sprout, ArrowRight, X, LoaderCircle } from "lucide-react";
import AppShell from "./components/AppShell";
import Auth from "./components/Auth";
import TaskModal from "./features/tasks/TaskModal";
import { modules } from "./features/modules";
import { I } from "./components/icons";
import { api } from "./api";
import { LogoMark } from "./components/Brand";
import ErrorBoundary from "./components/ErrorBoundary";
const Dashboard = lazy(() => import("./features/overview/Dashboard"));
const FieldsWorkspace = lazy(() => import("./features/fields/FieldsWorkspace"));
const Filiz = lazy(() => import("./features/assistant/Filiz"));
const IntegrationStatus = lazy(
  () => import("./features/integrations/IntegrationStatus"),
);
const TaskBoard = lazy(() => import("./features/tasks/TaskBoard"));
const WeatherDashboard = lazy(
  () => import("./features/weather/WeatherDashboard"),
);
const AnalysisHistory = lazy(
  () => import("./features/history/AnalysisHistory"),
);
const Notifications = lazy(
  () => import("./features/notifications/Notifications"),
);
export default function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [records, setRecords] = useState([]),
    [recordError, setRecordError] = useState(""),
    [page, setPage] = useState("overview"),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [saving, setSaving] = useState(false),
    [createRequest, setCreateRequest] = useState(0),
    [focus, setFocus] = useState(null),
    [reload, setReload] = useState(0),
    [notifications, setNotifications] = useState(null),
    [historyFocus, setHistoryFocus] = useState(null);
  useEffect(() => {
    api("me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setReady(false);
    setRecordError("");
    api("records")
      .then((data) => {
        if (active) {
          setRecords(data);
          setReady(true);
        }
      })
      .catch((e) => active && setRecordError(e.message));
    return () => {
      active = false;
    };
  }, [user, reload]);
  useEffect(() => {
    setNotifications(null);
    if (!user) return;
    const controller = new AbortController();
    const load = () =>
      api("notifications", undefined, "GET", { signal: controller.signal })
        .then((data) => {
          if (Array.isArray(data.notifications))
            setNotifications(data.notifications);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [user]);
  const fields = useMemo(
      () => records.filter((r) => r.kind === "field"),
      [records],
    ),
    tasks = useMemo(() => records.filter((r) => r.kind === "task"), [records]);
  function navigate(id) {
    setPage(id);
    setFocus(null);
    setHistoryFocus(null);
    setError("");
  }
  function create() {
    setFocus(null);
    if (page !== "overview") setPage("fields");
    setCreateRequest((n) => n + 1);
  }
  function analyze(field) {
    setFocus(field.id);
    setPage("satellite");
  }
  async function saveTask(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const record = await api("records", {
        ...Object.fromEntries(new FormData(e.target)),
        kind: "task",
      });
      setRecords((v) => [...v, record]);
      setModal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function toggle(task) {
    try {
      const record = await api(
        "records/" + task.id,
        { done: !task.done },
        "PATCH",
      );
      setRecords((v) => v.map((r) => (r.id === record.id ? record : r)));
    } catch (e) {
      setError(e.message);
    }
  }
  async function logout() {
    try {
      await api("logout", {});
      setUser(null);
      setRecords([]);
      setReady(false);
      setPage("overview");
    } catch (e) {
      setError(e.message);
    }
  }
  function openTask() {
    setError("");
    setModal(true);
  }
  if (loading)
    return (
      <div className="studio-loading">
        <span>
          <LogoMark size={68} />
        </span>
        <strong>agromax.</strong>
        <p>Çalışma alanın hazırlanıyor…</p>
        <LoaderCircle size={18} className="spin" />
      </div>
    );
  if (!user) return <Auth onLogin={setUser} />;
  const descriptor = modules.find((m) => m[0] === page) || modules[0],
    PageIcon = I[descriptor[2]] || I.Sprout;
  let content;
  if (!ready)
    content = recordError ? (
      <section className="studio-module-empty">
        <span>
          <Sprout size={32} />
        </span>
        <h1>Kayıtlar yüklenemedi.</h1>
        <p>{recordError}</p>
        <button className="primary" onClick={() => setReload((n) => n + 1)}>
          Yeniden dene
        </button>
      </section>
    ) : (
      <div
        className="studio-skeleton"
        aria-label="Kayıtlar yükleniyor"
        aria-busy="true"
      >
        <div />
        <section>
          <i />
          <i />
          <i />
        </section>
        <article />
      </div>
    );
  else if (page === "overview")
    content = (
      <Dashboard
        user={user}
        fields={fields}
        tasks={tasks}
        onCreate={create}
        onSelect={analyze}
        onNavigate={navigate}
        onTask={openTask}
        onToggle={toggle}
        createRequest={createRequest}
        onCreateHandled={() => setCreateRequest(0)}
        onSaved={(record) =>
          setRecords((v) => [...v.filter((r) => r.id !== record.id), record])
        }
      />
    );
  else if (page === "history")
    content = <AnalysisHistory focusJob={historyFocus} />;
  else if (page === "notifications")
    content = (
      <Notifications
        onChanged={setNotifications}
        onJob={(id) => {
          setHistoryFocus(id);
          setPage("history");
        }}
      />
    );
  else if (["fields", "satellite"].includes(page))
    content = (
      <FieldsWorkspace
        fields={fields}
        createRequest={createRequest}
        onCreateHandled={() => setCreateRequest(0)}
        focusField={focus}
        analysisMode={page === "satellite"}
        onSaved={(record) =>
          setRecords((v) =>
            v.some((r) => r.id === record.id)
              ? v.map((r) => (r.id === record.id ? record : r))
              : [...v, record],
          )
        }
        onDeleted={(id) => setRecords((v) => v.filter((r) => r.id !== id))}
        onRestored={(record) =>
          setRecords((v) => [...v.filter((r) => r.id !== record.id), record])
        }
      />
    );
  else if (page === "tasks")
    content = <TaskBoard tasks={tasks} onToggle={toggle} onCreate={openTask} />;
  else if (page === "weather")
    content = <WeatherDashboard fields={fields} onNavigate={navigate} />;
  else if (page === "assistant")
    content = <Filiz fields={fields} tasks={tasks} onNavigate={navigate} />;
  else if (page === "integrations")
    content = (
      <>
        <div className="studio-page-title">
          <div>
            <span className="studio-kicker">KAYNAĞI BELLİ, ANLAMI AÇIK</span>
            <h1>Verilerinin bağlantı noktası.</h1>
            <p>Harita, uydu ve diğer veri kaynaklarını buradan takip et.</p>
          </div>
        </div>
        <IntegrationStatus />
      </>
    );
  else
    content = (
      <>
        <div className="studio-page-title">
          <div>
            <span className="studio-kicker">AGROMAX ÇALIŞMA ALANI</span>
            <h1>{descriptor[1]}</h1>
          </div>
        </div>
        <section className={`studio-module-empty module-${descriptor[3]}`}>
          <span>
            <PageIcon size={36} />
          </span>
          <small>GELİŞTİRME AŞAMASINDA</small>
          <h2>
            {page === "weather"
              ? "Havanın bilgisini, kaynağından alacağız."
              : "Bu alanın yeni araçları hazırlanıyor."}
          </h2>
          <p>
            {page === "weather"
              ? "Meteoroloji bağlantısı tamamlandığında konuma ait gerçek gözlemler ve tarihli tahminler burada yer alacak."
              : "Bu modül henüz etkin değil. Gerekli veri bağlantıları ve iş akışları tamamlandığında kullanıma açılacak."}
          </p>
          <button
            className="secondary"
            onClick={() => navigate("integrations")}
          >
            Veri bağlantılarına bak
            <ArrowRight size={17} />
          </button>
        </section>
      </>
    );
  return (
    <AppShell
      page={page}
      user={user}
      fields={fields}
      tasks={tasks}
      notifications={notifications}
      onNavigate={navigate}
      onField={analyze}
      onCreate={create}
      onLogout={logout}
    >
      {error && !modal && (
        <div className="studio-error-banner" role="alert">
          <p>{error}</p>
          <button aria-label="Bildirimi kapat" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <ErrorBoundary resetKey={page}>
        <Suspense
          fallback={
            <div className="studio-module-loading" role="status">
              <LoaderCircle size={22} className="spin" />
              Çalışma alanı açılıyor…
            </div>
          }
        >
          {content}
        </Suspense>
      </ErrorBoundary>
      {modal && (
        <TaskModal
          onClose={() => setModal(false)}
          onSave={saveTask}
          busy={saving}
          error={error}
        />
      )}
    </AppShell>
  );
}

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Sprout, ArrowRight, X, LoaderCircle } from "lucide-react";
import AppShell from "./components/AppShell";
import Auth from "./components/Auth";
import TaskModal from "./features/tasks/TaskModal";
import { modules, canonicalPage, operationPages } from "./features/modules";
import { I } from "./components/icons";
import { api, setOrganizationId } from "./api";
import { LogoMark } from "./components/Brand";
import ErrorBoundary from "./components/ErrorBoundary";
import PreferenceProvider from "./components/PreferenceProvider";
import useWorkspacePage from "./components/useWorkspacePage";
import { platformPages } from "../shared/platform";
const PlatformWorkspace = lazy(() => import("./features/platform/PlatformWorkspace"));
const Dashboard = lazy(() => import("./features/overview/Dashboard"));
const FieldsWorkspace = lazy(() => import("./features/fields/FieldsWorkspace"));
const Filiz = lazy(() => import("./features/assistant/Filiz"));
const IntegrationStatus = lazy(
  () => import("./features/integrations/IntegrationStatus"),
);
const TaskBoard = lazy(() => import("./features/tasks/TaskBoard"));
const Onboarding = lazy(() => import("./features/commercial/Onboarding"));
const BusinessWorkspace = lazy(
  () => import("./features/commercial/BusinessWorkspace"),
);
const AccountSettings = lazy(
  () => import("./features/commercial/AccountSettings"),
);
const ReportsWorkspace = lazy(
  () => import("./features/commercial/ReportsWorkspace"),
);
const OperationsWorkspace = lazy(
  () => import("./features/commercial/OperationsWorkspace"),
);
const WeatherWorkspace = lazy(
  () => import("./features/commercial/WeatherWorkspace"),
);
const FilizWorkspace = lazy(
  () => import("./features/commercial/FilizWorkspace"),
);
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
  const [page, setPage] = useWorkspacePage();
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [records, setRecords] = useState([]),
    [recordError, setRecordError] = useState(""),
    [error, setError] = useState(""),
    [modal, setModal] = useState(false),
    [saving, setSaving] = useState(false),
    [createRequest, setCreateRequest] = useState(0),
    [focus, setFocus] = useState(null),
    [reload, setReload] = useState(0),
    [notifications, setNotifications] = useState(null),
    [historyFocus, setHistoryFocus] = useState(null),
    [commercial, setCommercial] = useState(null),
    [commercialError, setCommercialError] = useState(""),
    [operationPage, setOperationPage] = useState("seasons");
  const activeWorkspace =
    commercial?.organizations.find(
      (o) => o.id === commercial.preferences?.activeOrganizationId,
    ) || commercial?.organizations[0];
  async function reloadWorkspace() {
    const data = await api("v1/bootstrap");
    const selected =
      data.organizations.find(
        (o) => o.id === data.preferences?.activeOrganizationId,
      ) || data.organizations[0];
    setOrganizationId(selected?.id);
    setCommercial(data);
    setCommercialError("");
    setUser((previous) =>
      previous ? { ...previous, ...data.user, commercial: true } : previous,
    );
  }
  useEffect(() => {
    if (!user?.commercial) {
      setCommercial(null);
      return;
    }
    const controller = new AbortController();
    setCommercialError("");
    api("v1/bootstrap", undefined, "GET", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const selected =
          data.organizations.find(
            (o) => o.id === data.preferences?.activeOrganizationId,
          ) || data.organizations[0];
        setOrganizationId(selected?.id);
        setCommercial(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setCommercialError(e.message);
      });
    return () => controller.abort();
  }, [user?.id, user?.commercial]);
  useEffect(() => {
    api("me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (
      !user ||
      (user.commercial && (!commercial || commercial.onboardingRequired))
    )
      return;
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
  }, [
    user?.id,
    user?.commercial,
    reload,
    commercial?.onboardingRequired,
    commercial?.preferences?.activeOrganizationId,
  ]);
  useEffect(() => {
    setNotifications(null);
    if (
      !user ||
      (user.commercial && (!commercial || commercial.onboardingRequired))
    )
      return;
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
  }, [
    user?.id,
    commercial?.preferences?.activeOrganizationId,
    commercial?.onboardingRequired,
  ]);
  const fields = useMemo(
      () => records.filter((r) => r.kind === "field"),
      [records],
    ),
    tasks = useMemo(() => records.filter((r) => r.kind === "task"), [records]);
  function navigate(id) {
    if (operationPages.includes(id)) setOperationPage(id);
    setPage(canonicalPage(id));
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
    setPage("fields");
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
    } catch (e) {
      if (e.status !== 401) {
        setError(e.message);
        return;
      }
    }
    setOrganizationId("");
    setCommercial(null);
    setUser(null);
    setRecords([]);
    setReady(false);
    setPage("overview");
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
  if (
    !user ||
    new URLSearchParams(window.location.search).get("flow") === "reset"
  )
    return <Auth onLogin={setUser} />;
  if (user.commercial && !commercial)
    return (
      <section className="studio-module-empty">
        {commercialError ? (
          <>
            <h1>Çalışma alanı yüklenemedi.</h1>
            <p>{commercialError}</p>
            <button className="primary" onClick={reloadWorkspace}>
              Yeniden dene
            </button>
            <button className="secondary" onClick={logout}>
              Çıkış yap
            </button>
          </>
        ) : (
          <LoaderCircle className="spin" size={26} />
        )}
      </section>
    );
  if (user.commercial && commercial.onboardingRequired)
    return (
      <Suspense
        fallback={
          <div className="studio-module-loading">
            <LoaderCircle className="spin" size={24} />
          </div>
        }
      >
        <Onboarding onSaved={reloadWorkspace} onLogout={logout} />
      </Suspense>
    );
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
  else if (platformPages.includes(page))
    content = <PlatformWorkspace key={`${activeWorkspace?.id || user.id}:${page}`} page={page} fields={fields} onNavigate={navigate} onSelect={analyze} commercial={!!activeWorkspace} canWrite={!activeWorkspace || activeWorkspace.role !== 'viewer'} />;
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
        commercial={!!activeWorkspace}
        customAnalysis={commercial?.capabilities?.customAnalysis !== false}
        canAnalyze={
          !activeWorkspace ||
          (activeWorkspace.role !== "viewer" && commercial.user.emailVerified)
        }
        locale={commercial?.preferences?.locale || "tr"}
        favorites={commercial?.preferences?.metricFavorites || []}
        onFavorites={async (ids) => {
          await api("v1/preferences", { metricFavorites: ids }, "PATCH");
          setCommercial((data) => ({
            ...data,
            preferences: { ...data.preferences, metricFavorites: ids },
          }));
        }}
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
    content = activeWorkspace ? (
      <WeatherWorkspace
        key={activeWorkspace.id}
        fields={fields}
        locale={commercial.preferences?.locale || "tr"}
        onNavigate={navigate}
      />
    ) : (
      <WeatherDashboard fields={fields} onNavigate={navigate} />
    );
  else if (activeWorkspace && page === "finance")
    content = (
      <BusinessWorkspace
        key={`${activeWorkspace.id}:cost`}
        kind="cost"
        fields={fields}
        workspace={activeWorkspace}
        userId={user.id}
        locale={commercial.preferences?.locale || "tr"}
      />
    );
  else if (activeWorkspace && page === "operations")
    content = (
      <OperationsWorkspace
        key={activeWorkspace.id}
        active={operationPage}
        onActive={setOperationPage}
        fields={fields}
        workspace={activeWorkspace}
        userId={user.id}
        locale={commercial.preferences?.locale || "tr"}
      />
    );
  else if (activeWorkspace && page === "settings")
    content = (
      <AccountSettings
        bootstrap={commercial}
        workspace={activeWorkspace}
        onChanged={reloadWorkspace}
        onLogout={logout}
      />
    );
  else if (activeWorkspace && page === "reports")
    content = (
      <ReportsWorkspace
        key={activeWorkspace.id}
        fields={fields}
        organizationId={activeWorkspace.id}
        dailyLimit={commercial?.capabilities?.reportDailyLimit}
        locale={commercial.preferences?.locale || "tr"}
        canCreate={activeWorkspace.role !== "viewer"}
      />
    );
  else if (page === "assistant")
    content = activeWorkspace ? (
      <FilizWorkspace
        key={activeWorkspace.id}
        fields={fields}
        workspace={activeWorkspace}
        locale={commercial.preferences?.locale || "tr"}
        onConfirmed={() => setReload((n) => n + 1)}
      />
    ) : (
      <Filiz fields={fields} tasks={tasks} onNavigate={navigate} />
    );
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
    <PreferenceProvider preferences={commercial?.preferences}>
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
        workspace={activeWorkspace}
        organizationControl={
          commercial && (
            <select
              className="business-organization-select"
              aria-label="Çalışma alanı seç"
              value={activeWorkspace?.id || ""}
              onChange={async (event) => {
                const id = event.target.value,
                  previous = activeWorkspace?.id;
                setReady(false);
                setRecords([]);
                setOrganizationId(id);
                try {
                  await api("v1/organizations/select", { organizationId: id });
                  await reloadWorkspace();
                } catch (e) {
                  setOrganizationId(previous);
                  setError(e.message);
                  setReload((n) => n + 1);
                }
              }}
            >
              {commercial.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )
        }
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
    </PreferenceProvider>
  );
}

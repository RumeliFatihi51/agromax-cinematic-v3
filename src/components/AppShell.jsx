import { useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ChevronRight,
  LogOut,
  Cable,
  ArrowUpRight,
  X,
  Menu,
  Bell,
  Settings2,
  Layers3, ChartNoAxesColumn, Box, Waypoints, ClipboardCheck, Sprout,
} from "lucide-react";
import { availableModules, navigationGroups } from "../features/modules";
import { I } from "./icons";
import QuickSearch from "./QuickSearch";
const sectionIcons = [Layers3, ChartNoAxesColumn, Box, Waypoints, ClipboardCheck];
export default function AppShell({
  page,
  user,
  fields,
  tasks,
  notifications = [],
  onNavigate,
  onField,
  onCreate,
  onLogout,
  children,
  workspace,
  organizationControl,
}) {
  const [mobile, setMobile] = useState(false),
    [slim, setSlim] = useState(() => {
      try {
        return localStorage.getItem("agromax.sidebar") === "slim";
      } catch {
        return false;
      }
    }),
    [search, setSearch] = useState(false);
  const menuButton = useRef(null),
    sidebar = useRef(null),
    content = useRef(null);
  const modules = availableModules(!!workspace);
  const active = modules.find((m) => m[0] === page) || modules[0],
    pending = tasks.filter((t) => !t.done).length;
  const roles = {
    owner: "İşletme sahibi",
    manager: "Yönetici",
    worker: "Ekip üyesi",
    viewer: "Görüntüleme",
  };
  useEffect(() => {
    if (page === "overview" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const transition = content.current?.animate(
      [{ opacity: 0.72, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 220, easing: "cubic-bezier(.18,.8,.3,1)" },
    );
    return () => transition?.cancel();
  }, [page]);
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("agromax.sidebar", slim ? "slim" : "full");
    } catch {}
  }, [slim]);
  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector(".studio-mobile-close")?.focus();
    const close = (event) => {
      if (event.key === "Escape") {
        setMobile(false);
      }
      if (event.key === "Tab") {
        const targets = [
          ...(sidebar.current?.querySelectorAll("button, a[href]") || []),
        ].filter((node) => !node.disabled && node.getClientRects().length);
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const viewport = window.matchMedia("(min-width:641px)");
    const closeOnDesktop = () => {
      if (viewport.matches) setMobile(false);
    };
    viewport.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", close);
      viewport.removeEventListener("change", closeOnDesktop);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobile]);
  function navigate(id) {
    onNavigate(id);
    setMobile(false);
  }
  const group = (ids) =>
    modules
      .filter((m) => ids.includes(m[0]))
      .map(([id, label, icon]) => {
        const Icon = I[icon] || I.Sprout;
        return (
          <button
            key={id}
            className={`studio-nav-link ${page === id ? "is-active" : ""}`}
            title={label}
            aria-current={page === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <span className="canopy-nav-icon">
              <Icon size={19} aria-hidden="true" />
            </span>
            <span>{label}</span>
            {id === "tasks" && pending > 0 && <b>{pending}</b>}
            {page === id && <i />}
          </button>
        );
      });
  return (
    <div
      className={`studio-shell cinematic-shell ${workspace ? "commercial-shell" : ""} ${slim ? "sidebar-slim" : ""} studio-page-${page}`}
    >
      <a
        className="workspace-skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        İçeriğe geç
      </a>
      {mobile && (
        <button
          className="studio-mobile-scrim"
          aria-label="Menüyü kapat"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-sidebar"
        className={`studio-sidebar ${mobile ? "is-open" : ""}`}
      >
        <div className="studio-brand-row">
          <button
            className="studio-brand"
            onClick={() => navigate("overview")}
            aria-label="Agromax ana ekran"
          >
            <img src="/brand/agromax-logo-light-v1.svg" alt="" width="161" height="38" />
          </button>
          <button
            className="studio-sidebar-collapse"
            onClick={() => setSlim(!slim)}
            aria-label={slim ? "Menüyü genişlet" : "Menüyü daralt"}
          >
            {slim ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            className="studio-mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Menüyü kapat"
          >
            <X size={20} />
          </button>
        </div>
        <div className="canopy-mobile-workspace">{organizationControl}</div>
        <nav aria-label="Ana gezinme">
          {group(["overview"])}
          {navigationGroups.map((section, index) => {
            const Icon = sectionIcons[index];
            return <details className="platform-nav-group" key={section.id} open={section.pages.includes(page) || undefined}>
            <summary aria-label={section.label} title={section.label}><Icon size={18} aria-hidden="true" /><span>{section.label}</span><ChevronRight size={13} /></summary>
            {group(section.pages)}
          </details>;
          })}
        </nav>
        <button
          className={`studio-filiz ${page === "assistant" ? "is-active" : ""}`}
          aria-label="Filiz"
          onClick={() => navigate("assistant")}
          title="Filiz kayıt rehberi"
        >
          <span>
            <Sprout size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>Filiz</strong>
            <small>Kayıtlarından birlikte ilerleyelim</small>
          </div>
          <ArrowUpRight size={17} />
        </button>
        <div className="cinematic-sidebar-story">
          <p>Tarımsal<br />Zekâ Platformu</p>
          <small>Gözlemle · Anla · Simüle Et<br />Karar Ver · Uygula · Doğrula</small>
        </div>
        <div className="studio-sidebar-footer">
          <div className="studio-workspace">
            <span>{user.name.charAt(0).toLocaleUpperCase("tr-TR")}</span>
            <div>
              <strong>{workspace?.name || "Benim işletmem"}</strong>
              <small>{roles[workspace?.role] || "Kişisel çalışma alanı"}</small>
            </div>
          </div>
          {workspace && (
            <button
              className={`studio-nav-link ${page === "settings" ? "is-active" : ""}`}
              onClick={() => navigate("settings")}
              title="Hesap ve işletme"
            >
              <Settings2 size={20} />
              <span>Hesap ve işletme</span>
            </button>
          )}
          <button
            className={`studio-nav-link ${page === "integrations" ? "is-active" : ""}`}
            onClick={() => navigate("integrations")}
            title="Veri bağlantıları"
          >
            <Cable size={20} />
            <span>Veri bağlantıları</span>
          </button>
          <div className="studio-user">
            <span className="studio-user-avatar">
              {user.name.charAt(0).toLocaleUpperCase("tr-TR")}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>Çalışma alanım</small>
            </div>
            <button aria-label="Çıkış yap" title="Çıkış yap" onClick={onLogout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="studio-main">
        <header className="studio-topbar">
          <div className="studio-breadcrumb">
            <button
              className="studio-mobile-toggle"
              ref={menuButton}
              aria-label="Menüyü aç"
              aria-expanded={mobile}
              aria-controls="workspace-sidebar"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="canopy-topbar-label">Çalışma alanı</span>
            <ChevronRight size={13} />
            <strong>{active[1]}</strong>
          </div>
          <div className="studio-topbar-actions">
            {organizationControl}
            <button
              className="studio-global-search"
              aria-label="Hızlı erişim"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Parsel, analiz, rapor ara…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="studio-today">
              {new Date().toLocaleDateString("tr-TR", {
                timeZone: "Europe/Istanbul",
                day: "numeric",
                month: "long",
              })}
            </span>
            <button
              className="studio-calendar-button"
              aria-label={`Bildirimler${notifications ? `: ${notifications.filter((n) => !n.readAt).length} okunmamış` : ""}`}
              title="Bildirimleri aç"
              onClick={() => navigate("notifications")}
            >
              <Bell size={19} />
              {notifications?.some((n) => !n.readAt) && <i />}
            </button>
            <button
              className="studio-top-avatar"
              aria-label={
                workspace ? "Profil ayarlarını aç" : "Genel bakışı aç"
              }
              onClick={() => navigate(workspace ? "settings" : "overview")}
            >
              {user.name.charAt(0).toLocaleUpperCase("tr-TR")}
            </button>
          </div>
        </header>
        <main className="studio-content" id="main-content" tabIndex={-1} ref={content}>
          {children}
          <footer className="studio-page-footer">
            <span>
              Toprağı anla. <strong>Geleceği yetiştir.</strong>
            </span>
            <small>agromax · Çalışma alanınız</small>
          </footer>
        </main>
      </div>
      <nav className="canopy-mobile-dock" aria-label="Hızlı gezinme">
        {[
          ["overview", "Ana ekran"],
          ["fields", "Parseller"],
          ["tasks", "Görevler"],
          ["assistant", "Filiz"],
        ].map(([id, label]) => {
          const entry = modules.find(([key]) => key === id);
          const Icon = I[entry[2]] || I.Sprout;
          return (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      {search && (
        <QuickSearch
          commercial={!!workspace}
          fields={fields}
          onNavigate={navigate}
          onField={onField}
          onClose={() => setSearch(false)}
        />
      )}
    </div>
  );
}

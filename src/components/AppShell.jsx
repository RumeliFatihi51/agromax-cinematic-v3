import { useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  CalendarDays,
  ChevronRight,
  LogOut,
  Cable,
  ArrowUpRight,
  X,
  Menu,
  Bell,
} from "lucide-react";
import { modules } from "../features/modules";
import { I } from "./icons";
import QuickSearch from "./QuickSearch";
import Brand, { FilizAvatar } from "./Brand";
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
    sidebar = useRef(null);
  const active = modules.find((m) => m[0] === page) || modules[0],
    pending = tasks.filter((t) => !t.done).length;
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
            title={slim ? label : undefined}
            aria-current={page === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
            {id === "tasks" && pending > 0 && <b>{pending}</b>}
            {page === id && <i />}
          </button>
        );
      });
  return (
    <div
      className={`studio-shell ${slim ? "sidebar-slim" : ""} studio-page-${page}`}
    >
      <a className="workspace-skip-link" href="#main-content">
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
            <Brand light size={36} />
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
        <div className="studio-workspace">
          <span>{user.name.charAt(0).toLocaleUpperCase("tr-TR")}</span>
          <div>
            <strong>Benim işletmem</strong>
            <small>Kişisel çalışma alanı</small>
          </div>
        </div>
        <nav aria-label="Ana gezinme">
          <span className="studio-nav-heading">ÇALIŞMA ALANI</span>
          {group(["overview", "fields", "satellite", "history", "weather"])}
          <span className="studio-nav-heading">PLANLA & YÖNET</span>
          {group([
            "tasks",
            "irrigation",
            "nutrition",
            "protection",
            "finance",
            "reports",
            "notifications",
          ])}
        </nav>
        <button
          className={`studio-filiz ${page === "assistant" ? "is-active" : ""}`}
          onClick={() => navigate("assistant")}
          title="Filiz kayıt rehberi"
        >
          <span>
            <FilizAvatar size={37} />
          </span>
          <div>
            <strong>Filiz</strong>
            <small>Toprağının yanındaki rehber</small>
          </div>
          <ArrowUpRight size={17} />
        </button>
        <div className="studio-sidebar-footer">
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
            <span>İşletmem</span>
            <ChevronRight size={13} />
            <strong>{active[1]}</strong>
          </div>
          <div className="studio-topbar-actions">
            <button
              className="studio-global-search"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Hızlı erişim</span>
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
              aria-label={`Görevler: ${pending} bekleyen görev`}
              title="Görevlerimi aç"
              onClick={() => navigate("tasks")}
            >
              <CalendarDays size={20} />
              {pending > 0 && <i />}
            </button>
            <button
              className="studio-calendar-button"
              aria-label={`Bildirimler${notifications ? `: ${notifications.filter((n) => !n.readAt).length} okunmamış` : ""}`}
              title="Bildirimleri aç"
              onClick={() => navigate("notifications")}
            >
              <Bell size={19} />
              {notifications?.some((n) => !n.readAt) && <i />}
            </button>
            <span className="studio-top-avatar">
              {user.name.charAt(0).toLocaleUpperCase("tr-TR")}
            </span>
          </div>
        </header>
        <main className="studio-content" id="main-content" tabIndex={-1}>
          {children}
          <footer className="studio-page-footer">
            <span>
              Toprağı anla. <strong>Geleceği yetiştir.</strong>
            </span>
            <small>agromax · Çalışma alanınız</small>
          </footer>
        </main>
      </div>
      {search && (
        <QuickSearch
          fields={fields}
          onNavigate={navigate}
          onField={onField}
          onClose={() => setSearch(false)}
        />
      )}
    </div>
  );
}

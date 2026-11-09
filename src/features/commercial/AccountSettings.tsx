import { useEffect, useState, type FormEvent } from "react";
import SceneSurface from "../cinema/SceneSurface";
import {
  CheckCircle2,
  Globe,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  LoaderCircle,
  Mail,
} from "lucide-react";
import { api } from "../../api";
import { choose, type Locale } from "./i18n";
import type { Bootstrap, Workspace } from "./types";
import "./commercial.css";
import TeamSettings from "./TeamSettings";
interface Session {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string | null;
  expiresAt: string;
}
export default function AccountSettings({
  bootstrap,
  workspace,
  onChanged,
  onLogout,
}: {
  bootstrap: Bootstrap;
  workspace: Workspace;
  onChanged: () => Promise<void>;
  onLogout: () => void;
}) {
  const locale: Locale = bootstrap.preferences?.locale || "tr",
    t = (tr: string, en: string) => choose(locale, tr, en);
  const [tab, setTab] = useState("profile"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [sessions, setSessions] = useState<Session[] | null>(null),
    [billing, setBilling] = useState<{
      subscription: { state: string } | null;
      reason: string;
    } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setMessage("");
    const path =
      tab === "sessions"
        ? "v1/account/sessions"
        : tab === "billing" && workspace.role === "owner"
          ? "v1/billing"
          : null;
    if (path)
      api(path, undefined, "GET", { signal: controller.signal })
        .then((r) => {
          if (!controller.signal.aborted) {
            if (tab === "sessions") setSessions(r.sessions);
            else setBilling(r);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => controller.abort();
  }, [tab, workspace.id, workspace.role]);
  async function submit(event: FormEvent<HTMLFormElement>, operation: string) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      if (operation === "profile")
        await api("auth/update-user", { name: values.name });
      else if (operation === "password") {
        await api("auth/change-password", {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
          revokeOtherSessions: true,
        });
        form.reset();
      } else if (operation === "email")
        await api("auth/change-email", {
          newEmail: values.email,
          callbackURL: window.location.origin,
        });
      else
        await api(
          "v1/preferences",
          {
            locale: values.locale,
            timezone: values.timezone,
            areaUnit: values.areaUnit,
            emailNotifications: values.emailNotifications === "on",
          },
          "PATCH",
        );
      await onChanged();
      setMessage(t("İşlem kaydedildi.", "Changes saved."));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("İşlem tamamlanamadı.", "Unable to complete the request."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function verifyEmail() {
    setBusy(true);
    setError("");
    try {
      await api("auth/send-verification-email", {
        email: bootstrap.user.email,
        callbackURL: window.location.origin,
      });
      setMessage(
        t("Doğrulama e-postası gönderildi.", "Verification email sent."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(item: Session) {
    setBusy(true);
    setError("");
    try {
      await api(`v1/account/sessions/${item.id}/revoke`, {});
      if (item.current) onLogout();
      else setSessions((rows) => rows?.filter((s) => s.id !== item.id) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const localTime = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale === "tr" ? "tr-TR" : "en-GB", {
          timeZone: bootstrap.preferences?.timezone || workspace.timezone,
        })
      : t("Kayıtlı değil", "Not recorded");
  return (
    <SceneSurface id={tab === "profile" ? "settings" : `settings-${tab}`} className="business-settings" localTransition>
      <div className="studio-page-title">
        <div>
          <span className="studio-kicker">
            {t("HESABININ KONTROLÜ SENDE", "YOUR ACCOUNT, YOUR CONTROL")}
          </span>
          <h1>{t("Hesap ve işletme", "Account and workspace")}</h1>
          <p>
            {t(
              "Profilini, tercihlerini ve oturumlarını yönet.",
              "Manage your profile, preferences and sessions.",
            )}
          </p>
        </div>
        <ShieldCheck size={30} />
      </div>
      <div className="weather-period-tabs">
        {[
          ["profile", "Profil", "Profile"],
          ["preferences", "Tercihler", "Preferences"],
          ["security", "Güvenlik", "Security"],
          ["sessions", "Oturumlar", "Sessions"],
          ["team", "İşletme", "Workspace"],
          ...(workspace.role === "owner"
            ? [["billing", "Abonelik", "Subscription"]]
            : []),
        ].map(([key, tr, en]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key!)}
          >
            {t(tr!, en!)}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="business-action-status" role="status">
          {message}
        </p>
      )}
      {tab === "profile" && (
        <div className="account-profile-layout">
        <aside className="account-identity business-settings-section">
          <div className="account-cover" aria-hidden="true" />
          <span className="account-initial" aria-hidden="true">{bootstrap.user.name.trim().slice(0, 1).toLocaleUpperCase(locale)}</span>
          <strong>{bootstrap.user.name}</strong>
          <p>{bootstrap.user.email}</p>
          <dl>
            <div><dt>{t("İşletme", "Workspace")}</dt><dd>{workspace.name}</dd></div>
            <div><dt>{t("Saat dilimi", "Time zone")}</dt><dd>{workspace.timezone}</dd></div>
          </dl>
        </aside>
        <section className="business-settings-section">
          <h2>{t("Profil bilgilerin", "Your profile")}</h2>
          <form onSubmit={(e) => submit(e, "profile")}>
            <label>
              {t("Ad ve soyad", "Full name")}
              <input
                name="name"
                defaultValue={bootstrap.user.name}
                required
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <label>
              {t("E-posta adresi", "Email address")}
              <input
                value={bootstrap.user.email}
                readOnly
                autoComplete="email"
              />
            </label>
            <p className="business-muted">
              {bootstrap.user.emailVerified
                ? t("E-posta adresi doğrulandı.", "Email verified.")
                : t(
                    "E-posta adresi henüz doğrulanmadı.",
                    "Email not verified yet.",
                  )}
            </p>
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {t("Profili kaydet", "Save profile")}
            </button>
          </form>
          {!bootstrap.user.emailVerified && (
            <button
              className="business-link-button"
              disabled={busy || !bootstrap.emailConfigured}
              onClick={verifyEmail}
            >
              <Mail size={15} />
              {t("Doğrulama e-postası gönder", "Send verification email")}
            </button>
          )}
          {!bootstrap.emailConfigured && (
            <p className="business-muted">
              {t(
                "E-posta hizmeti henüz etkinleştirilmedi.",
                "Email delivery has not been enabled yet.",
              )}
            </p>
          )}
        </section>
        </div>
      )}
      {tab === "preferences" && (
        <section className="business-settings-section">
          <h2>
            {t(
              "Görünüm ve bildirim tercihleri",
              "Display and notification preferences",
            )}
          </h2>
          <form onSubmit={(e) => submit(e, "preferences")}>
            <div className="business-form-grid">
              <label>
                {t("Dil", "Language")}
                <select name="locale" defaultValue={locale}>
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                {t("Alan birimi", "Area unit")}
                <select
                  name="areaUnit"
                  defaultValue={bootstrap.preferences?.areaUnit || "decare"}
                >
                  <option value="decare">{t("Dekar", "Decare")}</option>
                  <option value="hectare">{t("Hektar", "Hectare")}</option>
                  <option value="sqm">m²</option>
                </select>
              </label>
            </div>
            <label>
              {t("Saat dilimi (IANA)", "Time zone (IANA)")}
              <input
                name="timezone"
                defaultValue={
                  bootstrap.preferences?.timezone || workspace.timezone
                }
                required
              />
            </label>
            <label>
              <span>
                <input
                  type="checkbox"
                  name="emailNotifications"
                  defaultChecked={bootstrap.preferences?.emailNotifications}
                  style={{ width: "auto", marginRight: 8 }}
                />
                {t(
                  "E-posta bildirimlerini istiyorum",
                  "Enable email notifications",
                )}
              </span>
            </label>
            <button className="primary" disabled={busy}>
              <Globe size={16} />
              {t("Tercihleri kaydet", "Save preferences")}
            </button>
          </form>
        </section>
      )}
      {tab === "security" && (
        <>
          <section className="business-settings-section">
            <h2>{t("Şifreni değiştir", "Change password")}</h2>
            <form onSubmit={(e) => submit(e, "password")}>
              <label>
                {t("Mevcut şifre", "Current password")}
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <label>
                {t(
                  "Yeni şifre (en az 12 karakter)",
                  "New password (at least 12 characters)",
                )}
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={12}
                  maxLength={256}
                  autoComplete="new-password"
                />
              </label>
              <p className="business-muted">
                {t(
                  "Diğer oturumlar kapatılır.",
                  "Other sessions will be revoked.",
                )}
              </p>
              <button className="primary" disabled={busy}>
                <LockKeyhole size={16} />
                {t("Şifreyi değiştir", "Change password")}
              </button>
            </form>
          </section>
          <section className="business-settings-section">
            <h2>{t("E-posta adresini değiştir", "Change email address")}</h2>
            <form onSubmit={(e) => submit(e, "email")}>
              <label>
                {t("Yeni e-posta", "New email")}
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <button
                className="secondary"
                disabled={busy || !bootstrap.emailConfigured}
              >
                {t("Doğrulama sürecini başlat", "Start verification")}
              </button>
            </form>
          </section>
        </>
      )}
      {tab === "sessions" && (
        <section className="business-settings-section">
          <h2>{t("Açık oturumlar", "Active sessions")}</h2>
          {sessions === null ? (
            <LoaderCircle className="spin" size={20} />
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="business-session">
                <dl>
                  <div>
                    <dt>
                      {s.current
                        ? t("Bu oturum", "Current session")
                        : t("Diğer oturum", "Other session")}
                    </dt>
                    <dd>{localTime(s.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>{t("IP adresi", "IP address")}</dt>
                    <dd>{s.ipAddress || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("Tarayıcı / istemci", "Browser / client")}</dt>
                    <dd>{s.userAgent || "—"}</dd>
                  </div>
                </dl>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => revoke(s)}
                >
                  <LogOut size={15} />
                  {t("Oturumu kapat", "Revoke session")}
                </button>
              </div>
            ))
          )}
        </section>
      )}
      {tab === "team" && (
        <TeamSettings
          workspace={workspace}
          locale={locale}
          userId={bootstrap.user.id}
          verified={bootstrap.user.emailVerified}
          onChanged={onChanged}
        />
      )}
      {tab === "billing" && workspace.role === "owner" && (
        <section className="business-settings-section">
          <h2>{t("Abonelik durumu", "Subscription status")}</h2>
          {billing ? (
            <>
              <p>
                {billing.subscription
                  ? billing.subscription.state
                  : t(
                      "Ücretli aboneliğin bulunmuyor.",
                      "You have no paid subscription.",
                    )}
              </p>
              <p>{billing.reason}</p>
            </>
          ) : (
            <LoaderCircle className="spin" size={20} />
          )}
        </section>
      )}
    </SceneSurface>
  );
}

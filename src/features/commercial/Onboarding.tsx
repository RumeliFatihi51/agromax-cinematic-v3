import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Building2,
  LoaderCircle,
  LogOut,
  Globe,
} from "lucide-react";
import { api } from "../../api";
import { choose, type Locale } from "./i18n";
import "./commercial.css";
export default function Onboarding({
  onSaved,
  onLogout,
}: {
  onSaved: () => Promise<void>;
  onLogout: () => void;
}) {
  const [locale, setLocale] = useState<Locale>("tr"),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const t = (tr: string, en: string) => choose(locale, tr, en);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      await api("v1/organizations", {
        name: form.get("name"),
        countryCode: form.get("countryCode"),
        timezone: form.get("timezone"),
        locale,
      });
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("İşlem tamamlanamadı.", "Unable to save."),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="commercial-onboarding">
      <section>
        <span className="business-brand">agromax.</span>
        <span className="business-kicker">
          {t("SANA AİT BİR ÇALIŞMA ALANI", "YOUR OWN WORKSPACE")}
        </span>
        <h1>{t("İşletmeni tanıyalım.", "Let's set up your farm.")}</h1>
        <p>
          {t(
            "Tarlaların, sezonların ve ekibin aynı yerde. Gerçek kayıtlarınla başla.",
            "Keep your parcels, seasons and team together. Start with your own records.",
          )}
        </p>
        <form onSubmit={submit}>
          <label>
            {t("İşletme / çalışma alanı adı", "Farm / workspace name")}
            <input
              name="name"
              required
              maxLength={100}
              autoComplete="organization"
            />
          </label>
          <div className="business-form-grid">
            <label>
              {t("İşletme ülkesi", "Business country")}
              <input
                name="countryCode"
                defaultValue="TR"
                pattern="[A-Z]{2}"
                maxLength={2}
                required
                aria-describedby="country-help"
              />
              <small id="country-help">
                {t(
                  "İki harfli ülke kodu; örneğin TR.",
                  "Two-letter country code, such as TR.",
                )}
              </small>
            </label>
            <label>
              {t("Saat dilimi", "Time zone")}
              <input
                name="timezone"
                defaultValue={
                  Intl.DateTimeFormat().resolvedOptions().timeZone ||
                  "Europe/Istanbul"
                }
                required
              />
            </label>
          </div>
          <label>
            <Globe size={16} />
            {t("Dil", "Language")}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Building2 size={18} />
            )}
            {t("Çalışma alanımı oluştur", "Create workspace")}
            <ArrowRight size={17} />
          </button>
        </form>
        <button className="business-link-button" onClick={onLogout}>
          <LogOut size={15} />
          {t("Çıkış yap", "Sign out")}
        </button>
      </section>
    </main>
  );
}

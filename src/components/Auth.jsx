import HologramTerrain from "./HologramTerrain";
import Brand from "./Brand";
import { useEffect, useState } from "react";
import AccountRecovery from "./AccountRecovery";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  Satellite,
  LandPlot,
  CalendarDays,
} from "lucide-react";
import { api } from "../api";
export default function Auth({ onLogin }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [runtime, setRuntime] = useState(null),
    [recovery, setRecovery] = useState(() =>
      new URLSearchParams(window.location.search).get("flow") === "reset"
        ? "reset"
        : "",
    );
  useEffect(() => {
    const controller = new AbortController();
    api("runtime", undefined, "GET", { signal: controller.signal })
      .then(setRuntime)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api(
          register ? "register" : "login",
          Object.fromEntries(new FormData(e.target)),
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <section className="auth-story">
        <HologramTerrain />
        <figure className="auth-brand-art">
          <picture>
            <source
              srcSet="/brand/agromax-landscape-v1-768.webp 768w, /brand/agromax-landscape-v1.webp 1024w"
              sizes="(max-width:640px) 100vw, 50vw"
              type="image/webp"
            />
            <img
              src="/brand/agromax-landscape-v1.png"
              width="1024"
              height="1536"
              alt=""
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <figcaption>
            Marka illüstrasyonu · Gerçek arazi veya uydu görüntüsü değildir.
          </figcaption>
        </figure>
        <a className="brand" aria-label="Agromax">
          <Brand light size={42} />
        </a>
        <div className="auth-copy">
          <span className="eyebrow">TOPRAĞI ANLA. GELECEĞİ YETİŞTİR.</span>
          <h1>
            Tarımın geleceği,
            <br />
            <em>senin kontrolünde.</em>
          </h1>
          <p>
            Tarlalarını tanı. Her adımını planla.
            <br />
            Toprağınla kurduğun bağ, hep elinin altında.
          </p>
          <div className="auth-capabilities">
            <span>
              <LandPlot size={16} />
              Parsel yönetimi
            </span>
            <span>
              <Satellite size={16} />
              Uydu analizleri
            </span>
            <span>
              <CalendarDays size={16} />
              Sezon planı
            </span>
          </div>
        </div>
        <footer>
          Teknoloji topraktan ilham alsın. <ArrowUpRight size={17} />
        </footer>
      </section>
      <section className="auth-form">
        <div className="form-wrap">
          <span className="pill">
            <span className="canopy-status-dot" /> TARLANA AÇILAN PENCERE
          </span>
          <h2>
            {recovery
              ? "Hesabına geri dön."
              : register
                ? "Birlikte büyüyelim."
                : "Kaldığımız yerden."}
          </h2>
          <p>
            {register
              ? "İşletmenizin dijital yolculuğunu başlatın."
              : "İşletmene giriş yap. Sezonun tamamını bir arada gör."}
          </p>
          <div className="auth-tabs">
            <button
              className={!register ? "selected" : ""}
              aria-pressed={!register}
              disabled={busy}
              onClick={() => {
                setRegister(false);
                setRecovery("");
                setError("");
              }}
            >
              Giriş yap
            </button>
            <button
              className={register ? "selected" : ""}
              aria-pressed={register}
              disabled={busy}
              onClick={() => {
                setRegister(true);
                setRecovery("");
                setError("");
              }}
            >
              Hesap oluştur
            </button>
          </div>
          {recovery ? (
            <AccountRecovery
              mode={recovery}
              available={!!runtime?.emailConfigured}
              onBack={() => {
                setRecovery("");
                setRegister(false);
                window.history.replaceState({}, "", window.location.pathname);
              }}
            />
          ) : (
            <form onSubmit={submit}>
              {register && (
                <label>
                  Adınız soyadınız
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    placeholder="Adınız ve soyadınız"
                  />
                </label>
              )}
              <label>
                E-posta adresiniz
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="E-posta adresinizi girin"
                />
              </label>
              <label>
                Şifreniz
                <span className="auth-password-field">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    minLength={12}
                    maxLength={256}
                    required
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    placeholder="En az 12 karakter"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={
                      showPassword ? "Şifreyi gizle" : "Şifreyi göster"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {register &&
                runtime?.runtime === "commercial" &&
                !runtime.emailConfigured && (
                  <p role="status">
                    Yeni hesap kaydı için e-posta hizmetinin etkinleştirilmesi
                    gerekiyor.
                  </p>
                )}
              <button
                className="primary full"
                disabled={
                  busy ||
                  (register &&
                    runtime?.runtime === "commercial" &&
                    !runtime.emailConfigured)
                }
              >
                {busy
                  ? "İşlem yapılıyor…"
                  : register
                    ? "Hesabımı oluştur"
                    : "Platforma giriş yap"}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {!register && !recovery && runtime?.runtime === "commercial" && (
            <button
              className="text-button"
              onClick={() => setRecovery("forgot")}
            >
              Şifremi unuttum
            </button>
          )}
          <div className="auth-trust">
            <ShieldCheck size={20} />
            <span>
              Verileriniz size ait.
              <br />
              <small>
                Yalnızca kendi işletmenizin kayıtlarına erişirsiniz.
              </small>
            </span>
          </div>
        </div>
        <small className="local-note">
          {runtime?.runtime === "commercial"
            ? "Hesap ve işletme çalışma alanı"
            : "Agromax · Parsel ve tarımsal veri çalışma alanı"}
        </small>
      </section>
    </main>
  );
}

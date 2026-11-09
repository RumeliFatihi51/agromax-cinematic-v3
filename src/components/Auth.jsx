import { useEffect, useState } from "react";
import AccountRecovery from "./AccountRecovery";
import { ArrowUpRight, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { api } from "../api";
import SceneFilm from "../features/cinema/SceneFilm";
import { filmForScene } from "../features/cinema/sceneFilms";
import RouteCurtain from "../features/cinema/RouteCurtain";
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
    <main className="observation-auth">
      <RouteCurtain id={recovery || (register ? "register" : "login")} />
      <header className="observation-auth-bar">
        <img src="/brand/agromax-logo-light-v1.svg" width="151" height="36" alt="AgroMax" />
        <span>Hesap alanı</span>
      </header>
      <section className="observation-auth-scene">
        <SceneFilm film={filmForScene("portal")} priority loop />
        <div className="observation-auth-inscription">
          <span>AGROMAX / OBSERVATION PORTAL</span>
          <h1>Gözlem.<br />Bağlam.<br />Yeni bir başlangıç.</h1>
          <p>Toprağa yakın, veriye bağlı bir bakış.</p>
        </div>
      </section>
      <section className="observation-auth-panel" aria-labelledby="observation-auth-title">
        <div className="observation-auth-form">
          <div className="observation-auth-tabs" role="group" aria-label="Hesap işlemi">
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
          <h2 id="observation-auth-title">
            {recovery ? "Erişimini yenile." : register ? "Yeni bir bakış aç." : "Yeniden hoş geldin."}
          </h2>
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
                    minLength={register ? 12 : undefined}
                    maxLength={256}
                    required
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    placeholder={register ? "En az 12 karakter" : "Şifrenizi girin"}
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
                <ArrowUpRight size={18} />
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
        <small className="observation-auth-footer">
          {runtime?.runtime === "commercial"
            ? "Hesap ve işletme çalışma alanı"
            : "Agromax · Parsel ve tarımsal veri çalışma alanı"}
        </small>
      </section>
    </main>
  );
}

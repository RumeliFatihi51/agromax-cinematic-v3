import Brand from "./Brand";
import { useState } from "react";
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
            İyi bir sezon,
            <br />
            <em>birlikte büyür.</em>
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
          <span className="pill">BİRLİKTE DAHA VERİMLİ</span>
          <h2>{register ? "Yeni bir başlangıç." : "Yeniden merhaba."}</h2>
          <p>
            {register
              ? "İşletmenizin dijital yolculuğunu başlatın."
              : "Tarlanızın yeni gününe birlikte bakalım."}
          </p>
          <div className="auth-tabs">
            <button
              className={!register ? "selected" : ""}
              aria-pressed={!register}
              disabled={busy}
              onClick={() => {
                setRegister(false);
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
                setError("");
              }}
            >
              Hesap oluştur
            </button>
          </div>
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
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder="En az 12 karakter"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
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
            <button className="primary full" disabled={busy}>
              {busy
                ? "İşlem yapılıyor…"
                : register
                  ? "Hesabımı oluştur"
                  : "Platforma giriş yap"}
              <ArrowRight size={18} />
            </button>
          </form>
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
          Yerel geliştirme sürümü · E-posta doğrulaması henüz etkin değil.
        </small>
      </section>
    </main>
  );
}

import { useState } from "react";
import { api } from "../api";
export default function AccountRecovery({ mode, onBack, available }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const reset = mode === "reset",
    token = new URLSearchParams(window.location.search).get("token");
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      if (reset) {
        if (!token) throw new Error("Şifre sıfırlama bağlantısı geçersiz.");
        await api("auth/reset-password", {
          token,
          newPassword: values.password,
        });
        form.reset();
        setMessage("Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.");
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        await api("auth/request-password-reset", {
          email: values.email,
          redirectTo: window.location.origin + "/?flow=reset",
        });
        setMessage(
          "Bu adresle bir hesap varsa sıfırlama bağlantısı gönderilecek. Gelen kutunu ve spam klasörünü kontrol et.",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>{reset ? "Yeni şifreni belirle" : "Şifreni sıfırla"}</h3>
      {message ? (
        <p role="status">{message}</p>
      ) : (
        <form onSubmit={submit}>
          {reset ? (
            <label>
              Yeni şifren
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
              />
            </label>
          ) : (
            <label>
              E-posta adresin
              <input name="email" type="email" required autoComplete="email" />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!reset && !available && (
            <p>
              E-posta hizmeti etkinleştirilmeden sıfırlama bağlantısı
              gönderilemiyor.
            </p>
          )}
          <button
            className="primary full"
            disabled={busy || (!reset && !available)}
          >
            {busy
              ? "İşleniyor…"
              : reset
                ? "Yeni şifreyi kaydet"
                : "Sıfırlama bağlantısı gönder"}
          </button>
        </form>
      )}
      <button className="text-button" disabled={busy} onClick={onBack}>
        Giriş ekranına dön
      </button>
    </section>
  );
}

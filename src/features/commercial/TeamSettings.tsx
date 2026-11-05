import { useEffect, useState, type FormEvent } from "react";
import { UserPlus, LoaderCircle, Copy, Check } from "lucide-react";
import { api } from "../../api";
import { choose, type Locale } from "./i18n";
import type { Workspace } from "./types";
export default function TeamSettings({
  workspace,
  locale,
  userId,
  verified,
  onChanged,
}: {
  workspace: Workspace;
  locale: Locale;
  userId: string;
  verified: boolean;
  onChanged: () => Promise<void>;
}) {
  const [members, setMembers] = useState<
      { id: string; name: string; role: string }[] | null
    >(null),
    [error, setError] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [copied, setCopied] = useState(false);
  const t = (a: string, b: string) => choose(locale, a, b),
    manage = ["owner", "manager"].includes(workspace.role) && verified;
  const roles = [
    ["owner", "Sahip", "Owner"],
    ["manager", "Yönetici", "Manager"],
    ["worker", "Çalışan", "Worker"],
    ["viewer", "Salt okunur", "Read only"],
  ];
  useEffect(() => {
    const controller = new AbortController();
    api("v1/organizations/members", undefined, "GET", {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setMembers(r.members);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [workspace.id, reload]);
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    setToken("");
    try {
      const r = await api("v1/organizations/invitations", data);
      setToken(r.token);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function accept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await api("v1/invitations/accept", data);
      await onChanged();
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function change(id: string, role: string | null) {
    if (
      role === null &&
      !window.confirm(
        t(
          "Üye işletmeden çıkarılsın mı?",
          "Remove this member from the workspace?",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`v1/organizations/members/${id}`, { role }, "PATCH");
      if (id === userId) await onChanged();
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="business-settings-section">
        <h2>{workspace.name}</h2>
        <p>
          {workspace.countryCode} · {workspace.timezone}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <h2>{t("Ekip üyeleri", "Team members")}</h2>
        {members === null ? (
          <LoaderCircle size={20} className="spin" />
        ) : (
          members.map((m) => (
            <div className="business-team-row" key={m.id}>
              <strong>
                {m.name}
                {m.id === userId ? ` (${t("sen", "you")})` : ""}
              </strong>
              {manage &&
              (workspace.role === "owner" ||
                !["owner", "manager"].includes(m.role)) ? (
                <>
                  <select
                    value={m.role}
                    disabled={busy}
                    aria-label={`${m.name}: ${t("rol", "role")}`}
                    onChange={(e) => change(m.id, e.target.value)}
                  >
                    {roles
                      .filter(
                        ([id]) =>
                          workspace.role === "owner" ||
                          ["worker", "viewer"].includes(id!),
                      )
                      .map(([id, tr, en]) => (
                        <option value={id} key={id}>
                          {t(tr!, en!)}
                        </option>
                      ))}
                  </select>
                  <button
                    className="business-link-button"
                    disabled={busy}
                    onClick={() => change(m.id, null)}
                  >
                    {t("Üyeyi çıkar", "Remove member")}
                  </button>
                </>
              ) : (
                <span>
                  {t(
                    roles.find(([id]) => id === m.role)?.[1] || m.role,
                    roles.find(([id]) => id === m.role)?.[2] || m.role,
                  )}
                </span>
              )}
            </div>
          ))
        )}
      </section>
      {manage && (
        <section className="business-settings-section">
          <h2>
            <UserPlus size={19} />{" "}
            {t("Ekip arkadaşı davet et", "Invite a team member")}
          </h2>
          <form onSubmit={invite}>
            <label>
              {t("E-posta", "Email")}
              <input name="email" type="email" required />
            </label>
            <label>
              {t("Yetki", "Role")}
              <select name="role" defaultValue="viewer">
                {roles
                  .filter(
                    ([id]) =>
                      workspace.role === "owner" ||
                      ["worker", "viewer"].includes(id!),
                  )
                  .map(([id, tr, en]) => (
                    <option value={id} key={id}>
                      {t(tr!, en!)}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              {t("Davet oluştur", "Create invitation")}
            </button>
          </form>
          {token && (
            <div className="business-team-secret">
              <p>
                {t(
                  "Bu kodu davet ettiğin kişiyle güvenli biçimde paylaş. Kod yalnızca bu ekranda gösterilir ve 7 gün geçerlidir. E-posta gönderilmedi.",
                  "Share this code securely with the invitee. It is shown only here and expires in 7 days. No email was sent.",
                )}
              </p>
              <code>{token}</code>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(token);
                    setCopied(true);
                  } catch {
                    setError(
                      t(
                        "Kopyalama izni verilmedi; kodu elle seçebilirsin.",
                        "Clipboard permission denied; select the code manually.",
                      ),
                    );
                  }
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                {t("Kopyala", "Copy")}
              </button>
            </div>
          )}
        </section>
      )}
      <section className="business-settings-section">
        <h2>{t("Bir işletmeye katıl", "Join a workspace")}</h2>
        {!verified && (
          <p>
            {t(
              "Ekip işlemleri için önce e-posta doğrulaması gerekiyor.",
              "Verify your email before using team invitations.",
            )}
          </p>
        )}
        <form onSubmit={accept}>
          <label>
            {t("Davet kodu", "Invitation code")}
            <input
              name="token"
              required
              minLength={43}
              maxLength={43}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button className="primary" disabled={busy || !verified}>
            {t("Daveti kabul et", "Accept invitation")}
          </button>
        </form>
      </section>
    </>
  );
}

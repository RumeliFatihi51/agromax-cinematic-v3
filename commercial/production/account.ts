import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import type { Store } from "../db/store";
import type { Actor } from "../organizations/service";
import { DomainError } from "../core/errors";
const derive = promisify(scrypt);
const profile = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const password = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(256),
    revokeOtherSessions: z.boolean().default(true),
  })
  .strict();

export async function accountRequest(
  store: Store,
  actor: Actor,
  secret: string,
  request: Request,
  body: Record<string, unknown>,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname,
    method = request.method;
  const token =
    (request.headers.get("cookie") || "")
      .split(/;\s*/)
      .find((p) => p.startsWith("session="))
      ?.slice(8) || "";
  const publicId = (value: string) =>
    createHmac("sha256", secret)
      .update(`session:${actor.id}:${value}`)
      .digest("hex")
      .slice(0, 32);
  if (path === "/api/auth/update-user" && method === "POST") {
    const data = profile.parse(body);
    await store.transaction(async (tx) => {
      await tx.query("update users set name=$1 where id=$2", [
        data.name,
        actor.id,
      ]);
      await tx.query(
        "update auth_users set name=$1,updated_at=now() where id=$2",
        [data.name, actor.id],
      );
    });
    return Response.json({ user: { ...actor, name: data.name } });
  }
  if (path === "/api/auth/change-password" && method === "POST") {
    const data = password.parse(body);
    await store.transaction(async (tx) => {
      const row = (
        await tx.query("select password from users where id=$1 for update", [
          actor.id,
        ])
      ).rows[0];
      const match = String(row?.password || "").match(
        /^([a-f0-9]{32}):([a-f0-9]{128})$/,
      );
      if (!match)
        throw new DomainError(
          "INVALID_CREDENTIALS",
          "Mevcut şifren doğrulanamadı.",
          403,
        );
      const supplied = (await derive(
        data.currentPassword,
        match[1]!,
        64,
      )) as Buffer;
      if (!timingSafeEqual(supplied, Buffer.from(match[2]!, "hex")))
        throw new DomainError(
          "INVALID_CREDENTIALS",
          "Mevcut şifren hatalı.",
          403,
        );
      const salt = randomBytes(16).toString("hex"),
        hash = (await derive(data.newPassword, salt, 64)) as Buffer,
        next = `${salt}:${hash.toString("hex")}`;
      await tx.query("update users set password=$1 where id=$2", [
        next,
        actor.id,
      ]);
      await tx.query(
        "update auth_accounts set password=$1,updated_at=now() where user_id=$2 and provider_id='credential'",
        [`legacy-scrypt:${next}`, actor.id],
      );
      if (data.revokeOtherSessions) {
        await tx.query("delete from sessions where user_id=$1 and token<>$2", [
          actor.id,
          token,
        ]);
        await tx.query("delete from auth_sessions where user_id=$1", [
          actor.id,
        ]);
      }
    });
    return Response.json({ ok: true });
  }
  if (path === "/api/v1/account/sessions" && method === "GET") {
    const rows = (
      await store.raw.query(
        "select token,expires from sessions where user_id=$1 and expires>$2 order by expires desc",
        [actor.id, Date.now()],
      )
    ).rows;
    return Response.json({
      sessions: rows.map((r) => ({
        id: publicId(String(r.token)),
        current: String(r.token) === token,
        createdAt: null,
        expiresAt: new Date(Number(r.expires)).toISOString(),
        ipAddress: null,
        userAgent: null,
      })),
    });
  }
  const revoke = path.match(
    /^\/api\/v1\/account\/sessions\/([a-f0-9]{32})\/revoke$/,
  );
  if (revoke && method === "POST") {
    const rows = (
      await store.raw.query(
        "select token from sessions where user_id=$1 and expires>$2",
        [actor.id, Date.now()],
      )
    ).rows;
    const row = rows.find((r) => publicId(String(r.token)) === revoke[1]);
    if (!row) throw new DomainError("NOT_FOUND", "Oturum bulunamadı.", 404);
    await store.raw.query(
      "delete from sessions where user_id=$1 and token=$2",
      [actor.id, row.token],
    );
    return Response.json({ ok: true });
  }
  if (path.startsWith("/api/auth/"))
    throw new DomainError(
      "EMAIL_NOT_CONFIGURED",
      "E-posta servisi henüz etkin değil. Bu işlem şu anda kullanılamıyor.",
      503,
    );
  return undefined;
}

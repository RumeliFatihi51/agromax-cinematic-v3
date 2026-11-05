import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { CommercialDb } from "../db/store";
import {
  invitations,
  memberships,
  organizations,
  auditLog,
} from "../db/schema";
import { roleSchema } from "../../shared/contracts/commercial";
import { DomainError } from "../core/errors";
import { requirePermission, uid, type Actor, type Context } from "./service";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function verified(actor: Actor) {
  if (!actor.emailVerified)
    throw new DomainError(
      "EMAIL_VERIFICATION_REQUIRED",
      "Ekip işlemleri için e-posta adresinizi doğrulayın.",
      403,
    );
}
function mayAssign(ctx: Context, role: string) {
  requirePermission(ctx, "organization.manage");
  verified(ctx.actor);
  if (ctx.role !== "owner" && !["worker", "viewer"].includes(role))
    throw new DomainError(
      "FORBIDDEN",
      "Yönetici ve sahip yetkisini yalnızca işletme sahibi verebilir.",
      403,
    );
}
export async function inviteMember(
  db: CommercialDb,
  ctx: Context,
  input: unknown,
) {
  const data = z
    .object({
      email: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      role: roleSchema,
    })
    .strict()
    .parse(input);
  mayAssign(ctx, data.role);
  if (data.email === ctx.actor.email.toLowerCase())
    throw new DomainError(
      "ALREADY_MEMBER",
      "Zaten bu işletmenin üyesisiniz.",
      409,
    );
  const token = randomBytes(32).toString("base64url"),
    id = uid(),
    expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ctx.organization.id))
      .for("update");
    const existing = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, ctx.organization.id),
          eq(invitations.email, data.email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    for (const row of existing)
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(eq(invitations.id, row.id));
    await tx.insert(invitations).values({
      id,
      organizationId: ctx.organization.id,
      email: data.email,
      role: data.role,
      tokenHash: digest(token),
      createdBy: ctx.actor.id,
      expiresAt,
    });
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: ctx.organization.id,
      actorId: ctx.actor.id,
      action: "team.invited",
      resourceId: id,
      details: { role: data.role },
    });
  });
  // No email is claimed sent. This secret is shown only in the creation response.
  return {
    id,
    token,
    email: data.email,
    role: data.role,
    expiresAt,
    delivery: "manual",
  };
}
export async function acceptInvitation(
  db: CommercialDb,
  actor: Actor,
  input: unknown,
) {
  verified(actor);
  const { token } = z
    .object({ token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/) })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, digest(token)))
      .for("update");
    if (
      !invite ||
      invite.revokedAt ||
      invite.expiresAt <= new Date() ||
      invite.email !== actor.email.toLowerCase()
    )
      throw new DomainError("NOT_FOUND", "Geçerli davet bulunamadı.", 404);
    if (invite.acceptedAt)
      return { organizationId: invite.organizationId, alreadyAccepted: true };
    await tx
      .insert(memberships)
      .values({
        id: uid(),
        organizationId: invite.organizationId,
        userId: actor.id,
        role: invite.role,
      })
      .onConflictDoNothing();
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id));
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: invite.organizationId,
      actorId: actor.id,
      action: "team.accepted",
      resourceId: invite.id,
    });
    return { organizationId: invite.organizationId, alreadyAccepted: false };
  });
}
export async function changeMember(
  db: CommercialDb,
  ctx: Context,
  userId: string,
  input: unknown,
) {
  const { role } = z
    .object({ role: roleSchema.nullable() })
    .strict()
    .parse(input);
  mayAssign(ctx, role || "viewer");
  await db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ctx.organization.id))
      .for("update");
    const members = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.organizationId, ctx.organization.id));
    const target = members.find((m) => m.userId === userId);
    if (!target) throw new DomainError("NOT_FOUND", "Üye bulunamadı.", 404);
    if (ctx.role !== "owner" && ["owner", "manager"].includes(target.role))
      throw new DomainError(
        "FORBIDDEN",
        "Bu üyenin yetkisini değiştiremezsiniz.",
        403,
      );
    if (
      target.role === "owner" &&
      role !== "owner" &&
      members.filter((m) => m.role === "owner").length === 1
    )
      throw new DomainError(
        "LAST_OWNER",
        "İşletmenin son sahibi kaldırılamaz. Önce başka bir sahip atayın.",
        409,
      );
    if (role === null)
      await tx.delete(memberships).where(eq(memberships.id, target.id));
    else
      await tx
        .update(memberships)
        .set({ role })
        .where(eq(memberships.id, target.id));
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: ctx.organization.id,
      actorId: ctx.actor.id,
      action: role ? "team.role_changed" : "team.removed",
      resourceId: target.userId,
      details: { before: target.role, after: role },
    });
  });
  return { ok: true };
}

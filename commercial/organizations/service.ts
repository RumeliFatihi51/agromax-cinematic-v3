import { and, eq, asc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { CommercialDb } from "../db/store";
import {
  organizations,
  memberships,
  preferences,
  auditLog,
} from "../db/schema";
import {
  organizationInput,
  type Role,
} from "../../shared/contracts/commercial";
import { DomainError } from "../core/errors";
export const uid = () => randomBytes(16).toString("hex");
export interface Actor {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  guest?: boolean;
  authentication?: "legacy-session";
}
export interface Context {
  actor: Actor;
  organization: typeof organizations.$inferSelect;
  role: Role;
}
export type Permission =
  | "read"
  | "field.write"
  | "record.write"
  | "record.delete"
  | "report.create"
  | "calculate"
  | "organization.manage"
  | "billing.manage";
const rights: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set([
    "read",
    "field.write",
    "record.write",
    "record.delete",
    "report.create",
    "calculate",
    "organization.manage",
    "billing.manage",
  ]),
  manager: new Set([
    "read",
    "field.write",
    "record.write",
    "record.delete",
    "report.create",
    "calculate",
    "organization.manage",
  ]),
  worker: new Set(["read", "record.write", "report.create", "calculate"]),
  viewer: new Set(["read"]),
};
export function requirePermission(context: Context, permission: Permission) {
  if (!rights[context.role]?.has(permission))
    throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok.", 403);
  if (
    ["calculate", "report.create", "billing.manage"].includes(permission) &&
    !context.actor.emailVerified &&
    !(context.actor.guest && ["calculate", "report.create"].includes(permission)) &&
    !(
      permission === "report.create" &&
      context.actor.authentication === "legacy-session"
    )
  )
    throw new DomainError(
      "EMAIL_VERIFICATION_REQUIRED",
      "Bu işlem için e-posta adresinizi doğrulayın.",
      403,
    );
}
export async function listOrganizations(db: CommercialDb, userId: string) {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      countryCode: organizations.countryCode,
      locale: organizations.locale,
      timezone: organizations.timezone,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(organizations.createdAt), asc(organizations.id));
}
export async function createOrganization(
  db: CommercialDb,
  actor: Actor,
  input: unknown,
) {
  const data = organizationInput.parse(input),
    id = uid();
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({ id, ...data });
    await tx.insert(memberships).values({
      id: uid(),
      organizationId: id,
      userId: actor.id,
      role: "owner",
    });
    await tx
      .insert(preferences)
      .values({
        userId: actor.id,
        activeOrganizationId: id,
        locale: data.locale,
        timezone: data.timezone,
      })
      .onConflictDoNothing();
    await tx.insert(auditLog).values({
      id: uid(),
      organizationId: id,
      actorId: actor.id,
      action: "organization.created",
      resourceId: id,
    });
  });
  return { id, ...data, role: "owner" as const };
}
export async function resolveContext(
  db: CommercialDb,
  actor: Actor,
  requested?: string | null,
): Promise<Context> {
  const prefs = await db
    .select()
    .from(preferences)
    .where(eq(preferences.userId, actor.id))
    .limit(1);
  const orgs = await listOrganizations(db, actor.id);
  const id = requested || prefs[0]?.activeOrganizationId || orgs[0]?.id;
  if (!id)
    throw new DomainError(
      "ONBOARDING_REQUIRED",
      "Önce işletmenizi oluşturun.",
      409,
    );
  const [row] = await db
    .select({ organization: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(
      and(eq(memberships.userId, actor.id), eq(memberships.organizationId, id)),
    )
    .limit(1);
  if (!row || !Object.hasOwn(rights, row.role))
    throw new DomainError("NOT_FOUND", "İşletme bulunamadı.", 404);
  return { actor, organization: row.organization, role: row.role as Role };
}

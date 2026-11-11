import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Store } from "./db/store";
import { createIdentity, type TransactionalMail } from "./auth/service";
import { createCompatibility } from "./compat";
import { DomainError, errorResponse } from "./core/errors";
import {
  createOrganization,
  listOrganizations,
  resolveContext,
  requirePermission,
  type Actor,
} from "./organizations/service";
import {
  preferences,
  memberships,
  user,
  subscriptions,
  session as authSessions,
} from "./db/schema";
import { preferencesInput, identifier } from "../shared/contracts/commercial";
import { readiness } from "./core/readiness";
import {
  acceptInvitation,
  inviteMember,
  changeMember,
} from "./organizations/team";
import { historicalWeather } from "./weather/service";
import { boundedRequest } from "./core/request";
import { calculate } from "./calculations/service";
import { searchObservations } from "./analyses/observations";

import type { RuntimeOptions } from "./core/api";
import { assistantRoutes } from "./assistant/api";
import { reportRoutes } from "./reports/api";
import { recordRoutes } from "./records/api";
import { simulationRoutes } from "./simulation/api";
import { intelligenceRoutes } from "./intelligence/api";
import { offlineRoutes } from "./records/offline";
export async function createCommercialApplication(options: RuntimeOptions) {
  const { store } = options,
    db = store.db;
  const identity = createIdentity(store, options),
    legacy = await createCompatibility(store, options);
  async function getActor(headers: Headers): Promise<Actor> {
    const session = await identity.auth.api.getSession({ headers });
    if (!session)
      throw new DomainError(
        "UNAUTHENTICATED",
        "Oturum açmanız gerekiyor.",
        401,
      );
    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
    };
  }
  async function readBody(request: Request): Promise<Record<string, unknown>> {
    if (["GET", "HEAD"].includes(request.method)) return {};
    const text = await request.text();
    if (Buffer.byteLength(text) > 250000)
      throw new DomainError("BODY_TOO_LARGE", "İstek çok büyük.", 413);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new DomainError(
        "INVALID_CONTENT_TYPE",
        "JSON içerik türü gerekli.",
        415,
      );
    let value;
    try {
      value = text ? JSON.parse(text) : {};
    } catch {
      throw new DomainError("INVALID_JSON", "Geçerli JSON gerekli.");
    }
    return z.record(z.string(), z.unknown()).parse(value);
  }
  async function authRequest(request: Request) {
    const path = new URL(request.url).pathname;
    if (
      !identity.mailConfigured &&
      [
        "/api/auth/sign-up/email",
        "/api/auth/request-password-reset",
        "/api/auth/send-verification-email",
        "/api/auth/change-email",
      ].includes(path)
    )
      throw new DomainError(
        "EMAIL_NOT_CONFIGURED",
        "E-posta servisi henüz yapılandırılmadı. Bu işlem şu anda kullanılamıyor.",
        503,
      );
    return identity.auth.handler(request);
  }
  return {
    identity,
    legacy,
    async handle(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url),
          path = url.pathname,
          method = request.method;
        const origin = request.headers.get("origin");
        const fetchSite = request.headers.get("sec-fetch-site");
        const unsafe = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
        if (
          (origin && origin !== new URL(options.baseURL).origin) ||
          (unsafe && (fetchSite === "cross-site" || fetchSite === "same-site"))
        )
          throw new DomainError(
            "INVALID_ORIGIN",
            "İstek kaynağı doğrulanamadı.",
            403,
          );
        request = await boundedRequest(request);
        if (path === "/api/runtime" && method === "GET")
          return Response.json({
            runtime: "commercial",
            emailConfigured: identity.mailConfigured,
            salesEnabled: false,
          });
        if (path.startsWith("/api/auth/")) return await authRequest(request);
        const body = await readBody(request);
        if (
          ["/api/login", "/api/register", "/api/logout"].includes(path) &&
          method === "POST"
        ) {
          const endpoint =
            path === "/api/login"
              ? "sign-in/email"
              : path === "/api/register"
                ? "sign-up/email"
                : "sign-out";
          const response = await authRequest(
            new Request(new URL(`/api/auth/${endpoint}`, options.baseURL), {
              method,
              headers: request.headers,
              body: JSON.stringify(body),
            }),
          );
          if (!response.ok) {
            const data = (await response
              .clone()
              .json()
              .catch(() => ({}))) as { message?: string; code?: string };
            return Response.json(
              {
                error: data.message || "Kimlik işlemi tamamlanamadı.",
                code: data.code || "AUTH_ERROR",
              },
              { status: response.status, headers: response.headers },
            );
          }
          if (path === "/api/logout")
            return Response.json({ ok: true }, { headers: response.headers });
          const data = (await response.json()) as { user: Actor };
          return Response.json(
            { ...data.user, commercial: true },
            { headers: response.headers },
          );
        }
        const actor = await getActor(request.headers);
        if (path === "/api/v1/invitations/accept" && method === "POST")
          return Response.json(await acceptInvitation(db, actor, body));
        if (path === "/api/v1/account/sessions" && method === "GET") {
          const current = await identity.auth.api.getSession({
            headers: request.headers,
          });
          const sessions = await db
            .select({
              id: authSessions.id,
              createdAt: authSessions.createdAt,
              updatedAt: authSessions.updatedAt,
              expiresAt: authSessions.expiresAt,
              ipAddress: authSessions.ipAddress,
              userAgent: authSessions.userAgent,
            })
            .from(authSessions)
            .where(eq(authSessions.userId, actor.id));
          return Response.json({
            sessions: sessions
              .filter((s) => s.expiresAt > new Date())
              .map((s) => ({ ...s, current: s.id === current?.session.id })),
          });
        }
        const revokeSession = path.match(
          /^\/api\/v1\/account\/sessions\/([a-zA-Z0-9_-]+)\/revoke$/,
        );
        if (revokeSession && method === "POST") {
          const removed = await db
            .delete(authSessions)
            .where(
              and(
                eq(authSessions.id, revokeSession[1]!),
                eq(authSessions.userId, actor.id),
              ),
            )
            .returning({ id: authSessions.id });
          if (!removed.length)
            throw new DomainError("NOT_FOUND", "Oturum bulunamadı.", 404);
          return Response.json({ ok: true });
        }
        if (path === "/api/me" && method === "GET")
          return Response.json({ ...actor, commercial: true });
        if (path === "/api/v1/bootstrap" && method === "GET") {
          const orgs = await listOrganizations(db, actor.id),
            [prefs] = await db
              .select()
              .from(preferences)
              .where(eq(preferences.userId, actor.id))
              .limit(1);
          return Response.json({
            user: actor,
            organizations: orgs,
            preferences: prefs || null,
            emailConfigured: identity.mailConfigured,
            onboardingRequired: orgs.length === 0,
            capabilities: { waterBalance: true, claims: true, offlineNotes: true },
          });
        }
        if (path === "/api/v1/organizations" && method === "POST")
          return Response.json(await createOrganization(db, actor, body), {
            status: 201,
          });
        if (path === "/api/v1/preferences" && method === "PATCH") {
          const values = preferencesInput.parse(body);
          const [prefs] = await db
            .insert(preferences)
            .values({ userId: actor.id, ...values })
            .onConflictDoUpdate({ target: preferences.userId, set: values })
            .returning();
          return Response.json(prefs);
        }
        const context = await resolveContext(
          db,
          actor,
          request.headers.get("x-organization-id"),
        );
        if (path === "/api/v1/organizations/select" && method === "POST") {
          const selected = await resolveContext(
            db,
            actor,
            identifier.parse(body.organizationId),
          );
          await db
            .insert(preferences)
            .values({
              userId: actor.id,
              activeOrganizationId: selected.organization.id,
            })
            .onConflictDoUpdate({
              target: preferences.userId,
              set: { activeOrganizationId: selected.organization.id },
            });
          return Response.json({
            organization: selected.organization,
            role: selected.role,
          });
        }
        if (path === "/api/v1/organizations/members" && method === "GET") {
          const members = await db
            .select({ id: user.id, name: user.name, role: memberships.role })
            .from(memberships)
            .innerJoin(user, eq(user.id, memberships.userId))
            .where(eq(memberships.organizationId, context.organization.id));
          return Response.json({ members });
        }
        if (path === "/api/v1/organizations/invitations" && method === "POST")
          return Response.json(await inviteMember(db, context, body), {
            status: 201,
          });
        const memberMatch = path.match(
          /^\/api\/v1\/organizations\/members\/([a-zA-Z0-9_-]+)$/,
        );
        if (memberMatch && method === "PATCH")
          return Response.json(
            await changeMember(db, context, memberMatch[1]!, body),
          );
        if (path === "/api/v1/readiness" && method === "GET")
          return Response.json(await readiness(db));
        if (path === "/api/v1/weather/history" && method === "POST") {
          const { fieldId, ...dates } = body;
          return Response.json(
            await historicalWeather(
              db,
              context,
              identifier.parse(fieldId),
              dates,
            ),
          );
        }
        if (path === "/api/v1/billing" && method === "GET") {
          requirePermission(context, "billing.manage");
          const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.organizationId, context.organization.id))
            .limit(1);
          return Response.json({
            subscription: subscription || null,
            ...(await readiness(db)),
            checkoutAvailable: false,
            reason:
              "Şirket, sağlayıcı kabulü ve ticari çıkış koşulları tamamlanmadı.",
          });
        }
        if (path === "/api/v1/calculations" && method === "POST")
          return Response.json(await calculate(db, context, body));
        if (path === "/api/v1/observations/search" && method === "POST")
          return Response.json(await searchObservations(db, context, body));
        const evidence = path.match(/^\/api\/v1\/fields\/([a-f0-9]{32})\/evidence-bundle$/);
        if (evidence && method === "GET")
          return Response.json(await legacy.evidenceBundle(context, evidence[1]!), {
            headers: { "Cache-Control": "no-store" },
          });
        const input = {
          db,
          context,
          body,
          options: { ...options, parcelForecast: (fieldId: string) => legacy.forecast(context.organization.id, fieldId) },
          request,
          url,
          path,
          method,
        };
        for (const handler of [assistantRoutes, reportRoutes, recordRoutes, simulationRoutes, intelligenceRoutes, offlineRoutes]) {
          const response = await handler(input);
          if (response) return response;
        }
        return await legacy.handle(request, context, body);
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

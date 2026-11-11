import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createStore, type Store } from "../db/store";
import { DomainError, errorResponse } from "../core/errors";
import {
  preferencesInput,
  identifier,
} from "../../shared/contracts/commercial";
import { preferences, reports } from "../db/schema";
import { projectWorkspace, publishConfirmedTask } from "./snapshot";
import { accountRequest } from "./account";
import { recordRoutes } from "../records/api";
import { reportRoutes } from "../reports/api";
import { assistantRoutes } from "../assistant/api";
import { configuredAssistantModel } from "../assistant/model";
import { historicalWeather } from "../weather/service";
import { searchObservations } from "../analyses/observations";
import { privateObjects, type PrivateObjects } from "../files/private-store";
import { processReport } from "../reports/worker";
import type { Actor } from "../organizations/service";
import { intelligenceRoutes } from "../intelligence/api";
import type { RuntimeOptions } from "../core/api";
import { extendedEvidenceBundle } from "../intelligence/mrv";
import { publishProjectedClaims } from "../intelligence/claims";
import { simulationRoutes } from "../simulation/api";

export async function createProductionWorkspace(config: {
  store?: Store;
  secret: string;
  objects?: PrivateObjects;
}) {
  if (config.secret.length < 32)
    throw new Error("Workspace signing secret is required.");
  if (
    !config.store &&
    (!process.env.AGROMAX_DATABASE_URL ||
      process.env.AGROMAX_DATABASE_URL !== process.env.DATABASE_URL)
  )
    throw new Error(
      "Workspace database must explicitly match the existing account database.",
    );
  const store =
    config.store ||
    (await createStore({ url: process.env.AGROMAX_DATABASE_URL }));
  let objects = config.objects;
  const options = {
    store,
    get objects() {
      return (objects ||= privateObjects());
    },
    baseURL: "",
    secret: config.secret,
    enforceQuota: false,
    assistantModel: configuredAssistantModel(),
    reportDailyLimit: 10,
    dispatchReport: async (id: string) => {
      objects ||= privateObjects();
      try {
        await processReport(
          store,
          objects,
          id,
          randomBytes(16).toString("hex"),
        );
      } catch {
        await store.db
          .update(reports)
          .set({
            state: "failed",
            error: "Rapor oluşturulamadı. Kaynak kayıtlar korunuyor.",
          })
          .where(
            and(
              eq(reports.id, id),
              sql`${reports.state} in ('queued','running')`,
            ),
          );
        throw new DomainError(
          "REPORT_FAILED",
          "Rapor dosyası hazırlanamadı. Tekrar deneyin.",
          502,
        );
      }
    },
  };
  return {
    async handle(
      request: Request,
      sourceActor: { id: string; name: string; email: string },
      sourceBundle?: (accountId: string, fieldId: string) => Promise<Record<string, unknown>>,
      sourceForecast?: (accountId: string, fieldId: string) => ReturnType<NonNullable<RuntimeOptions["parcelForecast"]>>,
    ): Promise<Response> {
      try {
        const actor: Actor = {
          ...sourceActor,
          emailVerified: false,
          authentication: "legacy-session",
        };
        const ctx = await projectWorkspace(store, actor),
          url = new URL(request.url),
          path = url.pathname,
          method = request.method;
        const selected = request.headers.get("x-organization-id");
        if (selected && selected !== ctx.organization.id)
          throw new DomainError("NOT_FOUND", "İşletme bulunamadı.", 404);
        const body = ["GET", "HEAD"].includes(method)
          ? {}
          : z.record(z.string(), z.unknown()).parse(await request.json());
        // Existing session authentication remains the sole authority for this adapter.
        const account = await accountRequest(
          store,
          actor,
          config.secret,
          request,
          body,
        );
        if (account) return account;
        if (path === "/api/v1/bootstrap" && method === "GET") {
          const [prefs] = await store.db
            .select()
            .from(preferences)
            .where(eq(preferences.userId, actor.id));
          return Response.json({
            user: actor,
            organizations: [{ ...ctx.organization, role: ctx.role }],
            preferences: {
              ...prefs,
              activeOrganizationId: ctx.organization.id,
            },
            emailConfigured: false,
            onboardingRequired: false,
            capabilities: {
              customAnalysis: false,
              claims: true,
              waterBalance: true,
              workspaceMode: "existing-account",
              reportDailyLimit: 10,
            },
          });
        }
        if (path === "/api/v1/preferences" && method === "PATCH") {
          const data = preferencesInput.parse(body);
          const [row] = await store.db
            .update(preferences)
            .set(data)
            .where(eq(preferences.userId, actor.id))
            .returning();
          return Response.json(row);
        }
        if (path === "/api/v1/organizations/select" && method === "POST") {
          if (identifier.parse(body.organizationId) !== ctx.organization.id)
            throw new DomainError("NOT_FOUND", "İşletme bulunamadı.", 404);
          return Response.json({
            organization: ctx.organization,
            role: ctx.role,
          });
        }
        if (path === "/api/v1/organizations/members" && method === "GET")
          return Response.json({
            members: [{ id: actor.id, name: actor.name, role: ctx.role }],
          });
        if (
          path.startsWith("/api/v1/organizations") ||
          path === "/api/v1/invitations/accept"
        )
          throw new DomainError(
            "TEAM_VERIFICATION_REQUIRED",
            "Çok kullanıcılı işletme işlemleri için e-posta doğrulaması henüz etkin değil.",
            503,
          );
        if (path === "/api/v1/billing" && method === "GET")
          return Response.json({
            subscription: null,
            salesEnabled: false,
            checkoutAvailable: false,
            reason:
              "Çalışma alanı mevcut hesabına açık. Ödeme ve ücretli abonelik henüz etkin değil.",
          });
        if (path === "/api/v1/weather/history" && method === "POST") {
          const { fieldId, ...dates } = body;
          return Response.json(
            await historicalWeather(
              store.db,
              ctx,
              identifier.parse(fieldId),
              dates,
            ),
          );
        }
        if (path === "/api/v1/observations/search" && method === "POST")
          return Response.json(await searchObservations(store.db, ctx, body));
        const evidence = path.match(/^\/api\/v1\/fields\/([a-f0-9]{32})\/evidence-bundle$/);
        if (evidence && method === "GET" && sourceBundle)
          return Response.json(await extendedEvidenceBundle(store.db, ctx, evidence[1]!, async (_, fieldId) => {
            const bundle = await sourceBundle(actor.id, fieldId);
            await publishProjectedClaims(store.db, ctx.organization.id, fieldId);
            return bundle;
          }), { headers: { "Cache-Control": "private, no-store" } });
        const input = {
          db: store.db,
          context: ctx,
          body,
          options: { ...options, parcelForecast: sourceForecast && ((fieldId: string) => sourceForecast(actor.id, fieldId)) },
          request,
          url,
          path,
          method,
        };
        for (const handler of [recordRoutes, reportRoutes, assistantRoutes, intelligenceRoutes, simulationRoutes]) {
          const response = await handler(input);
          if (response) {
            if (path.endsWith("/confirm") && response.ok) {
              const decision = await response.clone().json();
              if (
                decision.kind === "task" &&
                decision.resultId &&
                decision.state === "confirmed"
              )
                await publishConfirmedTask(store.db, ctx, decision.resultId);
            }
            return response;
          }
        }
        throw new DomainError("NOT_FOUND", "Bulunamadı.", 404);
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

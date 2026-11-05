import { randomBytes } from "node:crypto";
import { z } from "zod";
import { fieldRoutes, prepareField } from "../server/fields.js";
import { createAnalysisService } from "../server/analysis-jobs.js";
import { createWeatherService } from "../server/weather.js";
import { createNasaService } from "../server/nasa.js";
import { searchPlaces } from "../server/places.js";
import { isISODate } from "../shared/dates.js";
import { legacyDomainAdapter, type Store } from "./db/store";
import { requirePermission, type Context } from "./organizations/service";
import { DomainError } from "./core/errors";
import { queueAnalysis, cancelAnalysis } from "./analyses/service";
import { and, eq, desc } from "drizzle-orm";
import { farmNotifications, notificationReceipts } from "./db/schema";
import { saveField } from "./fields/service";

export async function createCompatibility(
  store: Store,
  options: {
    dispatchAnalysis?: (id: string) => Promise<void>;
    enforceQuota?: boolean;
  } = {},
) {
  const db = legacyDomainAdapter(store);
  const baseJobs = await createAnalysisService(db),
    weather = await createWeatherService(db),
    nasa = await createNasaService(db);
  const jobs = {
    ...baseJobs,
    async enqueue(
      organizationId: string,
      fieldId: string,
      requestedRange?: unknown,
    ) {
      if (!options.dispatchAnalysis)
        throw new DomainError(
          "WORKFLOW_UNAVAILABLE",
          "Dayanıklı iş hizmeti henüz etkin değil.",
          503,
        );
      const id = await queueAnalysis(
        store.db,
        organizationId,
        fieldId,
        options.enforceQuota ?? true,
        requestedRange,
      );
      try {
        await options.dispatchAnalysis(id);
      } catch {
        /* The queued row is the durable outbox; the dispatcher retries it. */
      }
      return baseJobs.get(organizationId, id);
    },
    async cancel(organizationId: string, id: string, actorId: string) {
      await cancelAnalysis(store.db, organizationId, id, actorId);
      return baseJobs.get(organizationId, id);
    },
  };
  return {
    jobs,
    async handle(
      request: Request,
      ctx: Context,
      body: Record<string, unknown>,
    ): Promise<Response> {
      const url = new URL(request.url),
        path = url.pathname,
        method = request.method;
      let response: Response | undefined;
      const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      const reply = (status: number, value: unknown) => {
        response = Response.json(value, { status, headers });
      };
      const res = {
        statusCode: 200,
        setHeader: (key: string, value: string | number) =>
          headers.set(key, String(value)),
        end: (value?: string | Uint8Array) => {
          response = new Response(
            typeof value === "string" || value === undefined
              ? value
              : new Uint8Array(value),
            { status: res.statusCode, headers },
          );
        },
      };
      const session = {
        id: ctx.organization.id,
        name: ctx.actor.name,
        email: ctx.actor.email,
      };
      const req = { url: path + url.search, method };
      if (path === "/api/records" && method === "POST" && body.kind === "field")
        return Response.json(
          await saveField(store.db, ctx, body, options.enforceQuota ?? true),
          { status: 201 },
        );
      const fieldMutation = path.match(
        /^\/api\/records\/([a-f0-9]{32})(\/restore)?$/,
      );
      if (
        fieldMutation &&
        ((method === "PATCH" && !fieldMutation[2]) ||
          method === "DELETE" ||
          (method === "POST" && fieldMutation[2]))
      ) {
        const row = await db
          .prepare("SELECT kind FROM records WHERE id=? AND user_id=?")
          .get(fieldMutation[1], ctx.organization.id);
        if (row?.kind === "field") {
          const field = await saveField(
            store.db,
            ctx,
            body,
            options.enforceQuota ?? true,
            {
              id: fieldMutation[1]!,
              action:
                method === "PATCH"
                  ? "update"
                  : method === "DELETE"
                    ? "delete"
                    : "restore",
            },
          );
          return Response.json(
            method === "DELETE" ? { ok: true, version: field.version } : field,
          );
        }
      }
      if (method !== "GET") {
        if (
          path === "/api/places/search" ||
          path.endsWith("/image") ||
          path === "/api/notifications/read"
        )
          requirePermission(ctx, "read");
        else if (
          path.endsWith("/analysis") ||
          /\/analyses\/.+\/cancel$/.test(path)
        )
          requirePermission(ctx, "calculate");
        else if (
          (path === "/api/records" && body.kind === "field") ||
          (path.startsWith("/api/records/") && method === "DELETE") ||
          path.endsWith("/restore")
        )
          requirePermission(ctx, "field.write");
        else requirePermission(ctx, "record.write");
      }
      if (path === "/api/notifications" && method === "GET") {
        const rows = await store.db
          .select({
            notification: farmNotifications,
            receipt: notificationReceipts.readAt,
          })
          .from(farmNotifications)
          .leftJoin(
            notificationReceipts,
            and(
              eq(notificationReceipts.notificationId, farmNotifications.id),
              eq(notificationReceipts.userId, ctx.actor.id),
            ),
          )
          .where(eq(farmNotifications.organizationId, ctx.organization.id))
          .orderBy(desc(farmNotifications.createdAt))
          .limit(200);
        return Response.json({
          notifications: rows.map(({ notification: n, receipt }) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            jobId: n.jobId,
            fieldId: n.fieldId,
            createdAt: n.createdAt,
            readAt: receipt?.toISOString() || null,
          })),
        });
      }
      if (path === "/api/notifications/read" && method === "POST") {
        const ids = z
          .array(z.string().regex(/^[a-f0-9]{32}$/))
          .max(200)
          .parse(body.ids);
        for (const id of ids) {
          const [owned] = await store.db
            .select({ id: farmNotifications.id })
            .from(farmNotifications)
            .where(
              and(
                eq(farmNotifications.id, id),
                eq(farmNotifications.organizationId, ctx.organization.id),
              ),
            );
          if (owned)
            await store.db
              .insert(notificationReceipts)
              .values({
                id: randomBytes(16).toString("hex"),
                notificationId: id,
                userId: ctx.actor.id,
              })
              .onConflictDoNothing();
        }
        return Response.json({ ok: true });
      }
      const cancel = path.match(/^\/api\/analyses\/([a-f0-9]{32})\/cancel$/);
      const customAnalysis = path.match(
        /^\/api\/records\/([a-f0-9]{32})\/analysis$/,
      );
      if (customAnalysis && method === "POST" && body.range !== undefined)
        return Response.json(
          {
            job: await jobs.enqueue(
              ctx.organization.id,
              customAnalysis[1]!,
              body.range,
            ),
          },
          { status: 202 },
        );
      if (cancel && method === "POST")
        return Response.json({
          job: await jobs.cancel(ctx.organization.id, cancel[1]!, ctx.actor.id),
        });
      if (path === "/api/weather" && method === "GET")
        return Response.json(
          await weather.forecast(
            ctx.organization.id,
            url.searchParams.get("fieldId") || "",
          ),
          { headers },
        );
      if (path === "/api/nasa/status" && method === "GET")
        return Response.json(await nasa.status(), { headers });
      if (path === "/api/nasa/verify" && method === "POST") {
        requirePermission(ctx, "organization.manage");
        return Response.json(await nasa.verify(), { headers });
      }
      if (path === "/api/places/search" && method === "POST")
        return Response.json(
          await searchPlaces(body.query, {
            lat:
              body.lat === undefined
                ? 39
                : z.number().min(-90).max(90).parse(body.lat),
            lng:
              body.lng === undefined
                ? 35
                : z.number().min(-180).max(180).parse(body.lng),
          }),
          { headers },
        );
      if (await jobs.routes({ req, body, session, reply })) return response!;
      if (path.startsWith("/api/records/") && method === "PATCH") {
        const row = await db
          .prepare("SELECT kind FROM records WHERE id=? AND user_id=?")
          .get(path.split("/").pop(), ctx.organization.id);
        if (row?.kind === "field") requirePermission(ctx, "field.write");
      }
      if (
        await fieldRoutes({
          req,
          body,
          session,
          db,
          reply,
          res,
          analysisService: jobs,
        })
      )
        return response!;
      if (path === "/api/records" && method === "GET") {
        const rows = await db
          .prepare("SELECT id,kind,body FROM records WHERE user_id=?")
          .all(ctx.organization.id);
        return Response.json(
          rows
            .map((r) => ({
              ...JSON.parse(String(r.body)),
              ...(r.kind === "field"
                ? { version: JSON.parse(String(r.body)).version || 1 }
                : {}),
              id: r.id,
              kind: r.kind,
            }))
            .filter((r) => !r.deletedAt),
          { headers },
        );
      }
      if (path === "/api/records" && method === "POST") {
        if (
          !["field", "task"].includes(String(body.kind)) ||
          !String(body.name || "").trim() ||
          String(body.name).length > 150
        )
          throw new DomainError("INVALID_RECORD", "Kayıt bilgileri geçersiz.");
        const data: Record<string, unknown> = {
          name: String(body.name).trim(),
          createdAt: new Date().toISOString(),
          createdBy: ctx.actor.id,
        };
        if (body.kind === "field") {
          try {
            Object.assign(data, prepareField(body));
          } catch (error) {
            throw new DomainError(
              "INVALID_FIELD",
              error instanceof Error
                ? error.message
                : "Parsel bilgileri geçersiz.",
            );
          }
        } else {
          if (!isISODate(body.date))
            throw new DomainError("INVALID_DATE", "Geçerli tarih girin.");
          data.date = body.date;
          data.done = false;
        }
        const id = randomBytes(16).toString("hex");
        await db
          .prepare("INSERT INTO records VALUES(?,?,?,?)")
          .run(id, ctx.organization.id, body.kind, JSON.stringify(data));
        return Response.json(
          { ...data, id, kind: body.kind },
          { status: 201, headers },
        );
      }
      if (/^\/api\/records\/[a-f0-9]+$/.test(path) && method === "PATCH") {
        const id = path.split("/").pop(),
          row = await db
            .prepare("SELECT body,kind FROM records WHERE id=? AND user_id=?")
            .get(id, ctx.organization.id);
        if (!row || row.kind !== "task")
          throw new DomainError("NOT_FOUND", "Görev bulunamadı.", 404);
        const data = {
          ...JSON.parse(String(row.body)),
          done: body.done === true,
        };
        await db
          .prepare("UPDATE records SET body=? WHERE id=? AND user_id=?")
          .run(JSON.stringify(data), id, ctx.organization.id);
        return Response.json({ ...data, id, kind: "task" }, { headers });
      }
      throw new DomainError("NOT_FOUND", "Uç nokta bulunamadı.", 404);
    },
  };
}

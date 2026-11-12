import { fieldRoutes, prepareField } from "./fields.js";
import { searchPlaces } from "./places.js";
import { createAnalysisService } from "./analysis-jobs.js";
import { isISODate } from "../shared/dates.js";
import { createNasaService } from "./nasa.js";
import { createWeatherService } from "./weather.js";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { openDatabase, initializeDatabase } from "./database.js";
import { createPlatformService } from "./platform.js";
import { enrichAnalysis } from "./analysis-report.js";
import { Readable } from "node:stream";
import { terrainUpload } from "../shared/terrain-upload.js";

/** @param {{db?:any, background?:(work:Promise<unknown>)=>void,workspace?:any}} [options] */
export async function createApplication({
  db,
  background = () => {},
  workspace: suppliedWorkspace,
} = {}) {
  db ??= await openDatabase();
  await initializeDatabase(db);
  const analysisService = await createAnalysisService(db, {
    enrich: process.env.AGROMAX_WORKSPACE_ENABLED === "true" ? enrichAnalysis : undefined,
  });
  const platformService = await createPlatformService(db);
  const nasaService = await createNasaService(db);
  const weatherService = await createWeatherService(db);
  const workspace =
    suppliedWorkspace ||
    (process.env.AGROMAX_WORKSPACE_ENABLED === "true"
      ? await (
          await import("../commercial/production/workspace.ts")
        ).createProductionWorkspace({
          secret: process.env.AGROMAX_AUTH_SECRET || "",
          background: process.env.VERCEL ? background : undefined,
        })
      : null);
  return {
    db,
    analysisService,
    async handle(req, res) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const reply = (code, data) => {
        res.statusCode = code;
        res.end(JSON.stringify(data));
      };
      try {
        if (
          req.headers.origin &&
          req.headers.origin !==
            `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}`
        )
          return reply(403, { error: "İstek kaynağı doğrulanamadı." });
        const terrainFile = !process.env.VERCEL && workspace && req.method === "PUT" &&
          terrainUpload.test(req.url);
        let body = terrainFile ? {} : req.body;
        if (body === undefined) {
          let raw = "";
          for await (const chunk of req) {
            raw += chunk;
            if (Buffer.byteLength(raw) > 250000)
              return reply(413, { error: "İstek çok büyük." });
          }
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            return reply(400, { error: "Geçerli JSON gerekli." });
          }
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          return reply(400, { error: "İstek bilgileri geçersiz." });
        if (Buffer.byteLength(JSON.stringify(body)) > 250000)
          return reply(413, { error: "İstek çok büyük." });
        if (req.url === "/api/runtime" && req.method === "GET")
          return reply(200, {
            runtime: workspace ? "workspace" : "prototype",
            workspaceEnabled: !!workspace,
            emailConfigured: false,
            salesEnabled: false,
          });
        const token = (req.headers.cookie || "")
          .split("; ")
          .find((x) => x.startsWith("session="))
          ?.slice(8);
        const session = await db
          .prepare(
            "SELECT users.id,users.name,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
          )
          .get(token || "", Date.now());
        if (
          ["/api/login", "/api/register"].includes(req.url) &&
          req.method === "POST"
        ) {
          const address = process.env.VERCEL
            ? req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
            : req.socket.remoteAddress;
          const key = createHash("sha256")
            .update(address || "unknown")
            .digest("hex");
          const rate = await db.transaction(async (tx) => {
            await tx
              .prepare("DELETE FROM auth_limits WHERE started_at<?")
              .run(Date.now() - 600000);
            return tx
              .prepare(
                "INSERT INTO auth_limits(key,attempts,started_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=auth_limits.attempts+1 RETURNING attempts",
              )
              .get(key, Date.now());
          });
          if (rate.attempts > 30)
            return reply(429, {
              error: "Çok fazla deneme. Daha sonra tekrar deneyin.",
            });
          const email = String(body.email || "")
              .trim()
              .toLowerCase(),
            password = String(body.password || "");
          if (
            !/^[^ @]+@[^ @]+\.[^ @]+$/.test(email) ||
            password.length < 12 ||
            password.length > 256
          )
            return reply(400, {
              error: "Geçerli e-posta ve en az 12 karakterli şifre gerekli.",
            });
          let user;
          if (req.url === "/api/register") {
            const name = String(body.name || "").trim();
            if (!name || name.length > 100)
              return reply(400, { error: "Adınızı girin." });
            const salt = randomBytes(16).toString("hex");
            const hash = scryptSync(password, salt, 64).toString("hex");
            user = { id: randomBytes(16).toString("hex"), name, email };
            try {
              await db
                .prepare("INSERT INTO users VALUES(?,?,?,?)")
                .run(user.id, name, email, salt + ":" + hash);
            } catch {
              return reply(409, {
                error: "Bu e-posta ile kayıt oluşturulamıyor.",
              });
            }
          } else {
            user = await db
              .prepare("SELECT * FROM users WHERE email=?")
              .get(email);
            if (!user)
              return reply(401, { error: "E-posta veya şifre hatalı." });
            const [salt, hash] = user.password.split(":");
            if (
              !timingSafeEqual(
                scryptSync(password, salt, 64),
                Buffer.from(hash, "hex"),
              )
            )
              return reply(401, { error: "E-posta veya şifre hatalı." });
          }
          const t = randomBytes(32).toString("hex");
          await db
            .prepare("INSERT INTO sessions VALUES(?,?,?)")
            .run(t, user.id, Date.now() + 86400000);
          res.setHeader(
            "Set-Cookie",
            `session=${t};${process.env.VERCEL ? " Secure;" : ""} HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
          );
          return reply(200, {
            id: user.id,
            name: user.name,
            email: user.email,
            ...(workspace ? { commercial: true } : {}),
          });
        }
        if (!session) return reply(401, { error: "Oturum açmanız gerekiyor." });
        if (await platformService.routes({ req, body, session, reply, res })) return;
        if (
          workspace &&
          (req.url.startsWith("/api/v1/") || req.url.startsWith("/api/auth/"))
        ) {
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers))
            if (typeof value === "string") headers.set(key, value);
          const response = await workspace.handle(
            new Request(
              `${process.env.VERCEL ? "https" : "http"}://${req.headers.host}${req.url}`,
              {
                method: req.method,
                headers,
                ...(terrainFile ? { body: Readable.toWeb(req), duplex: "half" } : ["GET", "HEAD"].includes(req.method)
                  ? {}
                  : { body: JSON.stringify(body) }),
              },
            ),
            session,
            platformService.bundle,
            weatherService.forecast,
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.setHeader("Cache-Control", "private, no-store");
          res.end(Buffer.from(await response.arrayBuffer()));
          return;
        }
        if (req.url.startsWith("/api/weather") && req.method === "GET") {
          const url = new URL(req.url, "http://localhost");
          if (url.pathname === "/api/weather") {
            try {
              return reply(
                200,
                await weatherService.forecast(
                  session.id,
                  url.searchParams.get("fieldId") || "",
                ),
              );
            } catch (error) {
              return reply(error.status || 502, {
                error: error.status
                  ? error.message
                  : "Meteoroloji verisi alınamadı.",
              });
            }
          }
        }
        if (req.url === "/api/nasa/status" && req.method === "GET")
          return reply(200, await nasaService.status());
        if (req.url === "/api/nasa/verify" && req.method === "POST")
          return reply(200, await nasaService.verify());
        if (req.url === "/api/places/search" && req.method === "POST") {
          try {
            return reply(
              200,
              await searchPlaces(body.query, {
                lat: body.lat ?? 39,
                lng: body.lng ?? 35,
              }),
            );
          } catch (e) {
            return reply(e.status || 502, {
              error:
                e.name === "TimeoutError"
                  ? "Yer araması zaman aşımına uğradı. Tekrar deneyin."
                  : e.message,
            });
          }
        }
        if (await analysisService.routes({ req, body, session, reply })) return;
        if (
          await fieldRoutes({
            req,
            body,
            session,
            db,
            reply,
            res,
            analysisService,
          })
        )
          return;
        if (req.url === "/api/me")
          return reply(200, {
            ...session,
            ...(workspace ? { commercial: true } : {}),
          });
        if (req.url === "/api/logout" && req.method === "POST") {
          await db.prepare("DELETE FROM sessions WHERE token=?").run(token);
          res.setHeader(
            "Set-Cookie",
            `session=;${process.env.VERCEL ? " Secure;" : ""} HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
          );
          return reply(200, { ok: true });
        }
        if (req.url === "/api/records" && req.method === "GET")
          return reply(
            200,
            (
              await db
                .prepare("SELECT id,kind,body FROM records WHERE user_id=?")
                .all(session.id)
            )
              .map((r) => ({ ...JSON.parse(r.body), id: r.id, kind: r.kind }))
              .filter((r) => !r.deletedAt),
          );
        if (req.url === "/api/records" && req.method === "POST") {
          if (
            !["field", "task"].includes(body.kind) ||
            !String(body.name || "").trim() ||
            String(body.name).length > 150
          )
            return reply(400, { error: "Kayıt bilgileri geçersiz." });
          const record = {
            name: body.name.trim(),
            createdAt: new Date().toISOString(),
          };
          if (body.kind === "field") {
            try {
              Object.assign(record, prepareField(body));
            } catch (e) {
              return reply(400, { error: e.message });
            }
          } else {
            if (!isISODate(body.date))
              return reply(400, { error: "Geçerli tarih girin." });
            record.date = body.date;
            record.done = false;
            if (body.fieldId) {
              const parcel = await db.prepare("SELECT body FROM records WHERE id=? AND user_id=? AND kind='field'").get(String(body.fieldId), session.id);
              if (!parcel || JSON.parse(parcel.body).deletedAt)
                return reply(404, { error: "Görev için seçilen parsel bulunamadı." });
              record.fieldId = body.fieldId;
            }
          }
          const id = randomBytes(16).toString("hex");
          await db
            .prepare("INSERT INTO records VALUES(?,?,?,?)")
            .run(id, session.id, body.kind, JSON.stringify(record));
          return reply(201, { ...record, id, kind: body.kind });
        }
        if (req.url.startsWith("/api/records/") && req.method === "PATCH") {
          const id = req.url.split("/").pop();
          const r = await db
            .prepare("SELECT * FROM records WHERE id=? AND user_id=?")
            .get(id, session.id);
          if (!r || r.kind !== "task")
            return reply(404, { error: "Görev bulunamadı." });
          const data = { ...JSON.parse(r.body), done: body.done === true };
          await db
            .prepare("UPDATE records SET body=? WHERE id=?")
            .run(JSON.stringify(data), id);
          return reply(200, { ...data, id, kind: "task" });
        }
        return reply(404, { error: "Bulunamadı." });
      } catch (e) {
        console.error("API request failed", {
          code: typeof e.code === "string" ? e.code : "internal",
        });
        if (!res.writableEnded) reply(500, { error: "İşlem tamamlanamadı." });
      } finally {
        background(
          analysisService
            .start()
            .catch(() => console.error("Analysis worker interrupted.")),
        );
      }
    },
  };
}

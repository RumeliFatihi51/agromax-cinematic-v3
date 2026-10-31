import { fieldRoutes, prepareField } from "./fields.js";
import { searchPlaces } from "./places.js";
import { createAnalysisService } from "./analysis-jobs.js";
import { isISODate } from "../shared/dates.js";
import { createNasaService } from "./nasa.js";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/agromax.sqlite");
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,user_id TEXT,kind TEXT,body TEXT);`,
);
db.exec(
  "CREATE TABLE IF NOT EXISTS analyses(field_id TEXT PRIMARY KEY, geometry_hash TEXT, body TEXT)",
);
const vite = await createServer({
  server: { middlewareMode: true, host: "127.0.0.1" },
  appType: "spa",
});
const analysisService = createAnalysisService(db);
const nasaService = createNasaService(db);
const limits = new Map();
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/api/"))
    return vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const reply = (code, data) => {
    res.statusCode = code;
    res.end(JSON.stringify(data));
  };
  try {
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      return reply(403, { error: "İstek kaynağı doğrulanamadı." });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 250000) return reply(413, { error: "İstek Çok büyük." });
    }
    const body = raw ? JSON.parse(raw) : {};
    const token = (req.headers.cookie || "")
      .split("; ")
      .find((x) => x.startsWith("session="))
      ?.slice(8);
    const session = db
      .prepare(
        "SELECT users.id,users.name,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
      )
      .get(token || "", Date.now());
    if (
      ["/api/login", "/api/register"].includes(req.url) &&
      req.method === "POST"
    ) {
      const key = req.socket.remoteAddress;
      const rate = limits.get(key) || { n: 0, start: Date.now() };
      if (Date.now() - rate.start > 600000) {
        rate.n = 0;
        rate.start = Date.now();
      }
      limits.set(key, rate);
      if (++rate.n > 30)
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
          db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
            user.id,
            name,
            email,
            salt + ":" + hash,
          );
        } catch {
          return reply(409, { error: "Bu e-posta ile kayıt oluşturulamıyor." });
        }
      } else {
        user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (!user) return reply(401, { error: "E-posta veya şifre hatalı." });
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
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        t,
        user.id,
        Date.now() + 86400000,
      );
      res.setHeader(
        "Set-Cookie",
        `session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
      );
      return reply(200, { id: user.id, name: user.name, email: user.email });
    }
    if (!session) return reply(401, { error: "Oturum açmanız gerekiyor." });
    if (req.url === "/api/nasa/status" && req.method === "GET")
      return reply(200, nasaService.status());
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
      await fieldRoutes({ req, body, session, db, reply, res, analysisService })
    )
      return;
    if (req.url === "/api/me") return reply(200, session);
    if (req.url === "/api/logout" && req.method === "POST") {
      db.prepare("DELETE FROM sessions WHERE token=?").run(token);
      res.setHeader(
        "Set-Cookie",
        "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      return reply(200, { ok: true });
    }
    if (req.url === "/api/records" && req.method === "GET")
      return reply(
        200,
        db
          .prepare("SELECT id,kind,body FROM records WHERE user_id=?")
          .all(session.id)
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
      }
      const id = randomBytes(16).toString("hex");
      db.prepare("INSERT INTO records VALUES(?,?,?,?)").run(
        id,
        session.id,
        body.kind,
        JSON.stringify(record),
      );
      return reply(201, { ...record, id, kind: body.kind });
    }
    if (req.url.startsWith("/api/records/") && req.method === "PATCH") {
      const id = req.url.split("/").pop();
      const r = db
        .prepare("SELECT * FROM records WHERE id=? AND user_id=?")
        .get(id, session.id);
      if (!r || r.kind !== "task")
        return reply(404, { error: "Görev bulunamadı." });
      const data = { ...JSON.parse(r.body), done: body.done === true };
      db.prepare("UPDATE records SET body=? WHERE id=?").run(
        JSON.stringify(data),
        id,
      );
      return reply(200, { ...data, id, kind: "task" });
    }
    return reply(404, { error: "Bulunamadı." });
  } catch (e) {
    console.error(e.message);
    reply(500, { error: "İşlem tamamlanamadı." });
  }
});
server.listen(5173, "127.0.0.1", () =>
  console.log("Agromax: http://127.0.0.1:5173"),
);

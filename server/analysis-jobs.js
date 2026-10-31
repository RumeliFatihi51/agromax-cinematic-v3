import { createHash, randomBytes } from "node:crypto";
import { fetchAnalysis, satelliteStatus } from "./satellite.js";

export const geometryHash = (geometry) =>
  createHash("sha256")
    .update(JSON.stringify(geometry || null))
    .digest("hex");
const id = () => randomBytes(16).toString("hex");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

export function createAnalysisService(
  db,
  {
    execute = fetchAnalysis,
    configured = () => satelliteStatus().configured,
  } = {},
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_jobs(
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, field_id TEXT NOT NULL,
      geometry_hash TEXT NOT NULL, snapshot TEXT NOT NULL, state TEXT NOT NULL,
      created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
      result TEXT, error TEXT
    );
    CREATE INDEX IF NOT EXISTS analysis_jobs_owner ON analysis_jobs(user_id,created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_active_field ON analysis_jobs(field_id) WHERE state IN ('queued','running');
    CREATE TABLE IF NOT EXISTS notifications(
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, message TEXT NOT NULL, job_id TEXT,
      field_id TEXT, created_at TEXT NOT NULL, read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS notifications_owner ON notifications(user_id,created_at);
    CREATE TABLE IF NOT EXISTS audit_events(
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL,
      resource_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const controllers = new Map();
  let worker = null;
  const audit = (row, action) =>
    db
      .prepare("INSERT INTO audit_events VALUES(?,?,?,?,?)")
      .run(id(), row.user_id, action, row.id, new Date().toISOString());
  function notify(row, type, title, message) {
    db.prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?,NULL)").run(
      id(),
      row.user_id,
      type,
      title,
      message,
      row.id,
      row.field_id,
      new Date().toISOString(),
    );
  }
  function publicJob(row, result = false) {
    if (!row) return null;
    const snapshot = JSON.parse(row.snapshot);
    return {
      id: row.id,
      fieldId: row.field_id,
      fieldName: snapshot.field.name,
      state: row.state,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      type: "Sentinel-2 L2A spektral analiz",
      source: "Copernicus Sentinel-2 L2A",
      error: row.error,
      ...(result ? { field: snapshot.field } : {}),
      ...(result && row.result ? { analysis: JSON.parse(row.result) } : {}),
    };
  }
  function ownerJob(userId, jobId) {
    const row = db
      .prepare("SELECT * FROM analysis_jobs WHERE id=? AND user_id=?")
      .get(jobId, userId);
    if (!row) throw fail("Analiz kaydı bulunamadı.", 404);
    return row;
  }
  function recover() {
    // Only jobs proven running in persistent state are marked interrupted.
    for (const row of db
      .prepare("SELECT * FROM analysis_jobs WHERE state='running'")
      .all()) {
      db.prepare(
        "UPDATE analysis_jobs SET state='failed',finished_at=?,error=? WHERE id=?",
      ).run(
        new Date().toISOString(),
        "Sunucu yeniden başlatıldığı için işlem tamamlanamadı. Yeniden başlatabilirsiniz.",
        row.id,
      );
      notify(
        row,
        "analysis.failed",
        "Analiz yarıda kaldı",
        "Sunucu yeniden başlatıldı; sonuç oluşturulmadı.",
      );
      audit(row, "analysis.interrupted");
    }
  }
  async function drain() {
    let row;
    while (
      (row = db
        .prepare(
          "SELECT * FROM analysis_jobs WHERE state='queued' ORDER BY created_at,rowid LIMIT 1",
        )
        .get())
    ) {
      const controller = new AbortController();
      controllers.set(row.id, controller);
      db.prepare(
        "UPDATE analysis_jobs SET state='running',started_at=? WHERE id=?",
      ).run(new Date().toISOString(), row.id);
      audit(row, "analysis.started");
      try {
        const snapshot = JSON.parse(row.snapshot);
        const analysis = await execute(snapshot.field.geometry, {
          signal: controller.signal,
        });
        if (
          !analysis?.source ||
          !analysis?.fetchedAt ||
          !Array.isArray(analysis.observations) ||
          !Array.isArray(analysis.scenes) ||
          !analysis.method
        )
          throw fail(
            "İşlem geçerli bir analiz sonucu döndürmedi; kaydedilmedi.",
            502,
          );
        if (
          db.prepare("SELECT state FROM analysis_jobs WHERE id=?").get(row.id)
            ?.state !== "running"
        )
          continue;
        const current = db
          .prepare(
            "SELECT body FROM records WHERE id=? AND user_id=? AND kind='field'",
          )
          .get(row.field_id, row.user_id);
        const field = current && JSON.parse(current.body);
        if (
          !field ||
          field.deletedAt ||
          geometryHash(field.geometry) !== row.geometry_hash
        )
          throw fail(
            "Parsel sınırı değişti veya kaldırıldı; eski geometri için sonuç kaydedilmedi.",
            409,
          );
        const result = { ...analysis, historyId: row.id };
        const serialized = JSON.stringify(result);
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            "INSERT INTO analyses(field_id,geometry_hash,body) VALUES(?,?,?) ON CONFLICT(field_id) DO UPDATE SET geometry_hash=excluded.geometry_hash,body=excluded.body",
          ).run(row.field_id, row.geometry_hash, serialized);
          db.prepare(
            "UPDATE analysis_jobs SET state='completed',finished_at=?,result=? WHERE id=? AND state='running'",
          ).run(new Date().toISOString(), serialized, row.id);
          notify(
            row,
            "analysis.completed",
            "Analiz tamamlandı",
            `${snapshot.field.name} için gerçek uydu analiz sonuçları hazır.`,
          );
          audit(row, "analysis.completed");
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      } catch (e) {
        if (
          db.prepare("SELECT state FROM analysis_jobs WHERE id=?").get(row.id)
            ?.state === "running"
        ) {
          const message = e.status
            ? e.message
            : "Analiz tamamlanamadı. Mevcut sonuçlar korunuyor; tekrar deneyebilirsiniz.";
          db.prepare(
            "UPDATE analysis_jobs SET state='failed',finished_at=?,error=? WHERE id=?",
          ).run(new Date().toISOString(), message, row.id);
          notify(row, "analysis.failed", "Analiz tamamlanamadı", message);
          audit(row, "analysis.failed");
        }
      } finally {
        controllers.delete(row.id);
      }
    }
  }
  function start() {
    if (!worker)
      worker = Promise.resolve()
        .then(drain)
        .finally(() => {
          worker = null;
        });
    return worker;
  }
  recover();
  start();
  return {
    enqueue(userId, fieldId) {
      const owned = db
        .prepare(
          "SELECT body FROM records WHERE id=? AND user_id=? AND kind='field'",
        )
        .get(fieldId, userId);
      const field = owned && JSON.parse(owned.body);
      if (!field || field.deletedAt) throw fail("Parsel bulunamadı.", 404);
      if (!configured())
        throw fail(
          "Uydu veri bağlantısı yapılandırılmadı. Kimlik bilgilerini kontrol edin.",
          503,
        );
      if (!field.geometry)
        throw fail("Uydu analizi için önce parsel sınırını çizin.");
      const count = db
        .prepare(
          "SELECT COUNT(*) AS n FROM analysis_jobs WHERE user_id=? AND state IN ('queued','running')",
        )
        .get(userId).n;
      if (count >= 10)
        throw fail(
          "En fazla 10 analiz bekleyebilir. Mevcut işlemleri tamamlayın veya iptal edin.",
          429,
        );
      const duplicate = db
        .prepare(
          "SELECT * FROM analysis_jobs WHERE field_id=? AND user_id=? AND state IN ('queued','running')",
        )
        .get(fieldId, userId);
      if (duplicate) return publicJob(duplicate);
      const jobId = id();
      db.prepare(
        "INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at) VALUES(?,?,?,?,?,'queued',?)",
      ).run(
        jobId,
        userId,
        fieldId,
        geometryHash(field.geometry),
        JSON.stringify({ field: { ...field, id: fieldId } }),
        new Date().toISOString(),
      );
      const row = ownerJob(userId, jobId);
      audit(row, "analysis.queued");
      start();
      return publicJob(row);
    },
    get(userId, jobId) {
      return publicJob(ownerJob(userId, jobId), true);
    },
    list(userId, fieldId) {
      return db
        .prepare(
          "SELECT * FROM analysis_jobs WHERE user_id=? AND (? IS NULL OR field_id=?) ORDER BY created_at DESC,rowid DESC LIMIT 200",
        )
        .all(userId, fieldId || null, fieldId || null)
        .map((r) => publicJob(r));
    },
    cancel(userId, jobId) {
      const row = ownerJob(userId, jobId);
      if (!["queued", "running"].includes(row.state))
        throw fail("Bu işlem artık iptal edilemez.", 409);
      db.prepare(
        "UPDATE analysis_jobs SET state='canceled',finished_at=? WHERE id=?",
      ).run(new Date().toISOString(), row.id);
      controllers.get(row.id)?.abort();
      notify(
        row,
        "analysis.canceled",
        "Analiz iptal edildi",
        "İşlem kullanıcı tarafından iptal edildi; yeni sonuç kaydedilmedi.",
      );
      audit(row, "analysis.canceled");
      return publicJob(ownerJob(userId, jobId));
    },
    async waitForIdle() {
      await worker;
    },
    async routes({ req, session, body, reply }) {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/analyses" && req.method === "GET") {
        reply(200, {
          jobs: this.list(session.id, url.searchParams.get("fieldId")),
          limit: 200,
        });
        return true;
      }
      const jobMatch = url.pathname.match(
        /^\/api\/analyses\/([a-f0-9]{32})(\/cancel)?$/,
      );
      if (jobMatch) {
        try {
          if (req.method === "GET" && !jobMatch[2])
            reply(200, { job: this.get(session.id, jobMatch[1]) });
          else if (req.method === "POST" && jobMatch[2])
            reply(200, { job: this.cancel(session.id, jobMatch[1]) });
          else reply(405, { error: "Bu işlem desteklenmiyor." });
        } catch (e) {
          reply(e.status || 500, {
            error: e.status ? e.message : "Analiz kaydı alınamadı.",
          });
        }
        return true;
      }
      if (url.pathname === "/api/notifications" && req.method === "GET") {
        reply(200, {
          notifications: db
            .prepare(
              "SELECT id,type,title,message,job_id AS jobId,field_id AS fieldId,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 200",
            )
            .all(session.id),
        });
        return true;
      }
      if (url.pathname === "/api/notifications/read" && req.method === "POST") {
        if (
          !Array.isArray(body.ids) ||
          body.ids.length > 200 ||
          body.ids.some(
            (x) => typeof x !== "string" || !/^[a-f0-9]{32}$/.test(x),
          )
        ) {
          reply(400, { error: "Bildirim seçimi geçersiz." });
          return true;
        }
        const update = db.prepare(
          "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",
        );
        for (const notificationId of body.ids)
          update.run(new Date().toISOString(), notificationId, session.id);
        reply(200, { ok: true });
        return true;
      }
      return false;
    },
  };
}

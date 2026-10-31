import { createHash, randomBytes } from "node:crypto";
import { fetchAnalysis, satelliteStatus } from "./satellite.js";
export const geometryHash = (geometry) =>
  createHash("sha256")
    .update(JSON.stringify(geometry || null))
    .digest("hex");
const id = () => randomBytes(16).toString("hex");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const stamp = () => new Date().toISOString();
export async function createAnalysisService(
  db,
  {
    execute = fetchAnalysis,
    configured = () => satelliteStatus().configured,
    maxWorkMs = 230000,
  } = {},
) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,field_id TEXT NOT NULL,geometry_hash TEXT NOT NULL,snapshot TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,result TEXT,error TEXT);
    CREATE INDEX IF NOT EXISTS analysis_jobs_owner ON analysis_jobs(user_id,created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_active_field ON analysis_jobs(field_id) WHERE state IN ('queued','running');
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,job_id TEXT,field_id TEXT,created_at TEXT NOT NULL,read_at TEXT);
    CREATE INDEX IF NOT EXISTS notifications_owner ON notifications(user_id,created_at);
    CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,action TEXT NOT NULL,resource_id TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
  const controllers = new Map();
  let worker;
  const audit = (tx, row, action) =>
    tx
      .prepare("INSERT INTO audit_events VALUES(?,?,?,?,?)")
      .run(id(), row.user_id, action, row.id, stamp());
  const notify = (tx, row, type, title, message) =>
    tx
      .prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?,NULL)")
      .run(
        id(),
        row.user_id,
        type,
        title,
        message,
        row.id,
        row.field_id,
        stamp(),
      );
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
  async function ownerJob(userId, jobId) {
    const row = await db
      .prepare("SELECT * FROM analysis_jobs WHERE id=? AND user_id=?")
      .get(jobId, userId);
    if (!row) throw fail("Analiz kaydı bulunamadı.", 404);
    return row;
  }
  async function recover() {
    // Cold starts cannot interrupt another instance's active work. Only expired leases fail.
    await db.transaction(async (tx) => {
      const rows = await tx
        .prepare(
          "UPDATE analysis_jobs SET state='failed',finished_at=?,error=? WHERE state='running' AND (started_at IS NULL OR started_at<?) RETURNING *",
        )
        .all(
          stamp(),
          "İşlem süresi aşıldı veya sunucu kesildi. Yeniden deneyebilirsiniz.",
          new Date(Date.now() - 360000).toISOString(),
        );
      for (const row of rows) {
        await notify(
          tx,
          row,
          "analysis.failed",
          "Analiz yarıda kaldı",
          "İşlem süresi aşıldı; yeni sonuç oluşturulmadı.",
        );
        await audit(tx, row, "analysis.interrupted");
      }
    });
  }
  async function drain() {
    const deadline = Date.now() + maxWorkMs;
    await recover();
    while (Date.now() < deadline - 1000) {
      const row = await db.transaction(async (tx) => {
        const claimed = await tx
          .prepare(
            "UPDATE analysis_jobs SET state='running',started_at=? WHERE id=(SELECT id FROM analysis_jobs WHERE state='queued' ORDER BY created_at,id LIMIT 1) AND state='queued' RETURNING *",
          )
          .get(stamp());
        if (claimed) await audit(tx, claimed, "analysis.started");
        return claimed;
      });
      if (!row) break;
      const controller = new AbortController();
      controllers.set(row.id, controller);
      const timer = setTimeout(
        () =>
          controller.abort(
            fail("Analiz işlem süresi aşıldı. Yeniden deneyebilirsiniz.", 504),
          ),
        Math.max(1, deadline - Date.now()),
      );
      try {
        const snapshot = JSON.parse(row.snapshot);
        const analysis = await execute(snapshot.field.geometry, {
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
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
        await db.transaction(async (tx) => {
          // Geometry, cancellation, result cache and history change atomically.
          const current = await tx
            .prepare(
              "SELECT body FROM records WHERE id=? AND user_id=? AND kind='field'" +
                tx.lock,
            )
            .get(row.field_id, row.user_id);
          const running = await tx
            .prepare("SELECT state FROM analysis_jobs WHERE id=?" + tx.lock)
            .get(row.id);
          if (running?.state !== "running") return;
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
          const serialized = JSON.stringify({ ...analysis, historyId: row.id });
          await tx
            .prepare(
              "INSERT INTO analyses(field_id,geometry_hash,body) VALUES(?,?,?) ON CONFLICT(field_id) DO UPDATE SET geometry_hash=excluded.geometry_hash,body=excluded.body",
            )
            .run(row.field_id, row.geometry_hash, serialized);
          await tx
            .prepare(
              "UPDATE analysis_jobs SET state='completed',finished_at=?,result=? WHERE id=? AND state='running'",
            )
            .run(stamp(), serialized, row.id);
          await notify(
            tx,
            row,
            "analysis.completed",
            "Analiz tamamlandı",
            `${snapshot.field.name} için gerçek uydu analiz sonuçları hazır.`,
          );
          await audit(tx, row, "analysis.completed");
        });
      } catch (error) {
        const message = error.status
          ? error.message
          : "Analiz tamamlanamadı. Mevcut sonuçlar korunuyor; tekrar deneyebilirsiniz.";
        await db.transaction(async (tx) => {
          const failed = await tx
            .prepare(
              "UPDATE analysis_jobs SET state='failed',finished_at=?,error=? WHERE id=? AND state='running' RETURNING id",
            )
            .get(stamp(), message, row.id);
          if (failed) {
            await notify(
              tx,
              row,
              "analysis.failed",
              "Analiz tamamlanamadı",
              message,
            );
            await audit(tx, row, "analysis.failed");
          }
        });
      } finally {
        clearTimeout(timer);
        controllers.delete(row.id);
      }
    }
  }
  const service = {
    start() {
      if (!worker)
        worker = drain().finally(() => {
          worker = null;
        });
      return worker;
    },
    async enqueue(userId, fieldId) {
      return db.transaction(async (tx) => {
        if (tx.dialect === "postgres")
          await tx
            .prepare("SELECT id FROM users WHERE id=? FOR UPDATE")
            .get(userId);
        const owned = await tx
          .prepare(
            "SELECT body FROM records WHERE id=? AND user_id=? AND kind='field'" +
              tx.lock,
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
        const duplicate = await tx
          .prepare(
            "SELECT * FROM analysis_jobs WHERE field_id=? AND user_id=? AND state IN ('queued','running')",
          )
          .get(fieldId, userId);
        if (duplicate) return publicJob(duplicate);
        const count = await tx
          .prepare(
            "SELECT COUNT(*) AS n FROM analysis_jobs WHERE user_id=? AND state IN ('queued','running')",
          )
          .get(userId);
        if (Number(count.n) >= 10)
          throw fail(
            "En fazla 10 analiz bekleyebilir. Mevcut işlemleri tamamlayın veya iptal edin.",
            429,
          );
        const row = await tx
          .prepare(
            "INSERT INTO analysis_jobs(id,user_id,field_id,geometry_hash,snapshot,state,created_at) VALUES(?,?,?,?,?,'queued',?) RETURNING *",
          )
          .get(
            id(),
            userId,
            fieldId,
            geometryHash(field.geometry),
            JSON.stringify({ field: { ...field, id: fieldId } }),
            stamp(),
          );
        await audit(tx, row, "analysis.queued");
        return publicJob(row);
      });
    },
    async get(userId, jobId) {
      return publicJob(await ownerJob(userId, jobId), true);
    },
    async list(userId, fieldId) {
      const rows = fieldId
        ? await db
            .prepare(
              "SELECT * FROM analysis_jobs WHERE user_id=? AND field_id=? ORDER BY created_at DESC,id DESC LIMIT 200",
            )
            .all(userId, fieldId)
        : await db
            .prepare(
              "SELECT * FROM analysis_jobs WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 200",
            )
            .all(userId);
      return rows.map((row) => publicJob(row));
    },
    async cancel(userId, jobId) {
      const row = await ownerJob(userId, jobId);
      await db.transaction(async (tx) => {
        const canceled = await tx
          .prepare(
            "UPDATE analysis_jobs SET state='canceled',finished_at=? WHERE id=? AND user_id=? AND state IN ('queued','running') RETURNING id",
          )
          .get(stamp(), jobId, userId);
        if (!canceled) throw fail("Bu işlem artık iptal edilemez.", 409);
        await notify(
          tx,
          row,
          "analysis.canceled",
          "Analiz iptal edildi",
          "İşlem kullanıcı tarafından iptal edildi; yeni sonuç kaydedilmedi.",
        );
        await audit(tx, row, "analysis.canceled");
      });
      controllers.get(row.id)?.abort();
      return publicJob(await ownerJob(userId, jobId));
    },
    waitForIdle() {
      return worker || service.start();
    },
    async routes({ req, session, body, reply }) {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/analyses" && req.method === "GET") {
        reply(200, {
          jobs: await service.list(session.id, url.searchParams.get("fieldId")),
          limit: 200,
        });
        return true;
      }
      const match = url.pathname.match(
        /^\/api\/analyses\/([a-f0-9]{32})(\/cancel)?$/,
      );
      if (match) {
        try {
          if (req.method === "GET" && !match[2])
            reply(200, { job: await service.get(session.id, match[1]) });
          else if (req.method === "POST" && match[2])
            reply(200, { job: await service.cancel(session.id, match[1]) });
          else reply(405, { error: "Bu işlem desteklenmiyor." });
        } catch (error) {
          reply(error.status || 500, {
            error: error.status ? error.message : "Analiz kaydı alınamadı.",
          });
        }
        return true;
      }
      if (url.pathname === "/api/notifications" && req.method === "GET") {
        reply(200, {
          notifications: await db
            .prepare(
              'SELECT id,type,title,message,job_id AS "jobId",field_id AS "fieldId",created_at AS "createdAt",read_at AS "readAt" FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 200',
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
        await db.transaction(async (tx) => {
          for (const notificationId of body.ids)
            await tx
              .prepare(
                "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",
              )
              .run(stamp(), notificationId, session.id);
        });
        reply(200, { ok: true });
        return true;
      }
      return false;
    },
  };
  return service;
}

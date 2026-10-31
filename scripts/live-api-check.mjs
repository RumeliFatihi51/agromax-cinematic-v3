// Executes one authorized real analysis for the user's existing parcel through
// the application API. No fixture user, parcel or session is created.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
const db = new DatabaseSync("data/agromax.sqlite");
const row = db
  .prepare(
    "SELECT r.id,r.body,s.token FROM records r JOIN sessions s ON s.user_id=r.user_id WHERE r.kind='field' AND s.expires>? ORDER BY s.expires DESC",
  )
  .all(Date.now())
  .find((r) => {
    const f = JSON.parse(r.body);
    return !f.deletedAt && f.geometry;
  });
db.close();
if (!row)
  throw new Error(
    "No active owner session and existing parcel. No account or session was created.",
  );
async function request(path, body) {
  const response = await fetch(`http://127.0.0.1:5173/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session=${row.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `Application HTTP ${response.status}: ${data.error || "Request failed"}`,
    );
  return { data, status: response.status };
}
const started = await request(`records/${row.id}/analysis`, {});
let analysis = started.data.analysis,
  job = started.data.job;
console.log(
  JSON.stringify({
    phase: "application-analysis",
    status: started.status,
    fieldId: row.id,
    jobId: job?.id || null,
    cached: !!analysis,
  }),
);
while (job && ["queued", "running"].includes(job.state)) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  job = (await request(`analyses/${job.id}`)).data.job;
}
if (job) {
  assert.equal(job.state, "completed", job.error);
  analysis = job.analysis;
}
assert.ok(analysis?.source);
assert.ok(analysis.observations.length);
assert.ok(analysis.scenes.length);
const jobs = (await request("analyses")).data.jobs;
const notifications = (await request("notifications")).data.notifications;
assert.ok(
  jobs.some((j) => j.id === analysis.historyId && j.state === "completed"),
);
assert.ok(
  notifications.some(
    (n) => n.jobId === analysis.historyId && n.type === "analysis.completed",
  ),
);
const clear = analysis.observations
  .filter((o) => o.stats.NDVI?.coverage >= 0.7)
  .at(-1);
const scene = analysis.scenes.find(
  (s) =>
    Date.parse(s.properties?.datetime) >= Date.parse(clear.from) &&
    Date.parse(s.properties?.datetime) < Date.parse(clear.to),
);
const date = scene.properties.datetime.slice(0, 10);
const image = await fetch(`http://127.0.0.1:5173/api/records/${row.id}/image`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: `session=${row.token}`,
  },
  body: JSON.stringify({ date, layer: "NDMI", analysisId: analysis.historyId }),
});
if (!image.ok)
  throw new Error(`Image HTTP ${image.status}: ${(await image.json()).error}`);
const png = Buffer.from(await image.arrayBuffer());
assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.ok(Number(image.headers.get("X-Valid-Pixels")) > 0);
const legend = JSON.parse(
  decodeURIComponent(image.headers.get("X-Image-Legend")),
);
assert.ok(Number.isFinite(legend.min));
const evidence = {
  checkedAt: new Date().toISOString(),
  fieldId: row.id,
  jobId: analysis.historyId,
  state: job?.state || "cached-completed",
  source: analysis.source,
  method: analysis.method,
  scenes: analysis.scenes.length,
  intervals: analysis.observations.length,
  metrics: analysis.availableMetrics.length,
  notificationLinked: true,
  image: {
    date,
    layer: "NDMI",
    bytes: png.length,
    validPixels: Number(image.headers.get("X-Valid-Pixels")),
    legend,
  },
};
writeFileSync(
  "data/verification/application-evidence.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence));

// Read-only provider verification against an existing, user-created parcel.
// Credentials and access tokens are never printed or written to evidence files.
import { DatabaseSync } from "node:sqlite";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  fetchAnalysis,
  fetchImage,
  satelliteStatus,
} from "../server/satellite.js";
const db = new DatabaseSync("data/agromax.sqlite");
const row = db
  .prepare("SELECT id,body FROM records WHERE kind='field'")
  .all()
  .find((r) => {
    const f = JSON.parse(r.body);
    return !f.deletedAt && f.geometry;
  });
if (!row)
  throw new Error(
    "No existing user geometry available; no test parcel was created.",
  );
const field = JSON.parse(row.body);
mkdirSync("data/verification", { recursive: true });
console.log(
  JSON.stringify({
    phase: "provider-analysis",
    configured: satelliteStatus().configured,
    fieldId: row.id,
  }),
);
try {
  const analysis = await fetchAnalysis(field.geometry);
  writeFileSync(
    "data/verification/live-analysis.json",
    JSON.stringify(analysis),
  );
  const evidence = {
    checkedAt: new Date().toISOString(),
    fieldId: row.id,
    provider: analysis.provider,
    source: analysis.source,
    range: analysis.range,
    scenes: analysis.scenes.length,
    intervals: analysis.observations.length,
    validNdviIntervals: analysis.observations.filter((o) => o.stats.NDVI)
      .length,
    comparison: analysis.comparison.NDVI,
  };
  console.log(JSON.stringify(evidence));
  const clearInterval = analysis.observations
    .filter((o) => o.stats.NDVI?.coverage >= 0.7)
    .at(-1);
  const scene =
    clearInterval &&
    analysis.scenes.find(
      (s) =>
        Date.parse(s.properties?.datetime) >= Date.parse(clearInterval.from) &&
        Date.parse(s.properties?.datetime) < Date.parse(clearInterval.to),
    );
  if (scene) {
    const date = scene.properties.datetime.slice(0, 10);
    const { image, validPixels, totalPixels } = await fetchImage(
      field.geometry,
      date,
      "RGB",
    );
    writeFileSync("data/verification/live-rgb.png", image);
    evidence.image = {
      date,
      bytes: image.length,
      validPixels,
      totalPixels,
      pngSignature: image.subarray(0, 8).toString("hex"),
    };
    console.log(JSON.stringify({ phase: "provider-image", ...evidence.image }));
  }
  writeFileSync(
    "data/verification/copernicus-evidence.json",
    JSON.stringify(evidence, null, 2),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      phase: "provider-error",
      status: e.status || null,
      message: e.message,
      providerStatus: e.providerStatus,
      providerCode: e.providerCode,
      providerDetail: e.providerDetail,
    }),
  );
  process.exitCode = 1;
} finally {
  db.close();
}

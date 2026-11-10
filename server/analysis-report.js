import { readPublicObservation } from "./public-observations.js";

export async function enrichAnalysis(analysis, geometry, signal) {
  const extra = await Promise.all(["radar", "landsat"].map(async kind => {
    try {
      return [kind, await readPublicObservation(kind, geometry, analysis.range, signal)];
    } catch {
      return [kind, { state: "unavailable", source: kind === "radar" ? "Sentinel-1 RTC" : "Landsat 8/9 L2" }];
    }
  }));
  const supplementary = Object.fromEntries(extra);
  const measurements = Object.fromEntries(Object.entries(analysis.comparison).flatMap(([id, periods]) => {
    if (!periods.current && !periods.previous) return [];
    return [["Sentinel-2 " + id, { current: periods.current, previous: periods.previous, delta: periods.delta }]];
  }));
  let interpretation;
  try {
    const { interpretSatelliteEvidence } = await import("../commercial/assistant/model.ts");
    const model = await interpretSatelliteEvidence({
      opticalSource: analysis.source, period: analysis.range, coverageThreshold: analysis.minimumCoverage,
      opticalDates: analysis.scenes.map(scene => scene.properties?.datetime).filter(Boolean),
      measurements, supplementary,
    }, signal);
    if (model) {
      const validIds = new Set([...Object.keys(measurements), ...Object.entries(supplementary).flatMap(([kind, source]) =>
        Object.keys(source.metrics || {}).map(id => (kind === "radar" ? "Sentinel-1 " : "Landsat " ) + id))]);
      interpretation = { ...model, findings: model.findings.filter(item =>
        item.indicators.every(id => validIds.has(id))) };
    }
  } catch {
    // Measurements remain usable when the model service is unavailable.
  }
  return { supplementary, interpretation };
}

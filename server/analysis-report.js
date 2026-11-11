import { readPublicObservation } from "./public-observations.js";
const supplementarySources = {
  radar: "Sentinel-1", landsat: "Landsat", hlsL30: "HLS L30", hlsS30: "HLS S30",
};

export async function enrichAnalysis(analysis, geometry, signal) {
  const extra = await Promise.all(Object.entries(supplementarySources).map(async ([kind, source]) => {
    try {
      return [kind, await readPublicObservation(kind, geometry, analysis.range, signal)];
    } catch (error) {
      return [kind, { state: error.status === 429 ? "rate_limited" : "unavailable", source }];
    }
  }));
  const supplementary = Object.fromEntries(extra);
  const measurements = Object.fromEntries(Object.entries(analysis.comparison).flatMap(([id, periods]) => {
    if (!periods.current && !periods.previous) return [];
    const period = stats => stats && { mean: stats.mean, observations: stats.observations, coverage: stats.meanCoverage };
    return [["Sentinel-2 " + id, { current: period(periods.current), previous: period(periods.previous), delta: periods.delta }]];
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
        Object.keys(source.metrics || {}).map(id => supplementarySources[kind] + " " + id))]);
      interpretation = { ...model, findings: model.findings.filter(item =>
        item.indicators.every(id => validIds.has(id))) };
    }
  } catch (error) {
    console.warn("Satellite interpretation unavailable", { error: error?.name, status: error?.statusCode });
    // Measurements remain usable when the model service is unavailable.
  }
  return { supplementary, interpretation };
}

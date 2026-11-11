import type { ReportSnapshot } from "./service";

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const literal = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + literal.replaceAll('"', '""') + '"';
}

export function reportCsv(snapshot: ReportSnapshot) {
  const rows: unknown[][] = [[
    "kind", "parcel_id", "geometry_version", "analysis_id", "source", "method",
    "from", "to", "metric", "mean", "min", "max", "coverage", "record_id", "record_version", "record_data", "unit",
  ]];
  const common = [snapshot.field.id, snapshot.geometryVersion, snapshot.analysisId,
    snapshot.analysis.source, snapshot.analysis.method];
  rows.push(["analysis", ...common, snapshot.analysis.range.from, snapshot.analysis.range.to]);
  for (const day of snapshot.analysis.observations)
    for (const [metric, stat] of Object.entries(day.stats))
      rows.push(["observation", ...common, day.from, day.to, metric,
        stat?.mean, stat?.min, stat?.max, stat?.coverage]);
  for (const source of Object.values(snapshot.analysis.report?.supplementary || {}))
    for (const [metric, stat] of Object.entries(source.metrics || {}))
      rows.push(["supplementary", ...common.slice(0, 3), source.source, source.method,
        source.date, "", metric, stat.mean, stat.min, stat.max, stat.coverage, source.sceneId, "", "", stat.unit]);
  for (const record of snapshot.records)
    rows.push([record.kind, ...common, "", "", "", "", "", "", "", record.id, record.version, record.data]);
  return "\uFEFF" + rows.map(row =>
    Array.from({length: rows[0]!.length}, (_, i) => csvCell(row[i])).join(",")).join("\r\n") + "\r\n";
}

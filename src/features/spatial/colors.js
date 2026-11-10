const vegetation = [[130, 74, 50], [230, 197, 119], [54, 130, 72]];
const moisture = [[145, 80, 50], [230, 219, 171], [32, 121, 154]];
const change = [[161, 63, 48], [234, 230, 208], [38, 120, 150]];
const normalized = new Set(["NDVI", "GNDVI", "NDRE", "NDRE2", "NDRE3", "NDMI", "NDWI", "NBR", "WDRVI", "NDSI"]);

export function colorScale(raster, comparison, difference = false) {
  const palette = difference ? change : ["NDMI", "NDWI", "NDSI"].includes(raster.metric) ? moisture : vegetation;
  const data = [...raster.values, ...(comparison?.values || [])].filter(Number.isFinite);
  let min = data.length ? Math.min(...data) : 0;
  let max = data.length ? Math.max(...data) : 0;
  if (difference) {
    const limit = Math.max(Math.abs(min), Math.abs(max), 0.000001);
    min = -limit;
    max = limit;
  } else if (normalized.has(raster.metric)) {
    min = Math.min(-1, min);
    max = Math.max(1, max);
  }
  return { min, max, palette };
}

export function colorFor(value, scale) {
  const { min, max, palette } = scale;
  const t = min === max ? 0.5 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const interval = t < 0.5 ? 0 : 1;
  return palette[interval].map((start, channel) =>
    Math.round(start + (palette[interval + 1][channel] - start) * (t * 2 - interval)));
}

export const rgb = (channels) => "rgb(" + channels.join(",") + ")";

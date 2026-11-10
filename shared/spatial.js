// Spherical Web Mercator, matching XYZ tiles and the analysis raster grid.
export const mercatorRadius = 6378137;
export const worldWidth = 2 * Math.PI * mercatorRadius;

export function project([longitude, latitude]) {
  return [longitude * worldWidth / 360,
    mercatorRadius * Math.asinh(Math.tan(latitude * Math.PI / 180))];
}

export function unproject([x, y]) {
  return [x * 360 / worldWidth,
    Math.atan(Math.sinh(y / mercatorRadius)) * 180 / Math.PI];
}

export function polygons(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

export function geometryBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of polygons(geometry).flat(2)) {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }
  return bounds;
}

export function metricFrame(geometry) {
  const [west, south, east, north] = geometryBounds(geometry);
  const bounds = [...project([west, south]), ...project([east, north])];
  const x = (bounds[0] + bounds[2]) / 2;
  const y = (bounds[1] + bounds[3]) / 2;
  const ground = Math.cos(unproject([x, y])[1] * Math.PI / 180);
  const width = (bounds[2] - bounds[0]) * ground;
  const depth = (bounds[3] - bounds[1]) * ground;
  return {
    bounds, center: unproject([x, y]), width, depth, ground,
    span: Math.max(width, depth),
    local: (point) => {
      const [px, py] = project(point);
      return [(px - x) * ground, (y - py) * ground];
    },
    coordinate: (east, south) => unproject([x + east / ground, y - south / ground]),
  };
}

export function rasterGrid(geometry, sourceMeters) {
  const { bounds, width, depth, ground } = metricFrame(geometry);
  const minimumGroundScale = Math.cos(Math.max(
    ...[bounds[1], bounds[3]].map(y => Math.abs(unproject([0, y])[1])),
  ) * Math.PI / 180);
  const spacing = Math.max(sourceMeters * ground / minimumGroundScale, width / 96, depth / 96);
  const columns = Math.max(1, Math.floor(width / spacing));
  const rows = Math.max(1, Math.floor(depth / spacing));
  // Expand sub-pixel axes instead of claiming sub-native ground resolution.
  const xPad = Math.max(0, spacing / ground - (bounds[2] - bounds[0])) / 2;
  const yPad = Math.max(0, spacing / ground - (bounds[3] - bounds[1])) / 2;
  return {
    crs: "EPSG:3857",
    bounds: [bounds[0] - xPad, bounds[1] - yPad, bounds[2] + xPad, bounds[3] + yPad],
    width: columns,
    height: rows,
    resolution: [Math.max(width, spacing) / columns, Math.max(depth, spacing) / rows],
    sourceMeters,
  };
}

export function pixelBounds(grid, index) {
  const [west, south, east, north] = grid.bounds;
  const dx = (east - west) / grid.width, dy = (north - south) / grid.height;
  const x = west + (index % grid.width) * dx;
  const y = north - Math.floor(index / grid.width) * dy;
  return [x, y - dy, x + dx, y];
}

export function pixelIndex(grid, coordinate) {
  const [x, y] = project(coordinate);
  const [west, south, east, north] = grid.bounds;
  const column = Math.floor((x - west) / (east - west) * grid.width);
  const row = Math.floor((north - y) / (north - south) * grid.height);
  return column >= 0 && column < grid.width && row >= 0 && row < grid.height
    ? row * grid.width + column : -1;
}

export function compareRasters(newer, earlier) {
  if (newer.metric !== earlier.metric || newer.unit !== earlier.unit ||
      newer.provider !== earlier.provider || newer.method !== earlier.method ||
      newer.geometryHash !== earlier.geometryHash ||
      newer.width !== earlier.width || newer.height !== earlier.height ||
      newer.bounds.some((value, index) => value !== earlier.bounds[index])) return null;
  return { ...newer, values: newer.values.map((value, index) =>
    Number.isFinite(value) && Number.isFinite(earlier.values[index])
      ? value - earlier.values[index] : null) };
}

export function containsPoint(geometry, [x, y]) {
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax)
        inside = !inside;
    }
    return inside;
  };
  return polygons(geometry).some(([outer, ...holes]) =>
    inRing(outer) && !holes.some(inRing));
}

export function changeOutliers(difference) {
  const samples = difference.values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (samples.length < 16) return null;
  const median = sorted => (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
  const center = median(samples);
  const mad = median(samples.map(value => Math.abs(value - center)).sort((a, b) => a - b));
  if (mad < 0.000001) return null;
  return {
    ...difference, method: difference.method,
    screen: { method: "spatial-delta-mad-v1", center, mad, samples: samples.length, cutoff: 3.5 },
    values: difference.values.map(value =>
      Number.isFinite(value) && Math.abs(0.67448975 * (value - center) / mad) >= 3.5 ? value : null),
  };
}

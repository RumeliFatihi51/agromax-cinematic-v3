import { project, worldWidth } from "../../../shared/spatial";

export const terrainTiles = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const terrainAttribution = '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen Terrain Tiles · kaynaklar ve lisanslar</a>';

export async function loadTerrain(frame, signal) {
  const padding = frame.span * 0.36;
  const northwest = project(frame.coordinate(-frame.width / 2 - padding, -frame.depth / 2 - padding));
  const southeast = project(frame.coordinate(frame.width / 2 + padding, frame.depth / 2 + padding));
  const pixel = ([x, y], zoom) => {
    const size = 256 * 2 ** zoom;
    return [(x / worldWidth + 0.5) * size, (0.5 - y / worldWidth) * size];
  };
  let zoom = 13, tiles;
  for (; zoom >= 0; zoom--) {
    const [left, top] = pixel(northwest, zoom).map(x => Math.floor(x / 256));
    const [right, bottom] = pixel(southeast, zoom).map(x => Math.floor((x + 1) / 256));
    if ((right - left + 1) * (bottom - top + 1) > 12) continue;
    tiles = [];
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) tiles.push([x, y]);
    break;
  }
  const side = 2 ** zoom;
  const images = new Map(await Promise.all(tiles.map(async ([x, y]) => {
    if (y < 0 || y >= side) return [`${x}/${y}`, null];
    const response = await fetch(terrainTiles.replace("{z}", zoom)
      .replace("{x}", (x + side) % side).replace("{y}", y), { signal });
    if (!response.ok) throw new Error("Yükseklik döşemesi alınamadı.");
    const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none" });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      return [`${x}/${y}`, {
        pixels: ctx.getImageData(0, 0, 256, 256).data,
        source: response.headers.get("x-amz-meta-x-imagery-sources")?.split("/")[0] || null,
      }];
    } finally {
      bitmap.close();
    }
  })));
  const resolution = worldWidth * frame.ground / (256 * side);
  const elevation = (x, y) => {
    const tile = images.get(`${Math.floor(x / 256)}/${Math.floor(y / 256)}`)?.pixels;
    if (!tile) return null;
    const index = (((y % 256 + 256) % 256) * 256 + (x % 256 + 256) % 256) * 4;
    return tile[index] * 256 + tile[index + 1] + tile[index + 2] / 256 - 32768;
  };
  const sample = (east, south) => {
    const [px, py] = pixel(project(frame.coordinate(east, south)), zoom).map(value => value - 0.5);
    const x = Math.floor(px), y = Math.floor(py), dx = px - x, dy = py - y;
    const heights = [elevation(x, y), elevation(x + 1, y), elevation(x, y + 1), elevation(x + 1, y + 1)];
    if (!heights.every(Number.isFinite)) return elevation(Math.round(px), Math.round(py));
    return (heights[0] * (1 - dx) + heights[1] * dx) * (1 - dy) +
      (heights[2] * (1 - dx) + heights[3] * dx) * dy;
  };
  const sources = [...new Set([...images.values()].map(image => image?.source).filter(Boolean))];
  return { sample, resolution, sources, reference: sample(0, 0) };
}

export function slopeAspect(terrain, east, south) {
  const step = terrain.resolution;
  const values = [
    terrain.sample(east - step, south), terrain.sample(east + step, south),
    terrain.sample(east, south - step), terrain.sample(east, south + step),
  ];
  if (!values.every(Number.isFinite)) return null;
  const dx = (values[1] - values[0]) / (step * 2);
  const dz = (values[3] - values[2]) / (step * 2);
  const slope = Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  return { slope, aspect: slope > 0.1 ? (Math.atan2(-dx, dz) * 180 / Math.PI + 360) % 360 : null };
}

import area from "@turf/area";
import clipping from "polygon-clipping";
import { containsPoint, pixelBounds, polygons, project, unproject } from "./spatial.js";

const toGeometry = projected => ({
  type: "MultiPolygon",
  coordinates: projected.map(polygon => polygon.map(ring => ring.map(unproject))),
});

function boundaryCells(grid, rings) {
  const [west, south, east, north] = grid.bounds;
  const cells = new Set();
  const x = value => Math.min(grid.width - 1, Math.max(0, Math.floor((value - west) / (east - west) * grid.width)));
  const y = value => Math.min(grid.height - 1, Math.max(0, Math.floor((north - value) / (north - south) * grid.height)));
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
      const left = x(Math.min(ax, bx)), right = x(Math.max(ax, bx));
      const top = y(Math.max(ay, by)), bottom = y(Math.min(ay, by));
      for (let row = top; row <= bottom; row++)
        for (let column = left; column <= right; column++) cells.add(row * grid.width + column);
    }
  }
  return cells;
}

export function parcelFootprints(grid, geometry) {
  const parcel = polygons(geometry).map(polygon => polygon.map(ring => ring.map(project)));
  const edgeCells = boundaryCells(grid, parcel.flat());
  return function footprint(index) {
    if (!Number.isInteger(index) || index < 0 || index >= grid.width * grid.height) return null;
    const [west, south, east, north] = pixelBounds(grid, index);
    const coordinate = unproject([(west + east) / 2, (south + north) / 2]);
    const ring = [[west, south], [east, south], [east, north], [west, north], [west, south]];
    const clipped = edgeCells.has(index) ? clipping.intersection([ring], parcel)
      : containsPoint(geometry, coordinate) ? [[ring]] : [];
    if (!clipped.length) return null;
    const shape = toGeometry(clipped);
    const squareMeters = area(shape);
    return squareMeters > 0 ? { geometry: shape, projected: clipped, coordinate, squareMeters } : null;
  };
}

export function measuredCells(raster, geometry) {
  const footprint = parcelFootprints(raster, geometry);
  return raster.values.map((value, index) => Number.isFinite(value) ? footprint(index) : null);
}

export function summarizeFootprints(raster, cells, min, max, count = 8) {
  const buckets = Array(count).fill(0);
  let covered = 0;
  for (const [index, cell] of cells.entries()) {
    if (!cell) continue;
    const value = raster.values[index];
    const position = max > min ? Math.floor((value - min) / (max - min) * count) : Math.floor(count / 2);
    buckets[Math.max(0, Math.min(count - 1, position))] += cell.squareMeters;
    covered += cell.squareMeters;
  }
  return { buckets, covered };
}

const tolerance = 1e-7;

function edgeIntervals(ring, axis, boundary) {
  const intervals = [];
  for (let i = 1; i < ring.length; i++) {
    const start = ring[i - 1], end = ring[i];
    if (Math.abs(start[axis] - boundary) > tolerance || Math.abs(end[axis] - boundary) > tolerance) continue;
    const a = start[1 - axis], b = end[1 - axis];
    intervals.push([Math.min(a, b), Math.max(a, b)]);
  }
  return intervals;
}

function sharesEdge(left, right) {
  return left.some(([start, end]) => right.some(([otherStart, otherEnd]) =>
    Math.min(end, otherEnd) - Math.max(start, otherStart) > tolerance));
}

export function groupOutlierFootprints(raster, cells) {
  const result = [];
  const side = index => raster.values[index] < raster.screen.center ? "low" : "high";
  const pieces = cells.map((cell, index) => {
    if (!cell) return [];
    const [west, south, east, north] = pixelBounds(raster, index);
    return cell.projected.map((polygon, part) => ({
      index, id: `${index}-${part}`, polygon, visited: false,
      squareMeters: cell.projected.length === 1 ? cell.squareMeters : area(toGeometry([polygon])),
      edges: [
        edgeIntervals(polygon[0], 1, north), edgeIntervals(polygon[0], 1, south),
        edgeIntervals(polygon[0], 0, west), edgeIntervals(polygon[0], 0, east),
      ],
    }));
  });
  for (const seed of pieces.flat()) {
    if (seed.visited) continue;
    const direction = side(seed.index), group = [seed], cellIndices = new Set();
    seed.visited = true;
    let squareMeters = 0, weightedValue = 0;
    for (let cursor = 0; cursor < group.length; cursor++) {
      const piece = group[cursor], { index } = piece;
      const column = index % raster.width;
      cellIndices.add(index);
      squareMeters += piece.squareMeters;
      weightedValue += raster.values[index] * piece.squareMeters;
      const neighbors = [index - raster.width, index + raster.width,
        column > 0 ? index - 1 : -1, column < raster.width - 1 ? index + 1 : -1];
      for (const [edge, neighbor] of neighbors.entries()) {
        if (!pieces[neighbor]?.length || side(neighbor) !== direction) continue;
        for (const candidate of pieces[neighbor]) {
          if (candidate.visited || !sharesEdge(piece.edges[edge], candidate.edges[edge ^ 1])) continue;
          candidate.visited = true;
          group.push(candidate);
        }
      }
    }
    result.push({ id: seed.id, seed: seed.index, direction, group, squareMeters,
      cellCount: cellIndices.size, mean: weightedValue / squareMeters });
  }
  return result.sort((a, b) => b.squareMeters - a.squareMeters || a.seed - b.seed);
}

export function mergeRegion(region) {
  return toGeometry(clipping.union(...region.group.map(piece => piece.polygon)));
}

import { GeoJsonLayer } from "@deck.gl/layers";
export { MapLibreOverlay } from "@deck.gl/maplibre";
import { parcelFootprints } from "../../../shared/raster-footprints";
import { colorFor } from "./colors";

export function makeColumns(raster, geometry, scale, span, opacity, onPoint) {
  const footprint = parcelFootprints(raster, geometry);
  const features = [];
  for (const [index, value] of raster.values.entries()) {
    if (!Number.isFinite(value)) continue;
    const cell = footprint(index);
    if (!cell) continue;
    features.push({ type: "Feature", geometry: cell.geometry,
      properties: { value, coordinate: cell.coordinate, squareMeters: cell.squareMeters } });
  }
  return new GeoJsonLayer({
    id: "agromax-spatial-columns",
    data: { type: "FeatureCollection", features },
    extruded: true, filled: true, stroked: false, pickable: true, opacity,
    getFillColor: feature => colorFor(feature.properties.value, scale),
    getElevation: feature => span * 0.25 * (scale.min === scale.max ? 0.5 :
      Math.max(0.015, Math.min(1, (feature.properties.value - scale.min) / (scale.max - scale.min)))),
    material: { ambient: 0.68, diffuse: 0.5, shininess: 8 },
    onClick: ({ object }) => { if (object) onPoint(object.properties); },
  });
}

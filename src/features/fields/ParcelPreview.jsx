import { MapPin } from "lucide-react";
export default function ParcelPreview({ geometry }) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.coordinates;
  if (!polygons?.[0]?.[0]?.length)
    return (
      <span className="parcel-preview no-boundary">
        <MapPin size={19} />
      </span>
    );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const width = maxX - minX, height = maxY - minY;
  const scale = 34 / Math.max(width, height, 1e-9);
  const left = (48 - width * scale) / 2;
  const top = (48 + height * scale) / 2;
  const outline = polygons.map((polygon) => polygon.map((ring) =>
    "M" + ring.map(([x, y]) =>
      `${(left + (x - minX) * scale).toFixed(2)},${(top - (y - minY) * scale).toFixed(2)}`,
    ).join("L") + "Z",
  ).join("")).join("");
  return (
    <span className="parcel-preview">
      <svg viewBox="0 0 48 48" aria-label="Kayıtlı sınırın görünümü">
        <path className="parcel-outline" d={outline} fillRule="evenodd" />
      </svg>
    </span>
  );
}

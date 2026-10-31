import { MapPin } from "lucide-react";
export default function ParcelPreview({ geometry }) {
  if (!geometry)
    return (
      <span className="parcel-preview no-boundary">
        <MapPin size={19} />
      </span>
    );
  const ring =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.coordinates[0][0];
  const xs = ring.map((p) => p[0]),
    ys = ring.map((p) => p[1]),
    minX = Math.min(...xs),
    minY = Math.min(...ys),
    w = Math.max(...xs) - minX,
    h = Math.max(...ys) - minY,
    scale = 34 / Math.max(w, h, 1e-9);
  return (
    <span className="parcel-preview">
      <svg viewBox="0 0 48 48" aria-label="Kayıtlı sınırın görünümü">
        <polygon
          points={ring
            .map(
              ([x, y]) =>
                `${7 + (x - minX) * scale},${41 - (y - minY) * scale}`,
            )
            .join(" ")}
        />
      </svg>
    </span>
  );
}

import area from "@turf/area";
import booleanValid from "@turf/boolean-valid";
import kinks from "@turf/kinks";

export function validateGeometry(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type))
    throw new Error("Polygon veya MultiPolygon sınırı gerekli.");
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 30)
    throw new Error("Parsel geometrisi geçersiz.");
  let count = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length)
      throw new Error("Boş parsel kaydedilemez.");
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error("En az üç köşe ve kapalı bir sınır gerekli.");
      for (const point of ring) {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          !point.every(Number.isFinite) ||
          Math.abs(point[0]) > 180 ||
          Math.abs(point[1]) > 85
        )
          throw new Error(
            "Koordinatlar geçersiz veya desteklenen enlem dışında.",
          );
        if (++count > 2500)
          throw new Error("En fazla 2500 köşe destekleniyor.");
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
        throw new Error("Parsel sınırı kapalı olmalı.");
    }
  }
  if (!booleanValid(geometry) || kinks(geometry).features.length)
    throw new Error(
      "Sınır kendini kesiyor veya topolojik olarak geçersiz. Köşeleri düzeltin.",
    );
  const squareMeters = area(geometry);
  if (
    !Number.isFinite(squareMeters) ||
    squareMeters < 1 ||
    squareMeters > 100_000_000
  )
    throw new Error("Alan 1 m² ile 100 km² arasında olmalı.");
  const points = polygons.flat(2),
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs),
    spanY = Math.max(...ys) - Math.min(...ys);
  const bboxArea =
    spanX *
    spanY *
    111320 *
    110574 *
    Math.cos((((Math.max(...ys) + Math.min(...ys)) / 2) * Math.PI) / 180);
  if (spanX > 2 || spanY > 2 || bboxArea > 200_000_000)
    throw new Error(
      "Birbirinden uzak parçaları ayrı parseller olarak kaydedin; işlem sınırı 200 km² çevreleyen dikdörtgendir.",
    );
  return {
    geometry,
    area: squareMeters / 1000,
    areaSource: "geometry",
    crs: "EPSG:4326",
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    areaMethod: "WGS84 küresel geodezik yaklaşım; kadastro ölçümü değildir",
  };
}

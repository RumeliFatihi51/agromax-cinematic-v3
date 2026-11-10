import area from "@turf/area";
import clipping from "polygon-clipping";
import { validateGeometry } from "../shared/geometry.js";
import { polygons } from "../shared/spatial.js";

const areaOf = coordinates => coordinates.length
  ? area({ type: "MultiPolygon", coordinates }) : 0;

export function validateManagementZones(zones, fieldGeometry) {
  if (!zones?.length) return;
  if (!fieldGeometry) throw new Error("Yönetim bölgeleri için kayıtlı parsel sınırı gerekli.");
  const parcel = polygons(fieldGeometry);
  const accepted = [];
  let points = 0;
  for (const zone of zones) {
    validateGeometry(zone.geometry);
    const geometry = polygons(zone.geometry);
    points += geometry.flat(2).length;
    if (points > 3500) throw new Error("Yönetim bölgeleri toplamda en fazla 3500 köşe içerebilir.");
    if (areaOf(clipping.difference(geometry, parcel)) > 0.01)
      throw new Error(zone.name + " bölgesi parsel sınırının dışına taşıyor.");
    if (accepted.some(previous => areaOf(clipping.intersection(geometry, previous)) > 0.01))
      throw new Error(zone.name + " bölgesi başka bir yönetim bölgesiyle örtüşüyor.");
    accepted.push(geometry);
  }
}

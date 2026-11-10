import { useMemo, useState } from "react";
import { containsPoint } from "../../../shared/spatial";
import SpatialWorkbench from "./SpatialWorkbench";

export default function PrescriptionViewer({ records, ...props }) {
  const [recordId, setRecordId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const current = records.filter(record => record.payload.zones?.length &&
    record.fieldSnapshot.geometryHash === props.context.geometryHash);
  const record = current.find(item => item.id === recordId) || current[0];
  const zones = useMemo(() => record?.payload.zones.map((zone, index) => ({
    ...zone, id: record.id + ":" + index, contains: coordinate => containsPoint(zone.geometry, coordinate),
  })) || [], [record]);
  const unit = record?.payload.unit === "m3/ha" ? "m³/ha" : record?.payload.unit;
  const active = zones.find(zone => zone.id === zoneId);
  return <div className="spatial-prescriptions">
    <div className="spatial-control-deck">
      <label>Bölge planı<select value={record?.id || ""} disabled={!current.length} onChange={event => {
        setRecordId(event.target.value); setZoneId("");
      }}>
        {!current.length && <option value="">Kayıtlı bölge planı yok</option>}
        {current.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}
      </select></label>
      {record && <label>Yönetim bölgesi<select value={active?.id || ""} onChange={event => setZoneId(event.target.value)}>
        <option value="">Bütün bölgeler</option>
        {zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name} · {zone.rate} {unit}</option>)}
      </select></label>}
    </div>
    <SpatialWorkbench {...props} zones={zones} activeZone={active?.id} onZone={setZoneId}
      markerText={active ? active.name + " · " + active.rate.toLocaleString("tr-TR") + " " + unit + " · Kullanıcı taslağı"
        : zones.length ? zones.length + " kayıtlı bölge · Bir bölge seçerek uygulama oranını inceleyin."
        : "Bu sınır için yönetim bölgesi yok. Bir reçete taslağına bölge GeoJSON’u ekleyin."} />
  </div>;
}

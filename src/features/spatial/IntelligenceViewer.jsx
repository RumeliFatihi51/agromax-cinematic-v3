import { useEffect, useState } from "react";
import { api } from "../../api";
import SpatialWorkbench from "./SpatialWorkbench";

export default function IntelligenceViewer({ claimsEnabled, ...props }) {
  const [status, setStatus] = useState(null);
  const fieldId = props.field.id;
  useEffect(() => {
    if (!claimsEnabled) return;
    const controller = new AbortController();
    api("v1/fields/" + fieldId + "/claims", undefined, "GET", { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setStatus(data);
    }).catch(error => {
      if (!controller.signal.aborted) setStatus({ error: error.message });
    });
    return () => controller.abort();
  }, [claimsEnabled, fieldId]);
  const anomaly = status?.claims?.find(item => item.geometryVersion === status.geometryVersion &&
    item.evidence.anomaly);
  const markerText = anomaly ? [
    anomaly.metric + " · Kayıtlı parsel düzeyi sapması",
    anomaly.evidence.anomaly.date.slice(0, 10),
    anomaly.evidence.source,
    "Saha incelemesi önerilir. Sapmanın parsel içindeki konumu ölçülmedi.",
  ].join(" · ") : status?.error || "Doğrulanmış konumsal anomali katmanı bulunmuyor.";
  return <SpatialWorkbench {...props} markerText={markerText}
    highlight={!!anomaly} />;
}

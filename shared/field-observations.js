export const sensorMetrics = {
  soilMoisture: { label: "Hacimsel toprak nemi", unit: "% hacim", min: 0, max: 100 },
  soilTemperature: { label: "Toprak sıcaklığı", unit: "°C", min: -80, max: 90 },
  airTemperature: { label: "Hava sıcaklığı", unit: "°C", min: -90, max: 70 },
  waterFlow: { label: "Su debisi", unit: "m³/sa", min: 0, max: 100000 },
};

export const irrigationAssets = {
  valve: "Vana",
  hydrant: "Hidrant",
  pump: "Pompa",
  intake: "Su alma noktası",
};

export const observationStyles = {
  field: { label: "Saha gözlemi", color: "#ffc169" },
  sensor: { label: "Sensör noktası", color: "#88d9f5" },
  irrigation: { label: "Sulama altyapısı", color: "#9ae1b3" },
};

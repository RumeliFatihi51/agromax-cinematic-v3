export const openSentinelSource = "Sentinel-2 L2A · Earth Search";
export const openSentinelProvider = "earth-search";
export const openSentinelMethod = "s2-c1-cog-scl-v1";

export const openSentinelMetrics = [
  { id: "NDVI", label: "Bitki canlılığı", bands: ["nir", "red"] },
  { id: "NDRE", label: "Kırmızı kenar indeksi", bands: ["nir08", "rededge1"] },
  { id: "NDMI", label: "Nem göstergesi", bands: ["nir", "swir16"] },
  { id: "NDWI", label: "Yüzey suyu göstergesi", bands: ["green", "nir"] },
  { id: "EVI", label: "Geliştirilmiş bitki indeksi", bands: ["nir", "red", "blue"] },
  { id: "WDRVI", label: "Geniş dinamik aralıklı bitki indeksi (α 0,1)", bands: ["nir", "red"] },
];

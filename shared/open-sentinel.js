import { indices, bands } from "./metrics.js";
export const openSentinelSource = "Sentinel-2 L2A · Earth Search";
export const openSentinelProvider = "earth-search";
export const openSentinelMethod = "s2-c1-cog-scl-v1";

export const openSentinelBands = {
  B01: "coastal", B02: "blue", B03: "green", B04: "red", B05: "rededge1",
  B06: "rededge2", B07: "rededge3", B08: "nir", B8A: "nir08",
  B09: "nir09", B11: "swir16", B12: "swir22",
};
export const openSentinelMetrics = [...indices, ...bands];

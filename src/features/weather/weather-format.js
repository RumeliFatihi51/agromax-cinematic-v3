import {
  Cloud,
  CloudRain,
  CloudSun,
  CloudMoon,
  Snowflake,
  Sun,
  Moon,
} from "lucide-react";
export const labels = {
  air_temperature: "Hava sıcaklığı",
  apparent_air_temperature: "Hissedilen sıcaklık",
  air_temperature_min: "Dönemin en düşük sıcaklığı",
  air_temperature_max: "Dönemin en yüksek sıcaklığı",
  relative_humidity: "Bağıl nem",
  dew_point_temperature: "Çiy noktası",
  wind_speed: "Rüzgâr hızı",
  wind_speed_of_gust: "Rüzgâr hamlesi",
  wind_from_direction: "Rüzgârın geldiği yön",
  air_pressure_at_sea_level: "Deniz seviyesine indirgenmiş basınç",
  cloud_area_fraction: "Toplam bulutluluk",
  cloud_area_fraction_high: "Yüksek bulutluluk",
  cloud_area_fraction_medium: "Orta bulutluluk",
  cloud_area_fraction_low: "Alçak bulutluluk",
  fog_area_fraction: "Sis kaplama oranı",
  precipitation_amount: "Yağış miktarı",
  probability_of_precipitation: "Yağış olasılığı",
  probability_of_thunder: "Gök gürültüsü olasılığı",
  ultraviolet_index_clear_sky: "Açık gökyüzü UV indeksi",
};
export const units = {
  celsius: "°C",
  degrees: "°",
  "m/s": "m/sn",
  "%": "%",
  mm: "mm",
  hPa: "hPa",
  1: "",
};
export const number = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("tr-TR", { maximumFractionDigits: 1 })
    : "—";
export const time = (t, options = {}) =>
  new Date(t).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
export function condition(symbol) {
  if (!symbol) return { Icon: CloudSun, label: "Koşul özeti bulunmuyor" };
  if (symbol.includes("thunder"))
    return { Icon: CloudRain, label: "Gök gürültülü yağış" };
  if (symbol.includes("sleet"))
    return { Icon: Snowflake, label: "Karla karışık yağmur" };
  if (symbol.includes("snow")) return { Icon: Snowflake, label: "Kar yağışlı" };
  if (symbol.includes("rain")) return { Icon: CloudRain, label: "Yağmurlu" };
  if (symbol.includes("fog")) return { Icon: Cloud, label: "Sisli" };
  if (symbol.startsWith("clearsky"))
    return { Icon: symbol.endsWith("night") ? Moon : Sun, label: "Açık" };
  if (symbol.startsWith("fair"))
    return {
      Icon: symbol.endsWith("night") ? CloudMoon : CloudSun,
      label: "Az bulutlu",
    };
  if (symbol.startsWith("partlycloudy"))
    return {
      Icon: symbol.endsWith("night") ? CloudMoon : CloudSun,
      label: "Parçalı bulutlu",
    };
  if (symbol.startsWith("cloudy")) return { Icon: Cloud, label: "Bulutlu" };
  return { Icon: CloudSun, label: "Kaynak koşul kodu: " + symbol };
}

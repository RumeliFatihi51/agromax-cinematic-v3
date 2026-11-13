const configuredToken = import.meta.env?.VITE_MAPBOX_ACCESS_TOKEN?.trim();
const token = configuredToken?.startsWith("pk.") ? configuredToken : "";
const mapboxAttribution = '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noreferrer">Harita geri bildirimi</a>';
export const mapboxEnabled = !!token;
const tokenQuery = "?access_token=" + encodeURIComponent(token);
export const basemaps = {
  satellite: {
    label: "Mapbox Satellite",
    url: token ? "https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg" + tokenQuery : "",
    options: { maxNativeZoom: 19, maxZoom: 21, attribution: mapboxAttribution },
  },
  archive: {
    label: "Sentinel-2 Cloudless · 2016",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
    options: {
      maxNativeZoom: 14, maxZoom: 21,
      attribution: '<a href="https://cloudless.eox.at/" target="_blank" rel="noreferrer">EOxCloudless · EOX IT Services GmbH</a> · Değiştirilmiş Copernicus Sentinel verisi 2016 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>',
    },
  },
  road: {
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxNativeZoom: 19, maxZoom: 21,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> katkıcıları',
    },
  },
};
export const satelliteWithLabels = {
  ...basemaps.satellite,
  url: token ? "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}" + tokenQuery : "",
};
export const defaultBasemap = mapboxEnabled ? basemaps.satellite : basemaps.archive;

// Visual basemap only. These mosaics are not dated Sentinel analysis inputs.
export const basemaps = {
  satellite: {
    label: "Uydu",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxNativeZoom: 19,
      maxZoom: 21,
      attribution:
        'Görüntü © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" target="_blank" rel="noreferrer">Esri World Imagery</a> · Esri, Vantor, Earthstar Geographics, GIS User Community',
    },
  },
  road: {
    label: "Harita",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> katkıcıları',
    },
  },
};
export const labelsLayer = {
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  options: {
    maxNativeZoom: 18,
    maxZoom: 21,
    pane: "labels",
    attribution: "Yer adları © Esri",
  },
};

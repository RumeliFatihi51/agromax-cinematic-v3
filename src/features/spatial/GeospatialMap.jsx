import { useEffect, useRef, useState } from "react";
import { Map, ScaleControl, AttributionControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { geometryBounds, pixelIndex, project, polygons, unproject, containsPoint } from "../../../shared/spatial";
import { basemaps } from "../fields/basemaps";
import { colorFor } from "./colors";
import { terrainAttribution, terrainTiles } from "./terrain";

const parcel = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
const imagery = basemaps.satellite;
const style = {
  version: 8,
  sources: {
    imagery: { type: "raster", tiles: [imagery.url], tileSize: 256,
      maxzoom: imagery.options.maxNativeZoom, attribution: imagery.options.attribution },
    parcel,
    review: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    observations: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  },
  layers: [
    { id: "ground", type: "background", paint: { "background-color": "#213d34" } },
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-fade-duration": 0 } },
    { id: "parcel-fill", type: "fill", source: "parcel",
      paint: { "fill-color": "#cbd99a", "fill-opacity": 0.12 } },
    { id: "parcel-line", type: "line", source: "parcel",
      paint: { "line-color": "#f3ffd2", "line-width": 2.5 } },
    { id: "review-line", type: "line", source: "review",
      paint: { "line-color": "#ffd070", "line-width": 3.5, "line-dasharray": [2, 1] } },
    { id: "observations", type: "circle", source: "observations",
      paint: { "circle-radius": 7, "circle-color": "#ffc169", "circle-stroke-width": 2,
        "circle-stroke-color": "#254037" } },
  ],
};

function rasterImage(raster, geometry, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width; canvas.height = raster.height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(raster.width, raster.height);
  for (let index = 0; index < raster.values.length; index++) {
    const value = raster.values[index];
    if (Number.isFinite(value)) image.data.set([...colorFor(value, scale), 255], index * 4);
  }
  context.putImageData(image, 0, 0);
  // Clip the rendered image to the exact saved boundary, including its holes.
  const clipped = document.createElement("canvas");
  clipped.width = raster.width * 4; clipped.height = raster.height * 4;
  const mask = clipped.getContext("2d");
  const [west, south, east, north] = raster.bounds;
  for (const polygon of polygons(geometry)) for (const ring of polygon) {
    ring.forEach((coordinate, index) => {
      const [x, y] = project(coordinate);
      const px = (x - west) / (east - west) * clipped.width;
      const py = (north - y) / (north - south) * clipped.height;
      if (index === 0) mask.moveTo(px, py); else mask.lineTo(px, py);
    });
    mask.closePath();
  }
  mask.clip("evenodd");
  mask.imageSmoothingEnabled = false;
  mask.drawImage(canvas, 0, 0, clipped.width, clipped.height);
  return {
    url: clipped.toDataURL("image/png"),
    coordinates: [[west, north], [east, north], [east, south], [west, south]].map(unproject),
  };
}

function useRasterImage(map, ready, id, raster, scale, geometry, opacity) {
  useEffect(() => {
    if (!ready || !raster || !scale) return;
    const source = rasterImage(raster, geometry, scale);
    map.addSource(id, { type: "image", ...source });
    map.addLayer({ id, type: "raster", source: id,
      paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 } }, "parcel-line");
    return () => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, ready, id, raster, scale, geometry]);
  useEffect(() => {
    if (ready && map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", opacity);
  }, [map, ready, id, opacity, raster, scale, geometry]);
}

export default function GeospatialMap({ field, frame, command, boundary, raster, comparison, scale,
  opacity, blend, mode, terrain, flat, exaggeration, basemap, reduced, highlight, markers, reviewGeometry, onPoint, onError }) {
  const element = useRef(null);
  const handlers = useRef({ onPoint, onError });
  handlers.current = { onPoint, onError };
  const current = useRef({ raster, mode, markers });
  current.current = { raster, mode, markers };
  const [map, setMap] = useState(null);
  const [ready, setReady] = useState(false);
  const [tileMessage, setTileMessage] = useState("");
  const [columnError, setColumnError] = useState("");
  const overlay = useRef(null);
  useEffect(() => {
    const [west, south, east, north] = geometryBounds(field.geometry);
    let instance;
    try {
      instance = new Map({
        container: element.current, style: structuredClone(style),
        bounds: [[west, south], [east, north]], fitBoundsOptions: { padding: 65, maxZoom: 19, bearing: -22 },
        attributionControl: false, maxPitch: 70, maxZoom: 20,
        pitch: 50, bearing: -22, scrollZoom: false, maxTileCacheSize: 80,
      });
    } catch {
      handlers.current.onError();
      return;
    }
    const fit = () => {
      instance.getSource("parcel").setData({ type: "Feature", geometry: field.geometry, properties: {} });
      setReady(true);
    };
    instance.on("style.load", fit);
    instance.on("error", (event) => {
      if (event.sourceId === "imagery") setTileMessage("Esri altlığı yüklenemedi. Parsel ve analiz katmanları ayrı çalışır.");
      else if (event.sourceId === "terrain") {
        instance.setTerrain(null);
        setTileMessage("Yükseklik döşemeleri alınamadı. Düz yüzey gösteriliyor.");
      }
    });
    instance.on("webglcontextlost", () => handlers.current.onError());
    instance.on("click", ({ lngLat, point }) => {
      const feature = instance.getLayer("observations") &&
        instance.queryRenderedFeatures(point, { layers: ["observations"] })[0];
      const marker = feature && current.current.markers.find(item => item.id === feature.properties.id);
      if (marker) { handlers.current.onPoint({ coordinate: marker.coordinate, marker }); return; }
      if (current.current.mode === "columns") return;
      const coordinate = lngLat.toArray();
      if (!containsPoint(field.geometry, coordinate)) return;
      const active = current.current.raster;
      const value = active ? active.values[pixelIndex(active, coordinate)] : null;
      handlers.current.onPoint({ coordinate, value: Number.isFinite(value) ? value : null });
    });
    instance.addControl(new ScaleControl({ maxWidth: 90 }), "bottom-left");
    instance.addControl(new AttributionControl({ compact: true }), "bottom-right");
    setMap(instance);
    return () => {
      overlay.current?.finalize();
      overlay.current = null;
      instance.remove();
    };
  }, [field.geometry]);

  useEffect(() => {
    if (ready) map.setMaxPitch(flat ? 0 : 70);
  }, [map, ready, flat]);

  useEffect(() => {
    if (!ready || !command) return;
    const duration = reduced ? 0 : 240;
    if (command.type === "fit") {
      const [west, south, east, north] = geometryBounds(field.geometry);
      map.fitBounds([[west, south], [east, north]], { padding: 56, maxZoom: 19, bearing: map.getBearing(), duration });
    } else if (command.type === "north") map.easeTo({ bearing: 0, duration });
    else if (command.type === "top") map.easeTo({ pitch: 0, bearing: 0, duration });
    else if (command.type === "tilt") map.easeTo({ pitch: 50, bearing: -22, duration });
    else if (command.type === "focus") map.easeTo({ center: command.coordinate, duration });
    else if (command.type === "region") {
      const [west, south, east, north] = geometryBounds(command.geometry);
      map.fitBounds([[west, south], [east, north]], { padding: 64, maxZoom: 19, bearing: map.getBearing(), duration });
    }
    else if (command.type === "in") map.zoomIn({ duration });
    else if (command.type === "out") map.zoomOut({ duration });
  }, [ready, map, command, field.geometry, reduced]);

  useEffect(() => {
    if (!ready) return;
    map.setLayoutProperty("imagery", "visibility", basemap ? "visible" : "none");
    for (const layer of ["parcel-fill", "parcel-line"])
      map.setLayoutProperty(layer, "visibility", boundary ? "visible" : "none");
    map.setPaintProperty("parcel-line", "line-color", highlight ? "#ffcf77" : "#f3ffd2");
  }, [map, ready, boundary, basemap, highlight]);
  useEffect(() => {
    if (ready) map.getSource("observations").setData({ type: "FeatureCollection", features: markers.map(marker => ({
      type: "Feature", properties: { id: marker.id },
      geometry: { type: "Point", coordinates: marker.coordinate },
    })) });
  }, [map, ready, markers]);
  useEffect(() => {
    if (ready) map.getSource("review").setData({ type: "FeatureCollection", features: reviewGeometry
      ? [{ type: "Feature", geometry: reviewGeometry, properties: {} }] : [] });
  }, [map, ready, reviewGeometry]);

  useEffect(() => {
    if (!ready) return;
    if (terrain && mode !== "columns") {
      if (!map.getSource("terrain")) map.addSource("terrain", {
        type: "raster-dem", tiles: [terrainTiles], encoding: "terrarium", tileSize: 256,
        maxzoom: 13, attribution: terrainAttribution,
      });
      map.setTerrain({ source: "terrain", exaggeration });
    } else {
      map.setTerrain(null);
      if (map.getSource("terrain")) map.removeSource("terrain");
    }
  }, [map, ready, terrain, mode, exaggeration]);

  useRasterImage(map, ready, "primary-raster", mode === "columns" ? null : raster, scale, field.geometry, opacity);
  useRasterImage(map, ready, "earlier-raster", mode === "columns" ? null : comparison, scale, field.geometry, opacity * blend);

  useEffect(() => {
    if (!ready || mode !== "columns" || !raster || !scale) return;
    let disposed = false;
    setColumnError("");
    import("./columns").then(({ makeColumns, MapLibreOverlay }) => {
      if (disposed) return;
      const layer = makeColumns(raster, field.geometry, scale, frame.span, opacity,
        object => handlers.current.onPoint(object));
      if (!overlay.current) {
        overlay.current = new MapLibreOverlay({ interleaved: true, layers: [] });
        map.addControl(overlay.current);
      }
      overlay.current.setProps({ layers: [layer] });
    }).catch(() => { if (!disposed) setColumnError("Sütun katmanı açılamadı. Yüzey moduna dönebilirsin."); });
    return () => {
      disposed = true;
      overlay.current?.setProps({ layers: [] });
    };
  }, [ready, map, mode, raster, field.geometry, scale, frame.span, opacity]);

  return <div className="spatial-map">
    <div ref={element} className="spatial-map-canvas" aria-label="Etkileşimli eğimli parsel haritası" />
    {(columnError || tileMessage) && <p className="spatial-map-notice" role="status">{columnError || tileMessage}</p>}
  </div>;
}

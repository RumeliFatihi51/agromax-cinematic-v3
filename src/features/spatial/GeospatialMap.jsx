import { useEffect, useRef, useState } from "react";
import { Map, ScaleControl, AttributionControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { geometryBounds, pixelIndex, project, polygons, unproject, containsPoint } from "../../../shared/spatial";
import { basemaps, defaultBasemap, mapboxEnabled } from "../fields/basemaps";
import MapboxWordmark from "../fields/MapboxWordmark";
import { colorFor } from "./colors";
import { parcelFootprints } from "../../../shared/raster-footprints";
import { terrainAttribution, terrainTiles } from "./terrain";

setWorkerUrl(mapWorkerUrl);
const parcel = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
const imagery = defaultBasemap;
const archive = basemaps.archive;
const collection = features => ({ type: "FeatureCollection", features });
const noItems = [];
const style = {
  version: 8,
  sky: {
    "sky-color": "#86aeb9", "horizon-color": "#e2e8dc", "fog-color": "#c6d1bc",
    "sky-horizon-blend": 0.45, "horizon-fog-blend": 0.55, "fog-ground-blend": 0.22,
  },
  sources: {
    imagery: { type: "raster", tiles: [imagery.url], tileSize: 256,
      maxzoom: imagery.options.maxNativeZoom, attribution: imagery.options.attribution },
    ...(mapboxEnabled && { "archive-imagery": { type: "raster", tiles: [archive.url], tileSize: 256,
      maxzoom: archive.options.maxNativeZoom, attribution: archive.options.attribution } }),
    "road-imagery": { type: "raster", tiles: [basemaps.road.url], tileSize: 256,
      maxzoom: basemaps.road.options.maxNativeZoom, attribution: basemaps.road.options.attribution },
    parcel,
    neighbors: { type: "geojson", data: collection([]) },
    zones: { type: "geojson", data: collection([]) },
    review: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    observations: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    selection: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  },
  layers: [
    { id: "ground", type: "background", paint: { "background-color": "#213d34" } },
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-fade-duration": 0 } },
    ...(mapboxEnabled ? [{ id: "archive-imagery", type: "raster", source: "archive-imagery", layout: { visibility: "none" } }] : []),
    { id: "road-imagery", type: "raster", source: "road-imagery", layout: { visibility: "none" } },
    { id: "parcel-fill", type: "fill", source: "parcel",
      paint: { "fill-color": "#cbd99a", "fill-opacity": 0.12 } },
    { id: "neighbor-fill", type: "fill", source: "neighbors",
      paint: { "fill-color": "#b6db85", "fill-opacity": 0.23 } },
    { id: "neighbor-line", type: "line", source: "neighbors",
      paint: { "line-color": "#e7f5c0", "line-width": 1.7 } },
    { id: "zone-fill", type: "fill", source: "zones",
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5 } },
    { id: "zone-line", type: "line", source: "zones",
      paint: { "line-color": "#fff5d4", "line-width": 1.3 } },
    { id: "parcel-halo", type: "line", source: "parcel",
      paint: { "line-color": "#22382a", "line-width": 4.5, "line-opacity": 0.75 } },
    { id: "parcel-line", type: "line", source: "parcel",
      paint: { "line-color": "#f7efcb", "line-width": 2.5 } },
    { id: "review-line", type: "line", source: "review",
      paint: { "line-color": "#ffd070", "line-width": 3.5, "line-dasharray": [2, 1] } },
    { id: "observations", type: "circle", source: "observations",
      paint: { "circle-radius": 7, "circle-color": "#ffc169", "circle-stroke-width": 2,
        "circle-stroke-color": "#254037" } },
    { id: "selection", type: "circle", source: "selection",
      paint: { "circle-radius": 11, "circle-color": "transparent", "circle-stroke-width": 2,
        "circle-stroke-color": "#ffde8c", "circle-pitch-alignment": "map" } },
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

export default function GeospatialMap({ field, frame, command, boundary = true, raster, comparison, scale,
  opacity = 0.85, blend = 0.5, mode = "surface", terrain = true, flat, exaggeration = 1, basemap = true, reduced,
  highlight, markers = noItems, reviewGeometry, imagery, droneImagery, selection, onPoint, onError,
  neighbors = noItems, zones = noItems, anchors = noItems, onAnchorPoints, onParcel, onHeading, mirror,
  interaction = true, terrainDefinition, compact = false, studio = false, atlas = false }) {
  const element = useRef(null);
  const handlers = useRef(null);
  handlers.current = { onPoint, onError, onParcel, onHeading, onAnchorPoints };
  const current = useRef(null);
  current.current = { field, raster, mode, markers, anchors, mirror, flat };
  const [map, setMap] = useState(null);
  const [ready, setReady] = useState(false);
  const [tileMessage, setTileMessage] = useState("");
  const [activeImagery, setActiveImagery] = useState("imagery");
  const mapGeometry = studio ? null : field.geometry;

  useEffect(() => {
    setReady(false);
    setActiveImagery("imagery");
    setTileMessage("");
    const { field: openingField, flat: openingFlat } = current.current;
    const [west, south, east, north] = geometryBounds(openingField.geometry);
    const padding = atlas && !compact ? {
      top: 52, right: 52, bottom: 52, left: Math.round(element.current.clientWidth * 0.47),
    } : compact ? 32 : 78;
    let instance;
    try {
      instance = new Map({
        container: element.current, style: structuredClone(style),
        bounds: [[west, south], [east, north]], fitBoundsOptions: { padding, maxZoom: 18, bearing: -24 },
        attributionControl: false, maxPitch: 78, maxZoom: 20,
        pitch: openingFlat ? 0 : 53, bearing: -24,
        maxTileCacheSize: compact ? 48 : 96, cooperativeGestures: true, renderWorldCopies: false,
      });
    } catch {
      handlers.current.onError?.();
      return;
    }
    const fit = () => {
      if (studio && !openingFlat) instance.jumpTo({ pitch: compact ? 53 : 63, bearing: -24, zoom: Math.max(0, instance.getZoom() - (compact ? 0.3 : 0.88)) });
      setReady(true);
    };
    instance.on("style.load", fit);
    let visibleSource = "imagery";
    const loadedImagery = new Set();
    instance.on("sourcedata", event => {
      if (event.tile?.state === "loaded") loadedImagery.add(event.sourceId);
    });
    instance.on("idle", () => {
      if (loadedImagery.has(visibleSource) || !instance.getLayer(visibleSource) ||
        instance.getLayoutProperty(visibleSource, "visibility") === "none") return;
      if (visibleSource !== "road-imagery") {
        visibleSource = mapboxEnabled && visibleSource === "imagery" ? "archive-imagery" : "road-imagery";
        setActiveImagery(visibleSource);
        setTileMessage(visibleSource === "archive-imagery"
          ? "Mapbox Satellite yüklenemedi. 2016 Sentinel-2 mozaiği açık."
          : "Uydu altlığı yüklenemedi. Yol haritası açık.");
      } else {
        setTileMessage("Yol altlığı alınamadı. Parsel sınırları ve analiz katmanları açık.");
      }
    });
    instance.on("error", event => {
      if (event.sourceId === "terrain") {
        instance.setTerrain(null);
        setTileMessage("Yükseklik döşemeleri alınamadı. Düz yüzey gösteriliyor.");
      }
    });
    instance.on("webglcontextlost", () => handlers.current.onError?.());
    instance.on("rotate", () => handlers.current.onHeading?.(instance.getBearing()));
    instance.on("render", () => {
      const { anchors, mirror } = current.current;
      if (handlers.current.onAnchorPoints && element.current) {
        const { clientWidth: width, clientHeight: height } = element.current;
        const points = {};
        for (const anchor of anchors) {
          const { x, y } = instance.project(anchor.coordinate);
          if (width && height && x > 0 && y > 0 && x < width && y < height) {
            points[anchor.id] = [Math.round(x / width * 1000) / 10, Math.round(y / height * 1000) / 10];
          }
        }
        handlers.current.onAnchorPoints(previous => {
          const keys = Object.keys(points);
          return keys.length === Object.keys(previous).length && keys.every(key =>
            previous[key]?.[0] === points[key][0] && previous[key]?.[1] === points[key][1]) ? previous : points;
        });
      }
      if (mirror?.current) {
        const source = instance.getCanvas(), target = mirror.current;
        if (target.width !== source.width) target.width = source.width;
        if (target.height !== source.height) target.height = source.height;
        const context = target.getContext("2d");
        context?.clearRect(0, 0, target.width, target.height);
        context?.drawImage(source, 0, 0);
      }
    });
    instance.on("click", ({ lngLat, point }) => {
      const feature = instance.getLayer("observations") &&
        instance.queryRenderedFeatures(point, { layers: ["observations"] })[0];
      const marker = feature && current.current.markers.find(item => item.id === feature.properties.id);
      if (marker) { handlers.current.onPoint?.({ coordinate: marker.coordinate, marker }); return; }
      if (current.current.mode === "columns" && instance.getLayer("index-columns")) {
        const cell = instance.queryRenderedFeatures(point, { layers: ["index-columns"] })[0]?.properties;
        if (cell) {
          handlers.current.onPoint?.({ value: cell.value, coordinate: [cell.longitude, cell.latitude], squareMeters: cell.squareMeters });
          return;
        }
      }
      const coordinate = lngLat.toArray();
      if (!containsPoint(current.current.field.geometry, coordinate)) {
        const neighbor = instance.getLayer("neighbor-fill") && instance.queryRenderedFeatures(point, { layers: ["neighbor-fill"] })[0];
        if (neighbor) handlers.current.onParcel?.(neighbor.properties.id);
        return;
      }
      const active = current.current.raster;
      const value = active ? active.values[pixelIndex(active, coordinate)] : null;
      handlers.current.onPoint?.({ coordinate, value: Number.isFinite(value) ? value : null });
    });
    instance.addControl(new ScaleControl({ maxWidth: 90 }), "bottom-left");
    instance.addControl(new AttributionControl({ compact: true }), "bottom-right");
    setMap(instance);
    return () => {
      instance.remove();
    };
  }, [mapGeometry, compact, studio, atlas]);

  useEffect(() => {
    if (ready) map.getSource("parcel").setData({ type: "Feature", geometry: field.geometry, properties: {} });
  }, [map, ready, field.geometry]);

  useEffect(() => { if (ready) map.triggerRepaint(); }, [map, ready, anchors, mirror]);
  useEffect(() => {
    if (!ready) return;
    for (const key of ["dragPan", "dragRotate", "touchZoomRotate", "keyboard", "doubleClickZoom", "scrollZoom"])
      map[key][interaction ? "enable" : "disable"]();
  }, [map, ready, interaction]);

  useEffect(() => {
    if (ready) map.setMaxPitch(flat ? 0 : 78);
  }, [map, ready, flat]);

  useEffect(() => {
    if (!ready || !command) return;
    const duration = reduced ? 0 : 240;
    if (command.type === "fit") {
      const [west, south, east, north] = geometryBounds(field.geometry);
      map.fitBounds([[west, south], [east, north]], { padding: compact ? 32 : 76, maxZoom: 18, bearing: -24, pitch: flat ? 0 : 53, duration });
    } else if (command.type === "landscape") {
      const [west, south, east, north] = command.bounds;
      const pitch = flat ? 0 : compact ? 48 : 61;
      map.fitBounds([[west, south], [east, north]], {
        padding: compact ? { top: 92, bottom: 154, left: 35, right: 52 } : { top: 115, bottom: 118, left: 135, right: 110 },
        maxZoom: command.maxZoom, bearing: -24, pitch, duration,
      });
    } else if (command.type === "north") map.easeTo({ bearing: 0, duration });
    else if (command.type === "top") map.easeTo({ pitch: 0, bearing: 0, duration });
    else if (command.type === "tilt") map.easeTo({ pitch: 50, bearing: -22, duration });
    else if (command.type === "slope") map.easeTo({ pitch: 70, bearing: map.getBearing(), duration });
    else if (command.type === "focus") map.easeTo({ center: command.coordinate, duration });
    else if (command.type === "region") {
      const [west, south, east, north] = geometryBounds(command.geometry);
      map.fitBounds([[west, south], [east, north]], { padding: 64, maxZoom: 19, bearing: map.getBearing(), duration });
    }
    else if (command.type === "in") map.zoomIn({ duration });
    else if (command.type === "out") map.zoomOut({ duration });
  }, [ready, map, command, field.geometry, reduced, compact, flat, studio]);

  useEffect(() => {
    if (!ready) return;
    for (const id of ["imagery", "archive-imagery", "road-imagery"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", basemap && activeImagery === id ? "visible" : "none");
    }
    for (const layer of ["parcel-fill", "parcel-halo", "parcel-line"])
      map.setLayoutProperty(layer, "visibility", boundary ? "visible" : "none");
    map.setPaintProperty("parcel-line", "line-color", highlight ? "#ffcf77" : "#f7efcb");
  }, [map, ready, boundary, basemap, highlight, activeImagery]);
  useEffect(() => {
    if (!ready) return;
    map.getSource("selection").setData({ type: "FeatureCollection", features: selection
      ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: selection } }] : [] });
  }, [map, ready, selection]);
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
    map.getSource("neighbors").setData(collection(neighbors.filter(item => item.geometry && item.id !== field.id).map(item => ({
      type: "Feature", geometry: item.geometry, properties: { id: item.id },
    }))));
    map.getSource("zones").setData(collection(zones.map((zone, index) => ({
      type: "Feature", geometry: zone.geometry,
      properties: { color: ["#abc66b", "#e8b77b", "#64a8aa", "#b0a1cd"][index % 4] },
    }))));
  }, [ready, map, neighbors, zones, field.id]);

  useEffect(() => {
    if (!ready) return;
    if (terrain) {
      if (!map.getSource("terrain")) map.addSource("terrain", terrainDefinition || {
        type: "raster-dem", tiles: [terrainTiles], encoding: "terrarium", tileSize: 256,
        maxzoom: 13, attribution: terrainAttribution,
      });
      map.setTerrain({ source: "terrain", exaggeration });
    }
    return () => {
      if (!map.getStyle()) return;
      map.setTerrain(null);
      if (map.getSource("terrain")) map.removeSource("terrain");
    };
  }, [map, ready, terrain, exaggeration, terrainDefinition]);

  useEffect(() => {
    if (!ready || !imagery?.bitmap.width) return;
    const canvas = document.createElement("canvas");
    canvas.width = imagery.bitmap.width;
    canvas.height = imagery.bitmap.height;
    canvas.getContext("2d").drawImage(imagery.bitmap, 0, 0);
    const [west, south, east, north] = imagery.bounds;
    const id = "dated-sentinel";
    map.addSource(id, { type: "image", url: canvas.toDataURL("image/png"),
      coordinates: [[west, north], [east, north], [east, south], [west, south]] });
    const firstOverlay = ["drone-imagery", "primary-raster", "parcel-fill"].find(layer => map.getLayer(layer));
    map.addLayer({ id, source: id, type: "raster", paint: { "raster-fade-duration": 0 } }, firstOverlay);
    return () => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, ready, imagery]);
  useEffect(() => {
    if (!ready || !droneImagery?.bitmap.width) return;
    const canvas = document.createElement("canvas");
    canvas.width = droneImagery.bitmap.width;
    canvas.height = droneImagery.bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(droneImagery.bitmap, 0, 0);
    const mask = document.createElement("canvas");
    mask.width = Math.ceil(canvas.width / 4);
    mask.height = Math.ceil(canvas.height / 4);
    mask.getContext("2d").drawImage(droneImagery.bitmap, 0, 0, mask.width, mask.height);
    context.globalCompositeOperation = "destination-in";
    context.filter = "blur(4px)";
    context.drawImage(mask, 0, 0, canvas.width, canvas.height);
    const [west, south, east, north] = droneImagery.bounds;
    const id = "drone-imagery";
    map.addSource(id, { type: "image", url: canvas.toDataURL("image/png"),
      coordinates: [[west, north], [east, north], [east, south], [west, south]].map(unproject) });
    const firstOverlay = ["primary-raster", "parcel-fill"].find(layer => map.getLayer(layer));
    map.addLayer({ id, source: id, type: "raster", paint: { "raster-fade-duration": 140 } }, firstOverlay);
    return () => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, ready, droneImagery]);
  useRasterImage(map, ready, "primary-raster", mode === "columns" ? null : raster, scale, field.geometry, opacity);
  useRasterImage(map, ready, "earlier-raster", mode === "columns" ? null : comparison, scale, field.geometry, opacity * blend);

  useEffect(() => {
    if (!ready || mode !== "columns" || !raster || !scale) return;
    const footprint = parcelFootprints(raster, field.geometry);
    const height = Math.max(4, Math.min(40, frame.span * 0.13));
    const features = raster.values.flatMap((value, index) => {
      const cell = Number.isFinite(value) ? footprint(index) : null;
      if (!cell) return [];
      const fraction = scale.max === scale.min ? 0.5 : (value - scale.min) / (scale.max - scale.min);
      return [{ type: "Feature", geometry: cell.geometry, properties: {
        value, longitude: cell.coordinate[0], latitude: cell.coordinate[1], squareMeters: cell.squareMeters,
        color: "rgb(" + colorFor(value, scale).join(",") + ")",
        height: height * Math.max(0.04, Math.min(1, fraction)),
      } }];
    });
    const id = "index-columns";
    map.addSource(id, { type: "geojson", data: collection(features) });
    map.addLayer({ id, source: id, type: "fill-extrusion", paint: {
      "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "height"],
    } });
    return () => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [ready, map, mode, raster, field.geometry, scale, frame.span]);

  useEffect(() => {
    if (ready && map.getLayer("index-columns")) map.setPaintProperty("index-columns", "fill-extrusion-opacity", opacity);
  }, [map, ready, mode, raster, scale, opacity]);

  return <div className="spatial-map" data-basemap={activeImagery === "road-imagery" ? "road" : activeImagery === "archive-imagery" || !mapboxEnabled ? "archive" : "mapbox"} data-terrain={terrain ? terrainDefinition ? "drone" : "mapzen" : "flat"}>
    <div ref={element} className="spatial-map-canvas" aria-label="Etkileşimli eğimli parsel haritası" />
    <MapboxWordmark visible={mapboxEnabled && basemap && activeImagery === "imagery"} />
    {tileMessage && <p className="spatial-map-notice" role="status">{tileMessage}</p>}
  </div>;
}

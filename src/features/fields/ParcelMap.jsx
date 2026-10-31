import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  MousePointer2,
  Pentagon,
  RectangleHorizontal,
  PenTool,
  Move,
  RotateCw,
  Scissors,
  Trash2,
  Undo2,
  Redo2,
  Magnet,
  LocateFixed,
  Expand,
  Maximize,
  Minimize,
  Upload,
  Download,
  Check,
  X,
  Satellite,
  Map as MapIcon,
  Layers,
  Compass,
  Info,
} from "lucide-react";
import { validateGeometry } from "../../../shared/geometry";
import { basemaps, labelsLayer } from "./basemaps";
import MapSearch from "./MapSearch";

function geometries(group) {
  const polygons = [];
  function collect(layer) {
    const g = layer.toGeoJSON?.().geometry;
    if (g?.type === "Polygon") polygons.push(g.coordinates);
    else if (g?.type === "MultiPolygon") polygons.push(...g.coordinates);
    else if (layer.eachLayer) layer.eachLayer(collect);
  }
  group.eachLayer(collect);
  return polygons.length === 0
    ? null
    : polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] }
      : { type: "MultiPolygon", coordinates: polygons };
}
export default function ParcelMap({
  fields = [],
  geometry = null,
  editable = false,
  onChange,
  onSelect,
  onDrawing,
  image = null,
  height = 520,
  children,
  compact = false,
  editSession = null,
}) {
  const element = useRef(),
    instance = useRef(),
    draft = useRef(),
    saved = useRef(),
    imageLayer = useRef(),
    history = useRef([]),
    position = useRef(0),
    skip = useRef(false),
    baseLayer = useRef(),
    labelLayer = useRef(),
    searchMarker = useRef(),
    initialFitDone = useRef(false),
    callbacks = useRef({ onChange, onSelect, onDrawing });
  callbacks.current = { onChange, onSelect, onDrawing };
  const [mode, setMode] = useState("select"),
    [snap, setSnap] = useState(true),
    [version, setVersion] = useState(0),
    [notice, setNotice] = useState(""),
    [tileError, setTileError] = useState(false),
    [base, setBase] = useState("satellite"),
    [labels, setLabels] = useState(false),
    [showInfo, setShowInfo] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const update = () => {
      setFullscreen(
        document.fullscreenElement === element.current?.parentElement,
      );
      instance.current?.invalidateSize();
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === element.current?.parentElement) {
        await document.exitFullscreen();
      } else if (element.current?.parentElement.requestFullscreen) {
        await element.current.parentElement.requestFullscreen();
      } else {
        setNotice("Bu tarayıcı tam ekran görünümünü desteklemiyor.");
      }
    } catch {
      setNotice(
        "Tam ekran görünümü açılamadı. Tarayıcı izinlerini kontrol edin.",
      );
    }
  }
  function rebuild(g) {
    const group = draft.current;
    if (!group) return;
    group.clearLayers();
    if (g)
      L.geoJSON(g, {
        style: {
          color: "#dcff69",
          weight: 3,
          fillColor: "#d3f87b",
          fillOpacity: 0.12,
        },
      }).eachLayer((layer) => {
        group.addLayer(layer);
        bind(layer);
      });
  }
  function snapshot() {
    if (skip.current) return;
    const g = geometries(draft.current),
      serialized = JSON.stringify(g);
    if (serialized === JSON.stringify(history.current[position.current]))
      return;
    history.current = history.current.slice(0, position.current + 1);
    history.current.push(g);
    if (history.current.length > 60) history.current.shift();
    position.current = history.current.length - 1;
    callbacks.current.onChange?.(g);
    setVersion((v) => v + 1);
  }
  function bind(layer) {
    layer.on(
      "pm:edit pm:dragend pm:rotateend pm:markerdragend pm:vertexadded pm:vertexremoved",
      snapshot,
    );
  }
  function stop() {
    const map = instance.current;
    if (!map) return;
    map.pm.disableDraw();
    // Geoman initializes its layer-add handlers when a mode is enabled.
    // Disabling an unused mode passes undefined listeners to Leaflet.off().
    if (map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
    if (map.pm.globalDragModeEnabled()) map.pm.disableGlobalDragMode();
    if (map.pm.globalRemovalModeEnabled()) map.pm.disableGlobalRemovalMode();
    if (map.pm.globalRotateModeEnabled()) map.pm.disableGlobalRotateMode();
    if (map.pm.globalCutModeEnabled()) map.pm.disableGlobalCutMode();
    setMode("select");
    snapshot();
  }
  function fitInitialFields() {
    if (
      initialFitDone.current ||
      !element.current?.clientWidth ||
      !element.current?.clientHeight
    )
      return;
    initialFitDone.current = true;
    if (!geometry && saved.current?.getLayers().length)
      instance.current.fitBounds(saved.current.getBounds(), {
        padding: [40, 40],
        maxZoom: 16,
      });
  }
  useEffect(() => {
    const map = L.map(element.current, {
      center: [39, 35],
      zoom: 7,
      zoomControl: false,
    });
    instance.current = map;
    map.createPane("labels");
    map.getPane("labels").style.zIndex = 450;
    map.getPane("labels").style.pointerEvents = "none";
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    map.pm.setLang("tr");
    draft.current = L.featureGroup().addTo(map);
    saved.current = L.featureGroup().addTo(map);
    map.pm.setGlobalOptions({
      layerGroup: draft.current,
      snappable: true,
      snapDistance: 18,
      allowSelfIntersection: false,
      continueDrawing: false,
      allowRemoval: true,
      removeLayerBelowMinVertexCount: false,
      pathOptions: {
        color: "#dcff69",
        fillColor: "#dcff69",
        fillOpacity: 0.12,
        weight: 3,
      },
    });
    history.current = [geometry];
    position.current = 0;
    rebuild(geometry);
    if (geometry) {
      initialFitDone.current = true;
      map.fitBounds(draft.current.getBounds(), {
        padding: [50, 50],
        maxZoom: 17,
      });
    }
    map.on("pm:create", (e) => {
      draft.current.addLayer(e.layer);
      bind(e.layer);
      snapshot();
      setMode("select");
    });
    map.on("pm:remove", () => queueMicrotask(snapshot));
    map.on("pm:cut", (e) => {
      draft.current.removeLayer(e.originalLayer);
      draft.current.addLayer(e.layer);
      if (e.layer.eachLayer) e.layer.eachLayer(bind);
      else bind(e.layer);
      snapshot();
    });
    map.on("pm:drawstart", () => callbacks.current.onDrawing?.(true));
    map.on("pm:drawend", () => {
      setMode("select");
      callbacks.current.onDrawing?.(false);
    });
    const observer = new ResizeObserver(() => {
      if (element.current?.clientWidth && element.current?.clientHeight) {
        map.invalidateSize();
        fitInitialFields();
      }
    });
    observer.observe(element.current);
    const key = (e) => {
      if (e.key === "Escape") {
        stop();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", key);
      map.remove();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    if (editSession === null || !instance.current) return;
    // Enter/leave edit mode on the same Leaflet map; never replace the viewport.
    skip.current = true;
    stop();
    rebuild(editable ? geometry : null);
    history.current = [editable ? geometry : null];
    position.current = 0;
    skip.current = false;
    setVersion((v) => v + 1);
    callbacks.current.onDrawing?.(false);
    if (editable) {
      callbacks.current.onChange?.(geometry);
      if (geometry) {
        const bounds = draft.current.getBounds();
        if (bounds.isValid() && !instance.current.getBounds().contains(bounds))
          instance.current.fitBounds(bounds, {
            padding: [55, 55],
            maxZoom: 17,
          });
        instance.current.pm.enableGlobalEditMode();
        setMode("edit");
      } else {
        instance.current.pm.enableDraw("Polygon");
        setMode("polygon");
      }
    }
  }, [editable, editSession]);
  useEffect(() => {
    const map = instance.current;
    if (!map) return;
    setTileError(false);
    baseLayer.current?.remove();
    const config = basemaps[base];
    const tile = L.tileLayer(config.url, config.options).addTo(map);
    baseLayer.current = tile;
    let errors = 0;
    tile.on("tileerror", () => {
      if (++errors >= 3) setTileError(true);
    });
    tile.on("tileload", () => {
      errors = 0;
      setTileError(false);
    });
    return () => tile.remove();
  }, [base]);
  useEffect(() => {
    labelLayer.current?.remove();
    if (labels && base === "satellite")
      labelLayer.current = L.tileLayer(
        labelsLayer.url,
        labelsLayer.options,
      ).addTo(instance.current);
    return () => labelLayer.current?.remove();
  }, [labels, base]);
  useEffect(() => {
    const group = saved.current;
    if (!group) return;
    group.clearLayers();
    for (const field of fields) {
      if (!field.geometry) continue;
      const layer = L.geoJSON(field.geometry, {
        pmIgnore: true,
        style: {
          color: "#dcff69",
          weight: 3,
          fillColor: "#c6f367",
          fillOpacity: 0.12,
        },
      }).addTo(group);
      const tooltip = document.createElement("span");
      tooltip.textContent = field.name;
      layer.bindTooltip(tooltip, { sticky: true });
      layer.on("click", () => callbacks.current.onSelect?.(field));
    }
    fitInitialFields();
  }, [fields]);
  useEffect(() => {
    if (imageLayer.current) {
      imageLayer.current.remove();
      imageLayer.current = null;
    }
    if (image && instance.current) {
      imageLayer.current = L.imageOverlay(
        image.url,
        [
          [image.bounds[1], image.bounds[0]],
          [image.bounds[3], image.bounds[2]],
        ],
        { opacity: 0.9, interactive: false },
      ).addTo(instance.current);
      draft.current?.bringToFront();
      saved.current?.bringToFront();
    }
    return () => {
      imageLayer.current?.remove();
      imageLayer.current = null;
    };
  }, [image]);
  function activate(next) {
    stop();
    const map = instance.current;
    if (next === "polygon") map.pm.enableDraw("Polygon");
    if (next === "rectangle") map.pm.enableDraw("Rectangle");
    if (next === "edit") map.pm.enableGlobalEditMode();
    if (next === "move") map.pm.enableGlobalDragMode();
    if (next === "rotate") map.pm.enableGlobalRotateMode();
    if (next === "cut")
      map.pm.enableGlobalCutMode({ allowSelfIntersection: false });
    if (next === "remove") map.pm.enableGlobalRemovalMode();
    setMode(next);
  }
  function undo(offset) {
    stop();
    position.current = Math.max(
      0,
      Math.min(history.current.length - 1, position.current + offset),
    );
    skip.current = true;
    const g = history.current[position.current];
    rebuild(g);
    skip.current = false;
    callbacks.current.onChange?.(g);
    setVersion((v) => v + 1);
  }
  async function importGeo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 250000)
        throw new Error("GeoJSON 250 KB sınırını aşıyor.");
      const data = JSON.parse(await file.text());
      const features =
        data.type === "FeatureCollection"
          ? data.features
          : data.type === "Feature"
            ? [data]
            : [{ geometry: data }];
      if (!features?.length) throw new Error("Dosya boş.");
      const polygons = [];
      for (const f of features) {
        const g = f.geometry;
        if (g?.type === "Polygon") polygons.push(g.coordinates);
        else if (g?.type === "MultiPolygon") polygons.push(...g.coordinates);
        else
          throw new Error("Yalnızca Polygon/MultiPolygon içe aktarılabilir.");
      }
      const g =
        polygons.length === 1
          ? { type: "Polygon", coordinates: polygons[0] }
          : { type: "MultiPolygon", coordinates: polygons };
      validateGeometry(g);
      stop();
      rebuild(g);
      snapshot();
      instance.current.fitBounds(draft.current.getBounds(), {
        padding: [40, 40],
      });
      setNotice("GeoJSON içe aktarıldı. Kaydet düğmesiyle onaylayın.");
    } catch (e) {
      setNotice(e.message);
    }
  }
  function exportGeo() {
    const g = geometries(draft.current);
    if (!g) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { type: "Feature", properties: {}, geometry: g },
            null,
            2,
          ),
        ],
        { type: "application/geo+json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "agromax-parsel.geojson";
    a.click();
    URL.revokeObjectURL(url);
  }
  const tools = [
    [MousePointer2, "select", "Seç / gezin"],
    [Pentagon, "polygon", "Çokgen çiz"],
    [RectangleHorizontal, "rectangle", "Dikdörtgen çiz"],
    [PenTool, "edit", "Köşeleri düzenle"],
    [Move, "move", "Parseli taşı"],
    [RotateCw, "rotate", "Döndür"],
    [Scissors, "cut", "Alan kes / delik aç"],
    [Trash2, "remove", "Taslak parçayı kaldır"],
  ];
  return (
    <div
      className={`parcel-map aerial-map ${editable ? "is-editable" : ""} ${compact ? "is-compact" : ""}`}
      style={{ height }}
    >
      <div className="leaflet-container-host" ref={element} />
      {children && <div className="map-overlay-content">{children}</div>}
      {!compact && (
        <MapSearch
          getCenter={() =>
            instance.current?.getCenter() || { lat: 39, lng: 35 }
          }
          onSelect={(place) => {
            stop();
            const map = instance.current;
            if (!map) return;
            searchMarker.current?.remove();
            const label = document.createElement("span");
            label.textContent = place.name;
            searchMarker.current = L.circleMarker([place.lat, place.lng], {
              radius: 7,
              color: "#fff",
              weight: 3,
              fillColor: "#a899ed",
              fillOpacity: 1,
              pmIgnore: true,
            })
              .addTo(map)
              .bindTooltip(label, { direction: "top", offset: [0, -10] });
            const leftPadding = Math.min(
              editable ? 230 : children ? 310 : 40,
              map.getSize().x / 3,
            );
            if (place.bbox) {
              const [west, south, east, north] = place.bbox;
              map.fitBounds(
                [
                  [south, west],
                  [north, east],
                ],
                {
                  paddingTopLeft: [leftPadding, 145],
                  paddingBottomRight: [45, 80],
                  maxZoom: 17,
                },
              );
            } else map.setView([place.lat, place.lng], 16);
            searchMarker.current.openTooltip();
          }}
        />
      )}
      <div className="basemap-switch" aria-label="Harita altlığı">
        <button
          type="button"
          className={base === "satellite" ? "active" : ""}
          onClick={() => setBase("satellite")}
          aria-pressed={base === "satellite"}
        >
          <Satellite size={16} />
          Uydu
        </button>
        <button
          type="button"
          className={base === "road" ? "active" : ""}
          onClick={() => setBase("road")}
          aria-pressed={base === "road"}
        >
          <MapIcon size={16} />
          Harita
        </button>
        <button
          type="button"
          className={labels && base === "satellite" ? "active" : ""}
          disabled={base !== "satellite"}
          onClick={() => setLabels(!labels)}
          title="Yer adlarını göster"
          aria-label="Yer adlarını göster"
          aria-pressed={labels && base === "satellite"}
        >
          <Layers size={16} />
        </button>
      </div>
      {editable && (
        <div className="drawing-palette" aria-label="Parsel çizim araçları">
          <span className="palette-label">ÇİZİM ATÖLYESİ</span>
          <div className="palette-tools">
            {tools.map(([Icon, id, title]) => (
              <button
                type="button"
                key={id}
                className={mode === id ? "selected" : ""}
                onClick={() => activate(id)}
                title={title}
                aria-label={title}
                aria-pressed={mode === id}
              >
                <Icon size={19} />
                <span>{title}</span>
              </button>
            ))}
            <div className="palette-divider" />
            <button
              type="button"
              title="Geri al"
              aria-label="Geri al"
              disabled={position.current === 0}
              onClick={() => undo(-1)}
            >
              <Undo2 size={19} />
            </button>
            <button
              type="button"
              title="İleri al"
              aria-label="İleri al"
              disabled={position.current >= history.current.length - 1}
              onClick={() => undo(1)}
            >
              <Redo2 size={19} />
            </button>
            <button
              type="button"
              title="Köşe yakalama"
              aria-label="Köşe yakalama"
              className={snap ? "selected" : ""}
              aria-pressed={snap}
              onClick={() => {
                setSnap(!snap);
                instance.current.pm.setGlobalOptions({ snappable: !snap });
              }}
            >
              <Magnet size={19} />
            </button>
            <label className="palette-file" title="GeoJSON içe aktar">
              <Upload size={19} />
              <span className="sr-only">GeoJSON içe aktar</span>
              <input type="file" accept=".geojson,.json" onChange={importGeo} />
            </label>
            <button
              type="button"
              title="GeoJSON indir"
              aria-label="GeoJSON indir"
              onClick={exportGeo}
              disabled={!history.current[position.current]}
            >
              <Download size={19} />
            </button>
          </div>
          <p>
            {mode === "polygon"
              ? "Köşeleri tıklayın. İlk köşeye tıklayarak tamamlayın."
              : mode === "edit"
                ? "Köşeleri sürükleyin; ara noktaya tıklayarak köşe ekleyin. Sağ tıkla köşe silin."
                : mode === "cut"
                  ? "Çıkarılacak alanı çokgenle çizin."
                  : mode === "remove"
                    ? "Kaldırmak istediğiniz taslak parçaya tıklayın. Kayda geçmesi için kaydedin."
                    : "Çizin, düzenleyin, sonra parselinizi kaydedin."}
          </p>
          {mode !== "select" && (
            <button className="finish-drawing" type="button" onClick={stop}>
              <Check size={15} />
              Aracı bitir / gezin
            </button>
          )}
        </div>
      )}
      <div className="map-utilities">
        <span className="north-marker" title="Kuzey">
          <Compass size={21} />
          <b>K</b>
        </span>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Tam ekrandan çık" : "Haritayı tam ekran aç"}
          title={fullscreen ? "Tam ekrandan çık" : "Haritayı tam ekran aç"}
          aria-pressed={fullscreen}
        >
          {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
        <button
          type="button"
          aria-label="Konumuma git"
          title="Konumuma git"
          onClick={() => {
            if (!navigator.geolocation) {
              setNotice("Tarayıcı konum özelliğini desteklemiyor.");
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (p) =>
                instance.current.setView(
                  [p.coords.latitude, p.coords.longitude],
                  16,
                ),
              () =>
                setNotice(
                  "Konum alınamadı. Haritayı sürükleyin veya koordinat girin.",
                ),
            );
          }}
        >
          <LocateFixed size={18} />
        </button>
        <button
          type="button"
          aria-label="Parsellere odaklan"
          title="Parsellere odaklan"
          onClick={() => {
            const bounds = L.featureGroup([
              ...saved.current.getLayers(),
              ...draft.current.getLayers(),
            ]).getBounds();
            if (bounds.isValid())
              instance.current.fitBounds(bounds, {
                padding: [40, 40],
                maxZoom: 18,
              });
          }}
        >
          <Expand size={18} />
        </button>
      </div>
      {editable && (
        <form
          className="coordinate-jump"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.target),
              lat = Number(f.get("lat")),
              lng = Number(f.get("lng"));
            if (
              Number.isFinite(lat) &&
              Number.isFinite(lng) &&
              Math.abs(lat) <= 85 &&
              Math.abs(lng) <= 180
            )
              instance.current.setView([lat, lng], 16);
          }}
        >
          <input
            name="lat"
            type="number"
            step="any"
            placeholder="Enlem"
            aria-label="Enlem"
            required
            min="-85"
            max="85"
          />
          <input
            name="lng"
            type="number"
            step="any"
            placeholder="Boylam"
            aria-label="Boylam"
            required
            min="-180"
            max="180"
          />
          <button>Git</button>
        </form>
      )}
      {tileError && (
        <div className="map-tile-error">
          {base === "satellite"
            ? "Uydu görüntüsü yüklenemedi."
            : "Harita altlığı yüklenemedi."}{" "}
          Bağlantıyı kontrol edin veya diğer altlığı seçin. Parsel sınırları
          korunur.
        </div>
      )}
      {notice && (
        <div className="map-notice" role="status">
          {notice}
          <button
            type="button"
            aria-label="Bildirimi kapat"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="imagery-info">
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          aria-label="Görüntü kaynağı bilgisi"
        >
          <Info size={14} />
          {base === "satellite" ? "Esri World Imagery" : "OpenStreetMap"}
        </button>
        {showInfo && (
          <p>
            Uydu altlığı farklı tarihlerde çekilmiş uydu/hava görüntülerinden
            oluşur. Canlı görüntü değildir; tarımsal indeksler tarihli
            Copernicus verisinden ayrıca hesaplanır.
          </p>
        )}
      </div>
    </div>
  );
}

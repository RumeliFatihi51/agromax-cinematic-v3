import { useEffect, useState } from "react";
import { addProtocol, removeProtocol } from "maplibre-gl";
import { project, worldWidth } from "../../../shared/spatial";
import { loadTerrain, terrainAttribution, terrainTiles } from "./terrain";
import { useCombinedTerrain } from "./DroneTerrain";

let nextProtocol = 0;

export function useTerrainSample(frame, enabled) {
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!enabled || !frame) return;
    const controller = new AbortController();
    loadTerrain(frame, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]))
      .then(value => { if (!controller.signal.aborted) setLoaded({ frame, value }); })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ frame, error: true }); });
    return () => controller.abort();
  }, [frame, enabled]);
  return enabled && loaded?.frame === frame ? loaded.value || loaded : null;
}

export function useDroneTerrainSource(frame, dtm, dem) {
  const terrain = useCombinedTerrain(dtm, Number.isFinite(dem?.reference) ? dem : null, frame);
  const [definition, setDefinition] = useState(null);
  useEffect(() => {
    if (!frame || !dtm || !Number.isFinite(dem?.reference)) return;
    const protocol = "agromaxterrain" + ++nextProtocol;
    const [originX, originY] = project(frame.center);
    const extent = frame.span * 0.95;
    addProtocol(protocol, async (request, { signal }) => {
      const [z, x, y] = request.url.split("/").slice(-3).map(Number);
      const native = Math.min(13, z), factor = 2 ** (z - native);
      const url = terrainTiles.replace("{z}", native).replace("{x}", Math.floor(x / factor)).replace("{y}", Math.floor(y / factor));
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("Yükseklik döşemesi alınamadı.");
      const metres = worldWidth / 2 ** z;
      const left = (x / 2 ** z - 0.5) * worldWidth, top = (0.5 - y / 2 ** z) * worldWidth;
      const localLeft = (left - originX) * frame.ground, localTop = (originY - top) * frame.ground;
      const localSpan = metres * frame.ground;
      const intersects = localLeft < extent && localLeft + localSpan > -extent &&
        localTop < extent && localTop + localSpan > -extent;
      if (!intersects && factor === 1) return { data: await response.arrayBuffer() };
      const image = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none" });
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d", { willReadFrequently: intersects });
      try {
        ctx.imageSmoothingEnabled = false;
        const size = image.width / factor;
        ctx.drawImage(image, (x % factor) * size, (y % factor) * size, size, size, 0, 0, 256, 256);
      } finally { image.close(); }
      if (intersects) {
        const pixels = ctx.getImageData(0, 0, 256, 256);
        const step = localSpan / 256;
        for (let row = 0; row < 256; row++) for (let col = 0; col < 256; col++) {
          const east = localLeft + (col + 0.5) * step, south = localTop + (row + 0.5) * step;
          if (Math.abs(east) > extent || Math.abs(south) > extent || !dtm.edgeDistance(east, south)) continue;
          const elevation = terrain.sample(east, south) - terrain.datumOffset;
          if (!Number.isFinite(elevation)) continue;
          const packed = Math.max(0, Math.min(0xffffff, Math.round((elevation + 32768) * 256)));
          pixels.data.set([packed >> 16, (packed >> 8) & 255, packed & 255, 255], (row * 256 + col) * 4);
        }
        ctx.putImageData(pixels, 0, 0);
      }
      signal.throwIfAborted();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      return { data: await blob.arrayBuffer() };
    });
    setDefinition({ frame, terrain, source: {
      type: "raster-dem", tiles: [protocol + "://tiles/{z}/{x}/{y}"], encoding: "terrarium", tileSize: 256, maxzoom: 16,
      attribution: terrainAttribution,
    } });
    return () => removeProtocol(protocol);
  }, [frame, dtm, dem, terrain]);
  return definition?.frame === frame && definition?.terrain === terrain ? definition.source : null;
}

import { project, worldWidth } from "../../../shared/spatial";
import { basemaps } from "../fields/basemaps";
import { useEffect, useState } from "react";

export function useContextImagery(frame, enabled, compact) {
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (!enabled || !frame) return;
    const controller = new AbortController();
    loadContextImagery(frame, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), compact)
      .then(canvas => { if (!controller.signal.aborted) setImage({ frame, canvas }); })
      .catch(() => { if (!controller.signal.aborted) setImage({ frame, unavailable: true }); });
    return () => controller.abort();
  }, [frame, enabled, compact]);
  return enabled && image?.frame === frame ? image : null;
}

export async function loadContextImagery(frame, signal, compact) {
  const pad = frame.span * 0.35;
  const [west, north] = project(frame.coordinate(-frame.width / 2 - pad, -frame.depth / 2 - pad));
  const [east, south] = project(frame.coordinate(frame.width / 2 + pad, frame.depth / 2 + pad));
  let extent;
  for (let zoom = 18; zoom >= 0; zoom--) {
    const side = 2 ** zoom;
    const width = worldWidth / side;
    const left = (west + worldWidth / 2) / width, right = (east + worldWidth / 2) / width;
    const top = (worldWidth / 2 - north) / width, bottom = (worldWidth / 2 - south) / width;
    const count = (Math.ceil(right) - Math.floor(left)) * (Math.ceil(bottom) - Math.floor(top));
    if (count <= (compact ? 6 : 12)) { extent = { zoom, side, left, right, top, bottom }; break; }
  }
  const { zoom, side, left, right, top, bottom } = extent;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = compact ? 512 : 768;
  const ctx = canvas.getContext("2d");
  const drawTile = async (x, y) => {
    if (y < 0 || y >= side) throw new Error("Görüntü alanı döşeme sınırının dışında.");
    const url = basemaps.satellite.url.replace("{z}", zoom)
      .replace("{x}", (x + side) % side).replace("{y}", y);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error("Görüntü döşemesi alınamadı.");
    const bitmap = await createImageBitmap(await response.blob());
    try {
      signal.throwIfAborted();
      ctx.drawImage(bitmap, (x - left) / (right - left) * canvas.width,
        (y - top) / (bottom - top) * canvas.height,
        canvas.width / (right - left), canvas.height / (bottom - top));
    } finally { bitmap.close(); }
  };
  const work = [];
  for (let x = Math.floor(left); x < Math.ceil(right); x++)
    for (let y = Math.floor(top); y < Math.ceil(bottom); y++) work.push(drawTile(x, y));
  await Promise.all(work);
  return canvas;
}

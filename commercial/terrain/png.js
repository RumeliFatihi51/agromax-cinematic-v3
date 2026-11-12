import { PNG } from "pngjs";
export function terrainPng(width, height) {
  const image = new PNG({ width, height });
  return { data: image.data, encode: () => PNG.sync.write(image) };
}

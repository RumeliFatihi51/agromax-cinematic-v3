import { terrainPng } from "./png.js";
import proj4 from "proj4";
import type { GeoTIFF } from "geotiff";
import { containsPoint, metricFrame, project, unproject } from "../../shared/spatial.js";
import { DomainError } from "../core/errors";

export type TerrainLayerKind = "ortho" | "dtm";
export const terrainEncodingOffset = 12000;
const fail = (message: string) => new DomainError("TERRAIN_RASTER_INVALID", message, 422);

function projection(keys: ReturnType<Awaited<ReturnType<GeoTIFF["getImage"]>>["getGeoKeys"]>) {
  const epsg = keys?.ProjectedCSTypeGeoKey ||
    keys?.GeographicTypeGeoKey;
  if (epsg === 4326 && keys?.GTModelTypeGeoKey === 2)
    return { epsg, transform: proj4("EPSG:4326", "EPSG:4326") };
  const zone = epsg % 100;
  const north = epsg >= 32601 && epsg <= 32660;
  if (keys?.GTModelTypeGeoKey !== 1 || !north && !(epsg >= 32701 && epsg <= 32760))
    throw fail("Koordinat sistemi WGS84 veya WGS84/UTM olmalı.");
  return { epsg, transform: proj4("EPSG:4326", "+proj=utm +zone=" + zone + (north ? "" : " +south") + " +datum=WGS84 +units=m +no_defs") };
}

export async function prepareTerrainLayer(tiff: GeoTIFF, kind: TerrainLayerKind, geometry: unknown, signal: AbortSignal) {
  const base = await tiff.getImage();
  const keys = base.getGeoKeys();
  const { epsg, transform } = projection(keys);
  const baseDirectory = base.getFileDirectory();
  if (baseDirectory.hasTag("ModelTransformation") || !baseDirectory.hasTag("ModelTiepoint") ||
      !baseDirectory.hasTag("ModelPixelScale") || keys?.GTRasterTypeGeoKey === 2)
    throw fail("Dosya kuzey yönlü, piksel alanı koordinatlı bir COG olmalı.");
  if (kind === "dtm" && keys?.VerticalUnitsGeoKey && keys.VerticalUnitsGeoKey !== 9001)
    throw fail("Yükseklik değerleri metre biriminde olmalı.");
  const images = [base];
  while (images.at(-1)!.getFileDirectory().nextIFDByteOffset) {
    signal.throwIfAborted();
    if (images.length >= 24) throw fail("Dosyada desteklenenden fazla raster düzeyi var.");
    images.push(await tiff.getImage(images.length));
  }
  const isMask = (image: typeof base) => (Number(image.getFileDirectory().getValue("NewSubfileType")) & 4) !== 0;
  const [minX, minY, maxX, maxY] = base.getBoundingBox();
  const extent = [minX, minY, maxX, maxY];
  if (!extent.every(Number.isFinite) || minX >= maxX || minY >= maxY) throw fail("Raster konumu okunamadı.");

  const bands = base.getSamplesPerPixel();
  const alpha = bands === 4 && [1, 2].includes(Number(Array.from(baseDirectory.getValue("ExtraSamples") || [])[0]));
  if (kind === "ortho" && (baseDirectory.getValue("PhotometricInterpretation") !== 2 ||
      (bands !== 3 && !alpha) || Array.from({ length: bands }, (_, i) => base.getBitsPerSample(i)).some(bits => bits !== 8)))
    throw fail("Ortomozaiğin 8 bit RGB veya RGBA bantları olmalı.");
  if (kind === "dtm" && bands !== 1) throw fail("Arazi modeli tek yükseklik bandı içermeli.");
  const frame = metricFrame(geometry);
  const padding = frame.span * 0.35;
  const [west, north] = project(frame.coordinate(-frame.width / 2 - padding, -frame.depth / 2 - padding) as [number, number]);
  const [east, south] = project(frame.coordinate(frame.width / 2 + padding, frame.depth / 2 + padding) as [number, number]);
  const bounds = [west, south, east, north];
  const grid = Array.from({ length: 9 }, (_, i) => i / 8);
  const projected = grid.flatMap(x => grid.map(y => transform.forward(unproject([west + (east - west) * x, north + (south - north) * y]))));
  const area = [
    Math.max(minX, Math.min(...projected.map(point => point[0]))),
    Math.max(minY, Math.min(...projected.map(point => point[1]))),
    Math.min(maxX, Math.max(...projected.map(point => point[0]))),
    Math.min(maxY, Math.max(...projected.map(point => point[1]))),
  ];
  if (!area.every(Number.isFinite) || area[0]! >= area[2]! || area[1]! >= area[3]!)
    throw fail("Dosya parselin bulunduğu alanla kesişmiyor.");
  const windowFor = (image: typeof base): [number, number, number, number] => {
    const width = image.getWidth(), height = image.getHeight();
    const col = (value: number) => (value - minX!) / (maxX! - minX!) * width;
    const row = (value: number) => (maxY! - value) / (maxY! - minY!) * height;
    return [
      Math.max(0, Math.floor(col(area[0]!)) - 1), Math.max(0, Math.floor(row(area[3]!)) - 1),
      Math.min(width, Math.ceil(col(area[2]!)) + 1), Math.min(height, Math.ceil(row(area[1]!)) + 1),
    ];
  };
  const candidates = images.filter(image => !isMask(image) && image.isTiled && image.getSamplesPerPixel() === bands &&
    image.getTileWidth() <= 1024 && image.getTileHeight() <= 1024)
    .sort((a, b) => b.getWidth() - a.getWidth());
  const windowLimit = kind === "ortho" ? 2048 : 1024;
  const selected = candidates.find(image => {
    const [x, y, right, bottom] = windowFor(image);
    return right - x <= windowLimit && bottom - y <= windowLimit;
  });
  if (!base.isTiled || !selected) throw fail("Döşemeli, küçük önizleme düzeyleri içeren bir COG yükleyin.");
  const offsets = selected.getFileDirectory();
  const firstOffset = Number(await offsets.loadValueIndexed("TileOffsets", 0));
  const lastOffset = Number(await offsets.loadValueIndexed("TileOffsets",
    Math.ceil(selected.getWidth() / selected.getTileWidth()) * Math.ceil(selected.getHeight() / selected.getTileHeight()) - 1));
  if (firstOffset < 8 || lastOffset < firstOffset || !Number.isFinite(firstOffset + lastOffset))
    throw fail("COG döşeme sırası doğrulanamadı.");
  const masks = images.filter(isMask);
  const maskImage = masks.find(image => image.getWidth() === selected.getWidth() && image.getHeight() === selected.getHeight());
  if ((masks.length && !maskImage) || baseDirectory.hasTag("SubIFDs"))
    throw fail("Bu COG maskesi desteklenmiyor. Geçerliliği alfa bandı veya NoData olarak dışa aktarın.");
  const window = windowFor(selected);
  const [raster, mask] = await Promise.all([
    selected.readRasters({ window, signal, interleave: false }),
    maskImage?.readRasters({ window, signal, samples: [0], interleave: true }),
  ]);
  const noData = base.getGDALNoData();
  const limit = kind === "ortho" ? 1024 : 256;
  const width = Math.max(32, Math.round(limit * (east - west) / Math.max(east - west, north - south)));
  const height = Math.max(32, Math.round(limit * (north - south) / Math.max(east - west, north - south)));
  const png = terrainPng(width, height);
  const sourceWidth = selected.getWidth(), sourceHeight = selected.getHeight();
  const valuesAt = (coordinate: number[]) => {
    const [x, y] = transform.forward(coordinate);
    const col = Math.floor((x - minX!) / (maxX! - minX!) * sourceWidth);
    const row = Math.floor((maxY! - y) / (maxY! - minY!) * sourceHeight);
    if (col < window[0] || col >= window[2] || row < window[1] || row >= window[3]) return null;
    const index = (row - window[1]) * raster.width + col - window[0];
    if (mask && mask[index] === 0) return null;
    const first = raster[0]![index]!;
    if (kind === "dtm") return Number.isFinite(first) && first !== noData && first >= -12000 && first <= 10000 ? [first] : null;
    const [green, blue] = [raster[1]![index]!, raster[2]![index]!];
    const opacity = alpha ? raster[3]![index]! : 255;
    return !opacity || (first === noData && green === noData && blue === noData) ? null : [first, green, blue, opacity];
  };
  const coordinateAt = (column: number, row: number) => unproject([west + column * (east - west), north - row * (north - south)]);
  let valid = 0, inside = 0;
  for (let row = 0; row < 120; row++) {
    for (let column = 0; column < 120; column++) {
      const coordinate = coordinateAt((column + 0.5) / 120, (row + 0.5) / 120);
      if (!containsPoint(geometry, coordinate as [number, number])) continue;
      inside++;
      if (valuesAt(coordinate)) valid++;
    }
  }
  if (!valid) throw fail("Parselde geçerli raster pikseli bulunamadı.");
  for (let row = 0; row < height; row++) {
    signal.throwIfAborted();
    for (let column = 0; column < width; column++) {
      const values = valuesAt(coordinateAt((column + 0.5) / width, (row + 0.5) / height));
      if (!values) continue;
      const position = (row * width + column) * 4;
      if (kind === "ortho") png.data.set(values, position);
      else {
        const packed = Math.round((values[0]! + terrainEncodingOffset) * 100);
        png.data.set([packed >> 16, (packed >> 8) & 255, packed & 255, 255], position);
      }
    }
  }
  const [cx, cy] = transform.forward(frame.center as [number, number]);
  const dx = (maxX! - minX!) / base.getWidth(), dy = (maxY! - minY!) / base.getHeight();
  const nativeM = epsg === 4326 ? Math.max(Math.abs(project([cx + dx, cy])[0] - project([cx, cy])[0]),
    Math.abs(project([cx, cy + dy])[1] - project([cx, cy])[1])) * frame.ground : Math.max(dx, dy);
  return {
    bytes: png.encode(),
    metadata: {
      bounds, width, height, epsg, coverage: valid / inside,
      nativeResolutionM: nativeM,
      displayResolutionM: Math.max(nativeM, frame.ground * Math.max((east - west) / width, (north - south) / height),
        nativeM * Math.max(base.getWidth() / sourceWidth, base.getHeight() / sourceHeight)),
      ...(kind === "dtm" ? { offsetM: terrainEncodingOffset } : {}),
    },
  };
}

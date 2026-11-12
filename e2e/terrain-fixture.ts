// Classic little-endian tiled TIFF for deterministic isolated tests.
export function terrainFixture({ dtm = false, invalidCrs = false, transparent = false } = {}) {
  const size = 32, channels = dtm ? 1 : 4;
  const data = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * channels;
      if (dtm) data[i] = 170 + Math.floor(x / 2);
      else data.set([90 + x * 2, 110 + Math.floor(y / 5) * 10, 57, transparent ? 0 : 255], i);
    }
  }
  const entries: [number, number, number[]][] = [
    [256, 4, [size]], [257, 4, [size]], [258, 3, Array(channels).fill(8)],
    [259, 3, [1]], [262, 3, [dtm ? 1 : 2]], [277, 3, [channels]], [284, 3, [1]],
    [322, 4, [size]], [323, 4, [size]], [324, 4, [0]], [325, 4, [data.length]],
    ...(dtm ? [] : [[338, 3, [2]] as [number, number, number[]]]),
    [33550, 12, [0.000046875, 0.000046875, 0]],
    [33922, 12, [0, 0, 0, 27.49975, 38.50125, 0]],
    [34735, 3, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, invalidCrs ? 4269 : 4326]],
  ];
  const buffer = Buffer.alloc(2048 + data.length);
  buffer.write("II");
  buffer.writeUInt16LE(42, 2);
  buffer.writeUInt32LE(8, 4);
  buffer.writeUInt16LE(entries.length, 8);
  let outside = 10 + entries.length * 12 + 4;
  entries.forEach(([tag, type, numbers], i) => {
    const entry = 10 + i * 12, bytes = type === 12 ? 8 : type === 4 ? 4 : 2;
    buffer.writeUInt16LE(tag, entry);
    buffer.writeUInt16LE(type, entry + 2);
    buffer.writeUInt32LE(numbers.length, entry + 4);
    const size = numbers.length * bytes;
    const offset = size <= 4 ? entry + 8 : outside;
    if (size > 4) { buffer.writeUInt32LE(outside, entry + 8); outside += size; }
    numbers.forEach((value, index) => {
      const at = offset + index * bytes;
      if (type === 12) buffer.writeDoubleLE(value, at);
      else if (type === 4) buffer.writeUInt32LE(tag === 324 ? 2048 : value, at);
      else buffer.writeUInt16LE(value, at);
    });
  });
  data.copy(buffer, 2048);
  return buffer;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { hlsClear, hlsReflectance } from './public-observations.js';

test('HLS Fmask rejects clouds, adjacency, shadow, snow, high aerosol and fill', () => {
  for (const bit of [2, 4, 8, 16, 192, 255, null, undefined, -1]) assert.equal(hlsClear(bit), false);
  for (const bit of [0, 32, 64, 128, 160]) assert.equal(hlsClear(bit), true);
  assert.equal(hlsReflectance(0), 0);
  assert.equal(hlsReflectance(3000), 0.3);
  for (const value of [-9999, 12000, null, undefined, Infinity]) assert.equal(hlsReflectance(value), null);
});

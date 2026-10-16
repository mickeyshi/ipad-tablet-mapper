import test from 'node:test';
import assert from 'node:assert/strict';
import { mapToMonitor, fromMonitor } from '../lib/coordinates.mjs';

test('surface corners map to inclusive monitor pixels, never the adjacent monitor', () => {
  const screen = { left: 0, top: 0, width: 2560, height: 1440 };
  assert.deepEqual(mapToMonitor(0, 0, screen), { x: 0, y: 0 });
  assert.deepEqual(mapToMonitor(1, 1, screen), { x: 2559, y: 1439 });
  assert.deepEqual(mapToMonitor(3, -1, screen), { x: 2559, y: 0 });
  for (let i = 0; i <= 10000; i++) {
    const point = mapToMonitor(i / 10000, i / 10000, screen);
    assert.ok(point.x >= 0 && point.x < 2560 && point.y >= 0 && point.y < 1440);
  }
});
test('monitor offsets apply consistently to drawing and cursor feedback', () => {
  const screen = { left: -2560, top: -100, width: 2560, height: 1440 };
  assert.deepEqual(mapToMonitor(1, 1, screen), { x: -1, y: 1339 });
  assert.deepEqual(fromMonitor(-1, 1339, screen), { x: 1, y: 1 });
  assert.ok(fromMonitor(0, 0, screen).x > 1, 'cursor on another monitor must not appear inside surface');
});

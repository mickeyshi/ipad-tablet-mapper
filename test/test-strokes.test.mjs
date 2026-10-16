import test from 'node:test';
import assert from 'node:assert/strict';
import { testStroke } from '../lib/reference-paths.mjs';

test('reference circle is closed, has constant pressure, and stays on the monitor', () => {
  for (const screen of [{ width: 2560, height: 1440 }, { width: 320, height: 200 }]) {
    const samples = testStroke(screen, 'circle');
    assert.equal(samples[0].phase, 'down');
    assert.equal(samples.at(-1).phase, 'up');
    const cx = (screen.width - 1) / 2, cy = (screen.height - 1) / 2;
    const radius = Math.hypot(samples[0].x - cx, samples[0].y - cy);
    for (const point of samples.slice(0, -1)) {
      assert.ok(Math.abs(Math.hypot(point.x - cx, point.y - cy) - radius) < 1e-9);
      assert.equal(point.pressure, 0.6);
      assert.ok(point.x >= 0 && point.x < screen.width && point.y >= 0 && point.y < screen.height);
    }
    assert.ok(Math.hypot(samples[0].x - samples.at(-1).x, samples[0].y - samples.at(-1).y) < 1e-9);
  }
});
test('pressure wave tapers at both ends and peaks at its midpoint', () => {
  const samples = testStroke({ width: 2560, height: 1440 }, 'wave');
  assert.equal(samples[0].pressure, 0.1);
  assert.equal(samples[60].pressure, 1);
  assert.ok(Math.abs(samples.at(-2).pressure - 0.1) < 1e-9);
  assert.equal(samples.at(-1).pressure, 0);
});

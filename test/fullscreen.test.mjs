import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSurface, fullscreenController } from '../public/fullscreen.js';

test('16:9 surface maximizes available iPad area in landscape and portrait', () => {
  for (const [width, height] of [[1194, 834], [834, 1194], [2560, 1440]]) {
    const size = fitSurface(width, height, 2560 / 1440);
    assert.ok(size.width <= width && size.height <= height);
    assert.ok(Math.abs(size.width / size.height - 16 / 9) < 1e-9);
    assert.ok(Math.abs(size.width - width) < 1e-9 || Math.abs(size.height - height) < 1e-9);
  }
});
test('native full-screen entry, system exit, and rejected request keep layout state consistent', async () => {
  const doc = new EventTarget(), changes = [];
  const target = { async requestFullscreen() { doc.fullscreenElement = target; doc.dispatchEvent(new Event('fullscreenchange')); } };
  doc.exitFullscreen = async () => { doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange')); };
  const controller = fullscreenController(doc, target, value => changes.push(value));
  await controller.enter(); assert.equal(controller.active(), true);
  await doc.exitFullscreen(); assert.equal(controller.active(), false);
  await controller.enter(); await controller.exit();
  assert.deepEqual(changes, [true, false, true, false]);
  target.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
  await controller.enter(); assert.equal(controller.active(), true, 'fallback still maximizes page drawing area');
  await controller.exit(); assert.equal(controller.active(), false);
});

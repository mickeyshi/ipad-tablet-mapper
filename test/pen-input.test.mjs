import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPenInput } from '../public/pen-input.js';

function harness(mode = 'pointer') {
  const surface = new EventTarget(), globalTarget = new EventTarget(), samples = [];
  surface.setPointerCapture = () => {};
  const input = bindPenInput(surface, globalTarget, (event, phase) => samples.push({ phase, event }), () => mode);
  const fire = (target, type, fields = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'pen', clientX: 10, clientY: 20, pressure: 0.5, ...fields });
    target.dispatchEvent(event);
  };
  return { surface, globalTarget, samples, input, fire };
}
test('rapid strokes survive delayed lost-capture events and pointer ID reuse', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) {
    h.fire(h.surface, 'pointerdown');
    h.fire(h.surface, 'lostpointercapture');
    h.fire(h.globalTarget, 'pointerup');
  }
  assert.deepEqual(h.samples.map(x => x.phase), Array(20).fill(['down', 'up']).flat());
  assert.equal(h.input.active(), false);
});
test('new contact recovers from a missing up without connecting strokes', () => {
  const h = harness();
  h.fire(h.surface, 'pointerdown'); h.fire(h.surface, 'pointerdown'); h.fire(h.globalTarget, 'pointerup');
  assert.deepEqual(h.samples.map(x => x.phase), ['down', 'cancel', 'down', 'up']);
});
test('touch mode captures stylus taps once, preserves force, and ignores fingers and duplicate pointers', () => {
  const h = harness('touch');
  const stylus = { identifier: 8, touchType: 'stylus', clientX: 10, clientY: 20, force: 0.7, altitudeAngle: Math.PI / 2, azimuthAngle: 0 };
  h.fire(h.surface, 'touchstart', { changedTouches: [{ ...stylus, touchType: 'direct' }] });
  for (let i = 0; i < 20; i++) {
    h.fire(h.surface, 'pointerdown');
    h.fire(h.surface, 'touchstart', { changedTouches: [stylus] });
    h.fire(h.globalTarget, 'touchend', { changedTouches: [stylus] });
  }
  assert.equal(h.samples.length, 40);
  assert.equal(h.samples[0].event.pressure, 0.7);
  assert.equal(h.samples[1].event.pressure, 0);
  assert.ok(Math.abs(h.samples[0].event.tiltX) < 0.001);
});

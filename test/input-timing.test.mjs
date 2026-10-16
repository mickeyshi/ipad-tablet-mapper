import test from 'node:test';
import assert from 'node:assert/strict';
import { InputTiming } from '../public/input-timing.js';

test('input timing reports browser event age and intra-stroke cadence separately', () => {
  const timing = new InputTiming();
  timing.record('down', 100, 104, 0);
  timing.record('move', 108, 113, 0);
  timing.record('move', 116, 122, 0);
  timing.record('up', 124, 128, 0);
  timing.record('down', 5000, 5004, 0);
  timing.record('move', 5008, 5012, 0);
  assert.deepEqual(timing.summary(), { ageP95: 6, gapP95: 8 });
});
test('epoch-based timestamps normalize to the browser clock and invalid ages are omitted', () => {
  const timing = new InputTiming(), origin = 1700000000000;
  timing.record('down', origin + 100, 105, origin);
  timing.record('move', origin + 110, 115, origin);
  timing.record('up', NaN, 120, origin);
  assert.deepEqual(timing.summary(), { ageP95: 5, gapP95: 10 });
  timing.reset();
  assert.deepEqual(timing.summary(), { ageP95: null, gapP95: null });
});

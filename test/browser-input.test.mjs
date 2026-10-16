import test from 'node:test';
import assert from 'node:assert/strict';

test('browser sends an entire stroke before a visual frame and avoids per-move layout reads', async t => {
  const names = ['document', 'window', 'location', 'navigator', 'WebSocket', 'requestAnimationFrame', 'setInterval', 'devicePixelRatio'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => { for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const frames = [], sent = [], draws = [];
  const ctx = new Proxy({}, { get: (_, key) => (...args) => { if (['stroke', 'fill'].includes(key)) draws.push(args); } });
  class Element extends EventTarget {
    constructor() { super(); this.style = {}; this.classList = { toggle() {} }; this.checked = false; this.value = ''; this.reads = 0; }
    getBoundingClientRect() { this.reads++; return { left: 0, top: 0, width: 1000, height: 700 }; }
    getContext() { return ctx; }
    setPointerCapture() {}
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const doc = new Element(); doc.getElementById = get;
  doc.body = new Element(); doc.documentElement = new Element();
  doc.documentElement.requestFullscreen = async () => { doc.fullscreenElement = doc.documentElement; doc.dispatchEvent(new Event('fullscreenchange')); };
  doc.exitFullscreen = async () => { doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange')); };
  get('captureMode').value = 'pointer'; get('showPreview').checked = true;
  let socket;
  class Socket {
    static OPEN = 1;
    constructor() { socket = this; this.readyState = 1; this.bufferedAmount = 0; }
    send(data) { sent.push(JSON.parse(data)); }
  }
  const browserWindow = new EventTarget();
  const replacements = {
    document: doc, window: browserWindow, location: { hash: '#test', protocol: 'http:', host: 'localhost:8787', hostname: 'localhost' },
    navigator: { maxTouchPoints: 0, userAgent: 'test' }, WebSocket: Socket,
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; }, setInterval: () => 0, devicePixelRatio: 1,
  };
  for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  await import('../public/app.js');
  socket.onmessage({ data: JSON.stringify({ type: 'state', armed: true, testing: false, message: 'Live input enabled' }) });
  function fire(target, type, x) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'pen', clientX: x, clientY: 100, pressure: type === 'pointerup' ? 0 : 0.5, tiltX: 0, tiltY: 0 });
    target.dispatchEvent(event);
  }
  fire(get('surface'), 'pointerdown', 10);
  for (let i = 0; i < 100; i++) fire(get('surface'), 'pointermove', 11 + i);
  fire(browserWindow, 'pointerup', 111);
  assert.equal(sent.length, 102);
  assert.equal(sent[0].phase, 'down'); assert.equal(sent.at(-1).phase, 'up');
  assert.deepEqual(sent.map(point => point.sequence), Array.from({ length: 102 }, (_, i) => i + 1));
  assert.equal(draws.length, 0, 'preview must not render in the input handler');
  assert.equal(frames.length, 1, 'visual work coalesces into one pending frame');
  assert.equal(get('surface').reads, 2, 'geometry is read during fit and contact start, never on moves');
  frames[0](); assert.ok(draws.length > 0);
  await get('fullscreen').onclick();
  assert.equal(get('fullscreenControls').hidden, false);
  assert.equal(get('surface').style.width, '1000px');
  assert.equal(get('surface').style.height, '562.5px');
  assert.equal(sent.at(-1).type, 'stop', 'changing surface geometry releases input');
  await get('fullscreenExit').onclick();
  assert.equal(get('fullscreenControls').hidden, true);
  assert.equal(doc.fullscreenElement, null);
});

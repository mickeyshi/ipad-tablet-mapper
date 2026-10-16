import { bindPenInput } from './pen-input.js';
import { InputTiming } from './input-timing.js';
import { fitSurface, fullscreenController } from './fullscreen.js';
const $ = id => document.getElementById(id);
const surface = $('surface'), canvas = $('preview'), ctx = canvas.getContext('2d');
let ws, armed = false, testing = false, ready = false, previous = null;
let captured = 0, sent = 0, injected = 0, stroke = 0, pipeDelay = 0;
let positionOnly = false, samplesSent = 0, processed = 0, networkRtt = null;
let rejected = 0, recoveries = 0;
let screen = { width: 1920, height: 1080 }, sampleCount = 0, sampleRate = 0, latest;
let fullscreenMode = false;
const token = location.hash.slice(1);
if (navigator.maxTouchPoints > 0 && /iPad|iPhone|Macintosh/.test(navigator.userAgent)) $('captureMode').value = 'touch';
const penInput = bindPenInput(surface, window, sample, () => $('captureMode').value);
const timing = new InputTiming();
let surfaceBox, visualFrame = null, previewQueue = [], contactPoint = null, desktopPoint = null;
const previewEnabled = $('showPreview');
const fullscreen = fullscreenController(document, document.documentElement, active => {
  fullscreenMode = active;
  document.body.classList.toggle('drawing-fullscreen', active);
  $('fullscreenControls').hidden = !active;
  fit();
});
function scheduleVisuals() {
  if (visualFrame !== null) return;
  visualFrame = requestAnimationFrame(paintVisuals);
}
function paintVisuals() {
  visualFrame = null;
  if (desktopPoint) marker('desktopCursor', desktopPoint);
  if (contactPoint) marker('contactCursor', contactPoint);
  for (const point of previewQueue) {
    if (point.phase === 'down') previous = null;
    const current = { x: point.x * surfaceBox.width, y: point.y * surfaceBox.height };
    if (point.phase !== 'up' && point.phase !== 'cancel') {
      ctx.strokeStyle = '#23394b'; ctx.fillStyle = '#23394b'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 1 + point.pressure * 7;
      if (previous) { ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(current.x, current.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    previous = point.phase === 'up' || point.phase === 'cancel' ? null : current;
  }
  previewQueue = [];
}
function resetVisuals() {
  previewQueue = []; previous = null; contactPoint = { visible: false };
  scheduleVisuals();
}
function marker(id, point) {
  const el = $(id);
  const visible = point.visible !== false && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
  el.hidden = !visible;
  if (visible) { el.style.left = `${point.x * 100}%`; el.style.top = `${point.y * 100}%`; }
}
function showPairing(links) {
  if (!links.length) { $('message').textContent = 'No local network address found. Connect Windows to Wi-Fi and restart.'; return; }
  const select = $('network');
  select.replaceChildren();
  for (const link of links) {
    const option = document.createElement('option'); option.textContent = link.address; select.append(option);
  }
  function update() {
    const link = links[select.selectedIndex];
    $('pairingQr').src = link.qr; $('pairingLink').href = link.url;
  }
  select.onchange = update; update(); $('pairing').hidden = false; fit();
}
function fit() {
  if (armed || testing) stop();
  penInput.reset(); previous = null;
  const box = $('workspace').getBoundingClientRect(), ratio = screen.width / screen.height;
  const size = fitSurface(box.width, box.height, ratio, fullscreenMode ? 0 : 12);
  surface.style.width = `${size.width}px`; surface.style.height = `${size.height}px`;
  canvas.width = Math.round(size.width * devicePixelRatio); canvas.height = Math.round(size.height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  surfaceBox = surface.getBoundingClientRect();
  resetVisuals();
}
function send(value) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > 32768) {
    setArmed(false); penInput.reset(); ws.close();
    $('message').textContent = 'Connection fell behind. Reconnect before drawing.'; return false;
  }
  ws.send(JSON.stringify(value)); return true;
}
function setArmed(value) {
  armed = value; surface.classList.toggle('live', value);
  $('arm').textContent = value ? 'Drawing enabled' : 'Enable drawing';
  $('fullscreenArm').textContent = value ? 'Drawing enabled' : 'Enable drawing';
}
function stop() { send({ type: 'stop' }); setArmed(false); testing = false; penInput.reset(); resetVisuals(); }
function connect() {
  if (!token) { $('connection').textContent = 'Pairing link required'; $('message').textContent = 'Open the complete URL printed by the Windows server, including the # code.'; return; }
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/input?token=${encodeURIComponent(token)}`);
  ws.onopen = () => { $('connection').textContent = 'Connected'; };
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'cursor') { desktopPoint = msg; scheduleVisuals(); }
    if (msg.type === 'delivery') { processed = msg.processed; rejected = msg.rejected || 0; recoveries = msg.recoveries || 0; }
    if (msg.type === 'pong') networkRtt = Math.round(performance.now() - msg.echo);
    if (msg.type === 'stroke') { injected++; pipeDelay = msg.pipeDelayMs; }
    if (msg.type === 'pairing') showPairing(msg.links);
    if (msg.type === 'hello') {
      screen = msg.screen; ready = msg.bridgeReady;
      $('arm').disabled = !ready; $('test').disabled = !ready;
      $('fullscreenArm').disabled = !ready;
      $('test').hidden = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
      $('testPatternLabel').hidden = $('test').hidden;
      $('connection').textContent = msg.diagnostic ? 'Connected · diagnostics only' : ready ? 'Connected · Windows pen ready' : 'Connected · waiting for Windows pen';
      fit();
    }
    if (msg.type === 'state') { setArmed(msg.armed); testing = !!msg.testing; $('message').textContent = msg.message; }
    if (msg.type === 'notice') $('message').textContent = msg.message;
  };
  ws.onclose = () => { setArmed(false); testing = false; penInput.reset(); $('arm').disabled = true; $('fullscreenArm').disabled = true; $('test').disabled = true; $('connection').textContent = 'Disconnected · reload to reconnect'; };
  ws.onerror = () => { $('message').textContent = 'Connection failed. Check the server, Wi-Fi, and Windows firewall.'; };
}
function sample(event, phase) {
  if (phase === 'down') { captured++; stroke++; surfaceBox = surface.getBoundingClientRect(); }
  const box = surfaceBox;
  const point = { type: 'sample', phase, stroke, sequence: samplesSent + 1, x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)), pressure: event.pressure, tiltX: event.tiltX || 0, tiltY: event.tiltY || 0, timestamp: event.timeStamp };
  latest = point; sampleCount++;
  // Send immediately. Rendering and timing summaries never gate input delivery.
  if (positionOnly) {
    if (armed && phase !== 'cancel') send({ type: 'position', x: point.x, y: point.y });
  } else if (armed && send(point)) { samplesSent++; if (phase === 'down') sent++; }
  timing.record(phase, event.timeStamp, performance.now(), performance.timeOrigin);
  contactPoint = phase === 'up' || phase === 'cancel' ? { visible: false } : point;
  if (!positionOnly && previewEnabled.checked) {
    // Bound preview work only; every real sample has already been sent above.
    if (previewQueue.length >= 2048) { previewQueue = []; previous = null; }
    previewQueue.push(point);
  }
  scheduleVisuals();
}
surface.addEventListener('contextmenu', event => event.preventDefault());
$('arm').onclick = () => { if (penInput.active()) { $('message').textContent = 'Lift the Pencil before enabling drawing.'; return; } captured = sent = injected = samplesSent = processed = 0; timing.reset(); send({ type: 'arm' }); };
$('position').onclick = () => {
  if (penInput.active()) { $('message').textContent = 'Lift the Pencil before changing modes.'; return; }
  positionOnly = !positionOnly;
  resetVisuals();
  $('position').setAttribute('aria-pressed', String(positionOnly));
  $('position').textContent = positionOnly ? 'Position only: on' : 'Position only: off';
  $('fullscreenPosition').textContent = $('position').textContent;
  $('fullscreenPosition').setAttribute('aria-pressed', String(positionOnly));
  $('message').textContent = positionOnly ? 'With input enabled, touch or slide the Pencil to position the desktop cursor without drawing.' : 'Draw mode: touching down starts a stroke.';
};
$('captureMode').onchange = () => { stop(); captured = sent = injected = 0; $('message').textContent = 'Capture mode changed. Enable drawing to test it.'; };
$('stop').onclick = stop;
$('fullscreen').onclick = () => fullscreen.toggle();
$('fullscreenExit').onclick = () => fullscreen.exit();
$('fullscreenArm').onclick = $('arm').onclick;
$('fullscreenPosition').onclick = $('position').onclick;
$('fullscreenStop').onclick = stop;
$('test').onclick = () => { stop(); send({ type: 'test', pattern: $('testPattern').value }); };
$('clear').onclick = () => { resetVisuals(); ctx.clearRect(0, 0, canvas.width, canvas.height); };
previewEnabled.onchange = resetVisuals;
function suspend() { if (armed || testing) stop(); penInput.reset(); previous = null; }
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
window.addEventListener('pagehide', suspend);
window.addEventListener('resize', fit);
window.addEventListener('keydown', event => { if (event.key === 'Escape') { stop(); if (fullscreen.active()) fullscreen.exit(); } });
setInterval(() => send({ type: 'heartbeat', echo: performance.now() }), 500);
setInterval(() => { sampleRate = sampleCount; sampleCount = 0; }, 1000);
setInterval(() => {
  $('strokes').textContent = `Captured ${captured} · Sent ${sent} · Injected ${injected} · Windows pipe ${pipeDelay} ms`;
  $('delivery').textContent = `Samples sent ${samplesSent} · Windows ${processed} · Rejected ${rejected} · Pen resets ${recoveries} · Network RTT ${networkRtt === null ? '—' : networkRtt + ' ms'}`;
  if (latest) $('metrics').textContent = `Pressure ${latest.pressure.toFixed(3)} · Tilt ${latest.tiltX}°, ${latest.tiltY}° · ${sampleRate} samples/s · ${latest.phase}`;
}, 100);
setInterval(() => {
  const summary = timing.summary();
  const ms = value => value === null ? '—' : `${value.toFixed(1)} ms`;
  $('captureTiming').textContent = `Event age p95 ${ms(summary.ageP95)} · Sample gap p95 ${ms(summary.gapP95)}`;
}, 1000);
fit(); connect();

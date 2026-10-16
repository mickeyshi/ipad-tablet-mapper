import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { acceptWebSocket } from './lib/websocket.mjs';
import { pairingCodes } from './lib/pairing.mjs';
import { testStroke } from './lib/reference-paths.mjs';
import { mapToMonitor, fromMonitor } from './lib/coordinates.mjs';

const port = Number(process.env.PORT || 8787);
const token = randomBytes(16).toString('hex');
const diagnostic = process.argv.includes('--diagnostic');
const peers = new Set();
let owner = null, lastHeartbeat = 0, testTimer, testInterval, testing = false;
let bridgeReady = false, screen = { width: 1920, height: 1080 }, bridge;
const broadcast = value => { for (const peer of peers) peer.send(value); };
const command = value => {
  if (!bridgeReady) return;
  if (bridge.stdin.writableLength > 65536) { disarm('Input queue exceeded limit'); return; }
  bridge.stdin.write(JSON.stringify({ ...value, sentAt: Date.now() }) + '\n');
};
function disarm(reason = 'Stopped') {
  clearTimeout(testTimer); clearInterval(testInterval); testing = false;
  // A release bypasses the ordinary queue guard.
  if (bridgeReady) bridge.stdin.write('{"type":"release"}\n');
  owner = null;
  broadcast({ type: 'state', armed: false, message: reason });
}
if (!diagnostic) {
  bridge = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./native/bridge.ps1', import.meta.url))], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  createInterface({ input: bridge.stdout }).on('line', line => {
    try {
      const message = JSON.parse(line);
      if (message.type === 'ready') {
        bridgeReady = true; screen = { width: message.width, height: message.height, left: message.left, top: message.top };
        console.log(`Windows pen ready. Primary monitor: ${screen.width} × ${screen.height}`);
        console.log(`Physical bounds: (${screen.left}, ${screen.top}) through (${screen.left + screen.width - 1}, ${screen.top + screen.height - 1}); virtual origin: (${message.virtualLeft}, ${message.virtualTop})`);
        console.log('Pen process: ' + message.security);
        if (message.security?.includes('Restricted=True')) console.warn('Restricted launch context detected. If injection is denied, open Start-Tablet.cmd from File Explorer.');
        broadcast({ type: 'hello', screen, bridgeReady, diagnostic });
      } else if (message.type === 'stroke') {
        owner?.send(message);
      } else if (message.type === 'status') {
        broadcast({ type: 'cursor', ...fromMonitor(message.x, message.y, screen), visible: message.cursorAvailable, penDown: message.penDown });
        owner?.send({ type: 'delivery', processed: message.processed, sequence: message.sequence, rejected: message.rejected, recoveries: message.recoveries });
      } else if (message.type === 'recovery') {
        console.error('Pen recovery:', message.details);
        broadcast({ type: 'notice', message: message.message });
      } else if (message.type === 'error') {
        console.error('Pen bridge:', message.message);
        bridgeReady = false;
        disarm(message.message);
        broadcast({ type: 'hello', screen, bridgeReady, diagnostic });
      }
    } catch { console.error('Bridge output:', line); }
  });
  bridge.stderr.on('data', data => console.error(String(data)));
  bridge.on('error', error => { bridgeReady = false; disarm(error.message); });
  bridge.stdin.on('error', () => {});
  bridge.on('exit', () => { bridgeReady = false; disarm('Pen bridge exited; restart the server'); });
}
function runStroke(pattern) {
  let step = 0;
  const samples = testStroke(screen, pattern);
  broadcast({ type: 'notice', message: pattern === 'circle' ? 'Drawing reference circle at constant pressure…' : 'Drawing pressure test…' });
  testInterval = setInterval(() => {
    command(samples[step++]);
    if (step === samples.length) disarm(pattern === 'circle'
      ? 'Reference circle complete. Compare its contour with an iPad-drawn circle.'
      : 'Pressure test complete. Check whether the stroke widens in the middle.');
  }, 10);
}
const files = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'], '/pen-input.js': ['public/pen-input.js', 'text/javascript'], '/input-timing.js': ['public/input-timing.js', 'text/javascript'], '/fullscreen.js': ['public/fullscreen.js', 'text/javascript'], '/style.css': ['public/style.css', 'text/css'] };
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  const file = files[path];
  if (!file) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws:; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'" }); res.end(body);
  } catch { res.writeHead(500).end(); }
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://local');
  let sameOrigin = false;
  try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch {}
  if (url.pathname !== '/input' || url.searchParams.get('token') !== token || !sameOrigin || peers.size >= 4) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  let peer;
  peer = acceptWebSocket(req, socket, head, raw => {
    let msg; try { msg = JSON.parse(raw); } catch { peer.close(); return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'heartbeat') {
      if (owner === peer) lastHeartbeat = Date.now();
      if (Number.isFinite(msg.echo)) peer.send({ type: 'pong', echo: msg.echo });
      return;
    }
    if (msg.type === 'stop') { disarm(); return; }
    if (msg.type === 'arm' || msg.type === 'test') {
      if (owner && owner !== peer) { peer.send({ type: 'notice', message: 'Another device controls the pen. Stop it first.' }); return; }
      if (!bridgeReady) { peer.send({ type: 'notice', message: diagnostic ? 'Diagnostic mode: no Windows input.' : 'Windows pen bridge is not ready.' }); return; }
      if (msg.type === 'test' && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress)) return;
      disarm(); owner = peer; lastHeartbeat = Date.now();
      peer.send({ type: 'state', armed: msg.type === 'arm', testing: msg.type === 'test', message: msg.type === 'arm' ? 'Live input enabled' : 'Test in 8 seconds: focus your drawing app with the canvas centered on the primary monitor.' });
      if (msg.type === 'test') {
        testing = true;
        const pattern = msg.pattern === 'circle' ? 'circle' : 'wave';
        testTimer = setTimeout(() => runStroke(pattern), 8000);
      }
      return;
    }
    if (owner !== peer || testing) return;
    if (msg.type === 'position' && [msg.x, msg.y].every(Number.isFinite)) {
      lastHeartbeat = Date.now();
      command({ type: 'position', ...mapToMonitor(msg.x, msg.y, screen) });
      return;
    }
    if (msg.type !== 'sample') return;
    if (!['down', 'move', 'up', 'cancel'].includes(msg.phase)) return;
    if (![msg.x, msg.y, msg.pressure, msg.tiltX, msg.tiltY].every(Number.isFinite)) { disarm('Invalid input sample'); return; }
    lastHeartbeat = Date.now();
    command({ phase: msg.phase, ...mapToMonitor(msg.x, msg.y, screen), pressure: msg.pressure, tiltX: msg.tiltX, tiltY: msg.tiltY, stroke: Number.isSafeInteger(msg.stroke) ? msg.stroke : 0, sequence: Number.isSafeInteger(msg.sequence) && msg.sequence > 0 ? msg.sequence : 0 });
  }, () => { peers.delete(peer); if (owner === peer) disarm('Controller disconnected'); });
  if (peer) {
    peers.add(peer); peer.send({ type: 'hello', screen, bridgeReady, diagnostic });
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress)) {
      pairingCodes(networkInterfaces(), server.address().port, token)
        .then(links => { if (peers.has(peer)) peer.send({ type: 'pairing', links }); })
        .catch(error => { console.error('QR code:', error.message); peer.send({ type: 'notice', message: 'QR code unavailable. Use the iPad link printed in the terminal.' }); });
    }
  }
});
setInterval(() => { if (owner && Date.now() - lastHeartbeat > 2000) disarm('Controller timed out'); }, 250).unref();
setInterval(() => { if (bridgeReady && peers.size && !testing && bridge.stdin.writableLength < 4096) command({ type: 'status' }); }, 50).unref();
server.listen(port, '0.0.0.0', () => {
  const actualPort = server.address().port;
  console.log(`Desktop: http://localhost:${actualPort}/#${token}`);
  for (const entries of Object.values(networkInterfaces())) for (const ip of entries || []) {
    if (ip.family === 'IPv4' && !ip.internal) console.log(`iPad:    http://${ip.address}:${actualPort}/#${token}`);
  }
  console.log('Keep this terminal running. Ctrl+C stops the server and releases the pen.');
});
server.on('error', error => { console.error(error.message); shutdown(); });
let stopping = false;
function shutdown() {
  if (stopping) return; stopping = true;
  disarm('Server stopping');
  if (bridge) bridge.stdin.end();
  for (const peer of peers) peer.close();
  server.close();
  setTimeout(() => { bridge?.kill(); process.exit(); }, 1500).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

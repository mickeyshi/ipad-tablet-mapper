import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createConnection } from 'node:net';

test('diagnostic server: pairing, HTTP, origin checks, and fragmented WebSocket input', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, ['server.mjs', '--diagnostic'], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let output = '';
  const link = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + output)), 5000);
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/Desktop: (http:\/\/localhost:\d+\/#\w+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on('error', reject);
  });
  const url = new URL(link), port = Number(url.port), token = url.hash.slice(1);
  const response = await fetch(url.origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Enable drawing/);
  assert.equal((await fetch(url.origin + '/native/Pen.cs')).status, 404);
  async function rejected(path, origin) {
    const socket = createConnection({ host: '127.0.0.1', port });
    t.after(() => socket.destroy());
    await once(socket, 'connect');
    socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost:${port}\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    const [data] = await once(socket, 'data');
    assert.match(String(data), /403 Forbidden/); socket.destroy();
  }
  await rejected('/input?token=wrong', url.origin);
  await rejected('/input?token=' + token, 'http://other-site.example');
  const socket = createConnection({ host: '127.0.0.1', port });
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  let bytes = Buffer.alloc(0), handshake = true;
  const messages = [], pending = [];
  socket.on('data', data => {
    bytes = Buffer.concat([bytes, data]);
    if (handshake) {
      const end = bytes.indexOf('\r\n\r\n'); if (end < 0) return;
      assert.match(bytes.subarray(0, end).toString(), /101 Switching Protocols/);
      bytes = bytes.subarray(end + 4); handshake = false;
    }
    while (bytes.length >= 2 && bytes[0] === 129) {
      let length = bytes[1], offset = 2;
      if (length === 126) { if (bytes.length < 4) return; length = bytes.readUInt16BE(2); offset = 4; }
      if (bytes.length < offset + length) return;
      const message = JSON.parse(bytes.subarray(offset, offset + length)); bytes = bytes.subarray(offset + length);
      if (pending.length) pending.shift()(message); else messages.push(message);
    }
  });
  const next = () => messages.length ? Promise.resolve(messages.shift()) : new Promise(resolve => pending.push(resolve));
  function send(text, opcode = 1, fin = true) {
    const data = Buffer.from(text), mask = Buffer.from([1, 2, 3, 4]);
    const header = Buffer.from([(fin ? 128 : 0) | opcode, 128 | data.length]);
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    socket.write(Buffer.concat([header, mask, data]));
  }
  socket.write(`GET /input?token=${token} HTTP/1.1\r\nHost: localhost:${port}\r\nOrigin: ${url.origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
  const hello = await next(); assert.equal(hello.diagnostic, true); assert.equal(hello.bridgeReady, false);
  const pairing = await next();
  assert.equal(pairing.type, 'pairing');
  assert.ok(Array.isArray(pairing.links));
  for (const link of pairing.links) {
    assert.equal(new URL(link.url).hash, '#' + token);
    assert.equal(new URL(link.url).port, String(port));
    assert.match(link.qr, /^data:image\/png;base64,/);
  }
  send('{"type":', 1, false); send('"arm"}', 0, true);
  assert.match((await next()).message, /Diagnostic mode/);
  send('{"type":"heartbeat","echo":1234}');
  assert.deepEqual(await next(), { type: 'pong', echo: 1234 });
  send('{"type":"stop"}'); assert.equal((await next()).armed, false);
  send('not json'); await once(socket, 'close');
});

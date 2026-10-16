import { createHash } from 'node:crypto';

// Small RFC 6455 server: masked client frames, fragmentation, ping, and size limits.
export function acceptWebSocket(req, socket, head, onMessage, onClose) {
  const key = req.headers['sec-websocket-key'];
  if (req.headers['sec-websocket-version'] !== '13' || !key || Buffer.from(key, 'base64').length !== 16) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return;
  }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  let buffer = Buffer.alloc(0), fragments = [], fragmentBytes = 0, fragmented = false, closed = false;
  function frame(opcode, payload) {
    if (closed || socket.destroyed) return;
    const data = Buffer.from(payload);
    const header = Buffer.alloc(data.length < 126 ? 2 : 4);
    header[0] = 0x80 | opcode;
    if (data.length < 126) header[1] = data.length;
    else { header[1] = 126; header.writeUInt16BE(data.length, 2); }
    if (socket.writableLength > 65536) { socket.destroy(); return; }
    socket.write(Buffer.concat([header, data]));
  }
  function finish() { if (!closed) { closed = true; onClose(); } }
  function consume(chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const fin = !!(buffer[0] & 128), opcode = buffer[0] & 15;
      let length = buffer[1] & 127, offset = 2;
      if ((buffer[0] & 112) || !(buffer[1] & 128) || length === 127) { socket.destroy(); return; }
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      if (length > 16384 || (opcode >= 8 && (!fin || length > 125))) { socket.destroy(); return; }
      if (buffer.length < offset + 4 + length) return;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
      buffer = buffer.subarray(offset + 4 + length);
      for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
      if (opcode === 8) { frame(8, payload); socket.end(); return; }
      if (opcode === 9) { frame(10, payload); continue; }
      if (opcode === 10) continue;
      if ((opcode !== 0 && opcode !== 1) || (opcode === 0 && !fragmented) || (opcode === 1 && fragmented)) { socket.destroy(); return; }
      fragmented = !fin;
      fragments.push(payload); fragmentBytes += payload.length;
      if (fragmentBytes > 16384) { socket.destroy(); return; }
      if (fin) {
        const message = Buffer.concat(fragments).toString('utf8'); fragments = []; fragmentBytes = 0;
        onMessage(message);
      }
    }
  }
  socket.on('data', consume);
  socket.on('error', finish); socket.on('close', finish);
  const peer = { send: value => frame(1, JSON.stringify(value)), close: () => socket.destroy() };
  // Defer head processing until the caller has stored the returned peer.
  if (head.length) queueMicrotask(() => consume(head));
  return peer;
}

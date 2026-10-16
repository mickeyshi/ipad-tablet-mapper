import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { pairingCodes } from '../lib/pairing.mjs';

test('pairing QR decodes to the complete LAN URL including the session hash', async () => {
  const token = '0123456789abcdef0123456789abcdef';
  const links = await pairingCodes({
    loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    wifi: [{ family: 'IPv4', internal: false, address: '10.0.0.91' }, { family: 'IPv6', internal: false, address: 'fe80::1' }],
    duplicate: [{ family: 'IPv4', internal: false, address: '10.0.0.91' }],
  }, 8787, token);
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'http://10.0.0.91:8787/#' + token);
  const png = PNG.sync.read(Buffer.from(links[0].qr.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(decoded, 'QR code must be readable');
  assert.equal(decoded.data, links[0].url);
  assert.deepEqual(await pairingCodes({}, 8787, token), []);
});

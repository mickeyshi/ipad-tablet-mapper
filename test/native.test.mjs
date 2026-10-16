import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('Windows bridge creates a pen with validated native layout and shuts down cleanly', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'native/bridge.ps1'], { windowsHide: true });
  let output = '', errors = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  // Releasing an idle device and EOF must not inject a stroke.
  child.stdin.end('{"type":"release"}\n{"type":"status"}\n');
  const [code] = await once(child, 'close');
  assert.equal(code, 0, errors || output);
  const messages = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.equal(messages.length, 2, output);
  assert.equal(messages[0].type, 'ready');
  assert.ok(messages[0].width > 0 && messages[0].height > 0);
  assert.equal(messages[1].type, 'status', output);
  assert.ok(Number.isFinite(messages[1].x) && Number.isFinite(messages[1].y));
  // Restricted/locked desktops may deny cursor reads; telemetry must still work.
  assert.equal(typeof messages[1].cursorAvailable, 'boolean');
  assert.equal(messages[1].penDown, false);
  assert.equal(messages[1].processed, 0);
});

test('native state machine survives rapid strokes and recovers rejected input without replay', { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'test/run-native-state.ps1'], { windowsHide: true });
  let output = '', errors = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { errors += data; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, errors || output);
  assert.ok(Number(output.trim()) > 10000, output);
});

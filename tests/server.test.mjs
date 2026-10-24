import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, MODEL } from '../server.mjs';

test('static BYOK example serves its complete game and local brand assets', async (t) => {
  const app = await startServer({ port: 0 }); t.after(app.close);
  const config = await (await fetch(`${app.origin}/api/config`)).json();
  assert.deepEqual(config, { byok: true, model: MODEL, inputFps: 24 });
  for (const file of ['/', '/doom/', '/doom/src/d_main.js', '/doom/bridge.mjs', '/doom/deck-input.mjs', '/doom/doom1.wad', '/three/build/three.module.js', '/three/build/three.core.js', '/brand/symbol-wordmark-white.png', '/brand/fonts/aeonik-regular.woff2']) {
    assert.equal((await fetch(app.origin + file)).status, 200, file);
  }
});
test('even with a server environment key there is no token broker or credential fallback', async (t) => {
  const before = process.env.REACTOR_API_KEY;
  process.env.REACTOR_API_KEY = 'owner-key-that-must-not-be-used';
  t.after(() => { if (before === undefined) delete process.env.REACTOR_API_KEY; else process.env.REACTOR_API_KEY = before; });
  const app = await startServer({ port: 0 }); t.after(app.close);
  const config = await (await fetch(`${app.origin}/api/config`)).text();
  assert.ok(!config.includes('owner-key')); assert.ok(!config.includes('configured'));
  const response = await fetch(`${app.origin}/api/token`, { method: 'POST', headers: { 'X-Eden-Client': 'deck' } });
  assert.equal(response.status, 404);
  for (const route of ['/.env', '/doom/%2e%2e%2f.env', '/doom/.env', '/server.mjs']) assert.equal((await fetch(app.origin + route)).status, 404);
});
test('local preview rejects wrong hosts and cross-site requests', async (t) => {
  const app = await startServer({ port: 0 }); t.after(app.close);
  const wrongHost = await new Promise((resolve, reject) => {
    const request = http.request(`${app.origin}/api/config`, { headers: { Host: 'attacker.test' } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(wrongHost, 403);
  assert.equal((await fetch(`${app.origin}/api/config`, { headers: { Origin: 'https://attacker.test' } })).status, 403);
});

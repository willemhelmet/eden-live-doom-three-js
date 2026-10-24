import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, apiUrl, MODEL } from '../server.mjs';

test('only HTTPS origins can receive the server credential', () => {
  assert.equal(apiUrl('https://api.rea.live/'), 'https://api.rea.live');
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/x', 'https://example.com/?x=1']) assert.throws(() => apiUrl(url));
});
test('no-key mode still serves Doom and rejects cloud requests clearly', async (t) => {
  const app = await startServer({ port: 0, key: '' }); t.after(app.close);
  const config = await (await fetch(`${app.origin}/api/config`)).json();
  assert.equal(config.configured, false);
  assert.equal(config.inputFps, 24);
  assert.equal((await fetch(`${app.origin}/doom/`)).status, 200);
  const response = await fetch(`${app.origin}/api/token`, { method: 'POST', headers: { 'X-Eden-Client': 'deck' } });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /REACTOR_API_KEY/);
});
test('the browser receives a single-session scoped token, never the API key', async (t) => {
  let upstream;
  const secret = 'server-only-test-key';
  const app = await startServer({ port: 0, key: secret, fetchImpl: async (url, init) => {
    upstream = { url, init };
    return Response.json({ jwt: 'scoped-test-token', expires_at: 1234 });
  } }); t.after(app.close);
  const config = await (await fetch(`${app.origin}/api/config`)).text();
  assert.ok(!config.includes(secret));
  const response = await fetch(`${app.origin}/api/token`, { method: 'POST', headers: { 'X-Eden-Client': 'deck', Origin: app.origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { jwt: 'scoped-test-token', expires_at: 1234 });
  assert.equal(upstream.init.headers['Reactor-API-Key'], secret);
  const scope = JSON.parse(upstream.init.body).authorization_details[0];
  assert.deepEqual(scope.resources.models.match, [MODEL]);
  assert.equal(scope.constraints.max_sessions, 1);
  assert.equal(scope.constraints.max_session_duration_seconds, 900);
  assert.equal((await fetch(`${app.origin}/api/token`, { method: 'POST', headers: { 'X-Eden-Client': 'deck' } })).status, 429);
});
test('cross-site, wrong-host and static traversal requests cannot reach credentials', async (t) => {
  let calls = 0;
  const app = await startServer({ port: 0, key: 'test', fetchImpl: async () => { calls++; throw Error('Unexpected'); } }); t.after(app.close);
  const wrongHost = await new Promise((resolve, reject) => {
    const request = http.request(`${app.origin}/api/token`, { method: 'POST', headers: { Host: 'attacker.test', 'X-Eden-Client': 'deck' } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(wrongHost, 403);
  for (const headers of [{ 'X-Eden-Client': 'deck', Origin: 'https://attacker.test' }, { 'X-Eden-Client': 'deck', 'Sec-Fetch-Site': 'cross-site' }, {}]) {
    assert.equal((await fetch(`${app.origin}/api/token`, { method: 'POST', headers })).status, 403);
  }
  for (const route of ['/doom/%2e%2e%2f.env', '/.env', '/doom/.env']) assert.equal((await fetch(app.origin + route)).status, 404);
  assert.equal(calls, 0);
});
test('provider errors do not leak upstream error bodies', async (t) => {
  const app = await startServer({ port: 0, key: 'test', fetchImpl: async () => new Response('sensitive-provider-detail', { status: 401 }) }); t.after(app.close);
  const response = await fetch(`${app.origin}/api/token`, { method: 'POST', headers: { 'X-Eden-Client': 'deck' } });
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /401/); assert.ok(!body.includes('sensitive-provider-detail'));
});

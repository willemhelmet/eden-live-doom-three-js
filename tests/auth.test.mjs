import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintToken } from '../src/auth.mjs';

test('BYOK sends a key directly to Reactor for exactly one scoped session', async () => {
  const controller = new AbortController();
  let request;
  const jwt = await mintToken({ apiKey: '  visitor-test-key  ', apiUrl: 'https://api.reactor.inc', signal: controller.signal }, async (url, init) => {
    request = { url, ...init }; return Response.json({ jwt: 'scoped-jwt' });
  });
  assert.equal(jwt, 'scoped-jwt');
  assert.equal(request.url, 'https://api.reactor.inc/tokens');
  assert.equal(request.headers['Reactor-API-Key'], 'visitor-test-key');
  assert.equal(request.credentials, 'omit'); assert.equal(request.cache, 'no-store');
  assert.equal(request.referrerPolicy, 'no-referrer'); assert.equal(request.signal, controller.signal);
  assert.ok(!request.body.includes('visitor-test-key'));
  const scope = JSON.parse(request.body).authorization_details[0];
  assert.deepEqual(scope.resources.models.match, ['reactor/eden-live']);
  assert.deepEqual(scope.constraints, { max_sessions: 1, max_session_duration_seconds: 900 });
});
test('missing keys and unapproved destinations never trigger a network request', async () => {
  const unexpected = () => { throw Error('Network must not be called'); };
  await assert.rejects(mintToken({ apiKey: ' ', apiUrl: 'https://api.reactor.inc' }, unexpected), /Add your Reactor API key/);
  for (const apiUrl of ['https://attacker.test', 'http://api.reactor.inc', 'https://api.reactor.inc/other']) {
    await assert.rejects(mintToken({ apiKey: 'visitor-test-key', apiUrl }, unexpected), /official Reactor/);
  }
});
test('token errors never echo upstream bodies, keys or arbitrary response details', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(mintToken({ apiKey: 'visitor-test-key', apiUrl: 'https://api.reactor.inc' }, async () => new Response('visitor-test-key sensitive-detail', { status })), (error) => {
      assert.ok(!error.message.includes('visitor-test-key')); assert.ok(!error.message.includes('sensitive-detail')); return true;
    });
  }
});

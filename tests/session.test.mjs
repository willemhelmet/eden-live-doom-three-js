import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EdenSession } from '../src/session.ts';

function fixture(overrides = {}) {
  const calls = [];
  const listeners = new Map();
  let stopped = false;
  const model = {
    onMainVideo: () => () => {},
    onStateUpdate: (handler) => { listeners.set('state', handler); return () => listeners.delete('state'); },
    on: (type, handler) => listeners.set(type, handler),
    off: (type) => listeners.delete(type),
    getStatus: () => 'ready',
    connect: async () => { calls.push('connect'); },
    disconnect: async () => { calls.push('disconnect'); },
    publishSourceVideo: async () => { calls.push('publish'); },
    uploadFile: async () => { calls.push('upload'); return { id: 'reference' }; },
    ...Object.fromEntries(['setSource', 'setPaused', 'setImage', 'setPrompt', 'start'].map((name) => [name, async () => { calls.push(name); return { type: 'state_update' }; }])),
    ...overrides,
  };
  const session = new EdenSession({ makeModel: () => model, fetchImpl: async () => Response.json({ jwt: 'scoped-test-token' }) });
  const options = {
    apiUrl: 'https://api.reactor.inc', prompt: 'Orbital greenhouse', reference: new File(['image'], 'test.png'),
    canvas: { captureStream: (fps) => { assert.equal(fps, 24); return { getVideoTracks: () => [{ stop: () => { stopped = true; } }] }; } },
  };
  return { session, options, calls, listeners, isStopped: () => stopped };
}

test('session stages appearance only after transport readiness, then releases capture on stop', async () => {
  const f = fixture();
  await f.session.start(f.options);
  assert.deepEqual(f.calls, ['connect', 'publish', 'setSource', 'setPaused', 'upload', 'setImage', 'setPrompt', 'start']);
  await f.session.stop(); await f.session.stop();
  assert.equal(f.calls.filter((x) => x === 'disconnect').length, 1);
  assert.equal(f.isStopped(), true);
  assert.equal(f.listeners.size, 0);
});
test('cancellation during connect cannot publish a track or start an abandoned world', async () => {
  let connected;
  const gate = new Promise((resolve) => { connected = resolve; });
  const f = fixture({ connect: () => gate });
  const starting = f.session.start(f.options);
  await new Promise((r) => setImmediate(r));
  const stopping = f.session.stop();
  connected();
  await assert.rejects(starting, { name: 'AbortError' });
  await stopping;
  assert.deepEqual(f.calls, ['disconnect']);
});
test('a refused staging command never advances to image upload or generation', async () => {
  const f = fixture({ setSource: async () => undefined });
  await assert.rejects(f.session.start(f.options), /refused set_source/);
  await f.session.stop();
  assert.ok(!f.calls.includes('upload')); assert.ok(!f.calls.includes('start'));
  assert.equal(f.isStopped(), true);
});
test('only a completed chunk from a started world enables the generated reveal', async () => {
  const f = fixture();
  const chunks = [];
  f.session.onChunk = (value) => chunks.push(value);
  await f.session.start(f.options);
  f.listeners.get('state')({ started: false, chunks: 0 });
  f.listeners.get('state')({ started: true, chunks: 0 });
  assert.deepEqual(chunks, []);
  f.listeners.get('state')({ started: true, chunks: 1 });
  assert.deepEqual(chunks, [1]);
  await f.session.stop();
});

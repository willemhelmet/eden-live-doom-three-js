import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axis, readPad, applyPad, applyDemoPace, rising } from '../src/deck-input.mjs';

test('stick drift is ignored and extremes remain bounded', () => {
  for (const value of [undefined, NaN, 0, .17, -.18]) assert.equal(axis(value), 0);
  assert.equal(axis(1), 1);
  assert.equal(axis(-1), -1);
  assert.ok(Math.abs(axis(.59) - .5) < 1e-10);
});
test('combined controls use the slower filming pace while preserving actions', () => {
  const cmd = { forwardmove: 25, sidemove: 0, angleturn: 0, buttons: 0 };
  applyPad(cmd, { x: 1, y: -1, turn: 1, fire: true, use: true, run: true });
  assert.deepEqual(cmd, { forwardmove: 50, sidemove: 40, angleturn: -1280, buttons: 3 });
  applyDemoPace(cmd);
  assert.deepEqual(cmd, { forwardmove: 12, sidemove: 10, angleturn: -320, buttons: 3 });
  const desktop = { forwardmove: 25, sidemove: -24, angleturn: -640, buttons: 0x82 };
  applyDemoPace(desktop);
  assert.deepEqual(desktop, { forwardmove: 6, sidemove: -6, angleturn: -160, buttons: 0x82 });
  const opposing = { forwardmove: 25, sidemove: 0, angleturn: 0, buttons: 0 };
  applyPad(opposing, { x: 0, y: 1, turn: 0, run: false });
  assert.equal(opposing.forwardmove, 0);
});
test('unplugging a controller releases every analog axis and button', () => {
  const neutral = readPad(null);
  assert.equal(neutral.x, 0); assert.equal(neutral.fire, false); assert.equal(neutral.session, false);
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  buttons[2] = { pressed: true, value: 1 };
  const pressed = readPad({ axes: [0, -1, 1, 0], buttons });
  assert.equal(rising(neutral, pressed, 'session'), true);
  assert.equal(rising(pressed, pressed, 'session'), false);
  assert.equal(rising(pressed, neutral, 'session'), false);
});

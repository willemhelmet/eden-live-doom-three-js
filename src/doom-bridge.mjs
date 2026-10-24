import { renderer, I_GetCanvasView } from '/doom/src/i_video.js';
import * as state from '/doom/src/doomstat.js';
import { wipe_isActive } from '/doom/src/f_wipe.js';
import { readPad, applyPad, applyDemoPace, rising } from '/doom/deck-input.mjs';

const source = document.createElement('canvas');
source.width = 1280;
source.height = 704;
const context = source.getContext('2d', { alpha: false });
let callback = null;
let lastCapture = -Infinity;
let ready = false;
let enabled = true;
let prior = {};
let pad = readPad(null);
let frames = 0;
let suspended = false;
let previousPause = false;

function key(code) {
  const names = { Enter: 'Enter', Escape: 'Escape', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  document.dispatchEvent(new KeyboardEvent('keydown', { code, key: names[code] ?? code.replace('Digit', ''), bubbles: true, cancelable: true }));
  setTimeout(() => document.dispatchEvent(new KeyboardEvent('keyup', { code, key: names[code] ?? '', bubbles: true })), 90);
}

function pollPad() {
  const gamepad = [...navigator.getGamepads()].find((p) => p?.connected && p.mapping === 'standard');
  pad = readPad(document.visibilityState === 'visible' ? gamepad : null);
  if (enabled && (rising(prior, pad, 'menu') || rising(prior, pad, 'back'))) key('Escape');
  if (enabled && state.menuactive) {
    for (const [field, code] of [['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight'], ['accept', 'Enter']]) {
      if (rising(prior, pad, field)) key(code);
    }
  } else if (enabled) {
    if (rising(prior, pad, 'next') || rising(prior, pad, 'previous')) {
      const player = state.players?.[state.consoleplayer];
      const owned = player?.weaponowned ?? [];
      let weapon = player?.readyweapon ?? 1;
      const direction = pad.next ? 1 : -1;
      for (let i = 0; i < 8; i++) {
        weapon = (weapon + direction + 8) % 8;
        if (owned[weapon]) { key(`Digit${weapon === 7 ? 1 : weapon + 1}`); break; }
      }
    }
  }
  for (const action of ['session', 'compare', 'cycle', 'fullscreen']) {
    if (rising(prior, pad, action)) parent.postMessage({ type: 'doom:action', action }, location.origin);
  }
  prior = pad;
  requestAnimationFrame(pollPad);
}
requestAnimationFrame(pollPad);

// Called at the original 35 Hz tick boundary, after keyboard input is composed.
globalThis.edenDeckInput = (cmd) => {
  if (enabled && !state.menuactive && !state.paused && !state.demoplayback) applyPad(cmd, pad);
  applyDemoPace(cmd);
};

document.addEventListener('doom:frame', () => {
  if (!renderer) return;
  const view = I_GetCanvasView();
  if (!view) return;
  const now = performance.now();
  const overlay = document.getElementById('overlay');
  if (state.gamestate !== 0 || state.automapactive || !state.players?.[state.consoleplayer]?.mo || wipe_isActive()) {
    callback?.({ source, overlay, view, menu: true, now });
    return;
  }
  if (now >= lastCapture + 1000 / 24) {
    const dpr = renderer.getPixelRatio();
    context.drawImage(renderer.domElement, view.viewX * dpr, view.viewY * dpr,
      view.viewWidth * dpr, view.viewHeight * dpr, 0, 0, source.width, source.height);
    lastCapture = Math.max(lastCapture + 1000 / 24, now - 1000 / 24);
    frames++;
  }
  if (!ready) {
    ready = true;
    parent.postMessage({ type: 'doom:ready' }, location.origin);
  }
  callback?.({ source, overlay, view, menu: !!state.menuactive, now });
});

window.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'KeyV' || event.code === 'KeyF') {
    event.preventDefault();
    parent.postMessage({ type: 'doom:action', action: event.code === 'KeyV' ? 'cycle' : 'fullscreen' }, location.origin);
  }
});
window.addEventListener('error', (event) => parent.postMessage({ type: 'doom:error', message: event.message }, location.origin));

// Same-origin API; the cloud never receives output video through this canvas.
window.doomBridge = {
  get ready() { return ready; },
  get source() { return source; },
  get frames() { return frames; },
  get pose() {
    const mo = state.players?.[state.consoleplayer]?.mo;
    return mo ? { x: mo.x, y: mo.y, angle: mo.angle } : null;
  },
  onFrame(fn) { callback = fn; },
  suspend(value) {
    if (value && !suspended) { previousPause = state.paused; state.set_paused(true); }
    if (!value && suspended) state.set_paused(previousPause);
    suspended = value;
  },
  setEnabled(value) { enabled = value; if (!value) { pad = readPad(null); window.dispatchEvent(new Event('blur')); } },
  focus() { window.focus(); },
};

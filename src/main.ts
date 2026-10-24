import './style.css';
import { EdenSession } from './session';
import { REACTOR_ENDPOINTS, ReactorAuthError, mintToken } from './auth.mjs';

type Layout = { canvasWidth: number; canvasHeight: number; viewX: number; viewY: number; viewWidth: number; viewHeight: number };
type Frame = { source: HTMLCanvasElement; overlay: HTMLCanvasElement; view: Layout; menu: boolean; now: number };
type Bridge = { ready: boolean; source: HTMLCanvasElement; frames: number; onFrame: (fn: (frame: Frame) => void) => void; setEnabled: (enabled: boolean) => void; suspend: (value: boolean) => void; focus: () => void };
type DoomWindow = Window & { doomBridge?: Bridge };
type View = 'raw' | 'eden' | 'compare';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const iframe = element<HTMLIFrameElement>('doom');
const stage = element('stage');
const output = element<HTMLVideoElement>('output');
const hud = element<HTMLCanvasElement>('hud');
const connect = element<HTMLButtonElement>('connect');
const stopButton = element<HTMLButtonElement>('stop');
const startScreen = element('start-screen');
const viewButton = element<HTMLButtonElement>('view');
const status = element('status');
const errorBox = element('error');
const waiting = element('waiting');
const prompt = element<HTMLTextAreaElement>('prompt');
const reference = element<HTMLInputElement>('reference');
const referenceMode = element<HTMLSelectElement>('reference-mode');
const apiKey = element<HTMLInputElement>('api-key');
const environment = element<HTMLSelectElement>('environment');
const seed = element<HTMLInputElement>('seed');
const keyAlert = element('key-alert');
const keyMessage = element('key-message');
const validateButton = element<HTMLButtonElement>('validate-key');
let keyValidation: AbortController | null = null;
let keyAccepted = false;

function setKeyAccepted(accepted: boolean, message = 'Add your Reactor API key to connect.') {
  keyAccepted = accepted;
  keyAlert.hidden = accepted;
  element('key-summary').hidden = !accepted;
  keyMessage.textContent = message;
  if (accepted) maskKey();
  syncGameAccess();
}
function invalidateKey() {
  keyValidation?.abort(); keyValidation = null;
  validateButton.disabled = false; validateButton.textContent = 'Use key';
  setKeyAccepted(false);
}
function maskKey() {
  apiKey.type = 'password';
  element('show-key').textContent = 'Show';
  element('show-key').setAttribute('aria-pressed', 'false');
  element('show-key').setAttribute('aria-label', 'Show API key');
}
async function validateKey() {
  if (session || closing || keyValidation) return;
  if (!apiKey.value.trim()) { setKeyAccepted(false); apiKey.focus(); return; }
  const controller = new AbortController();
  keyValidation = controller;
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  validateButton.disabled = true; validateButton.textContent = 'Checking…';
  keyMessage.textContent = 'Checking your Reactor key…';
  try {
    await mintToken({ apiKey: apiKey.value.trim(), apiUrl: REACTOR_ENDPOINTS[environment.value as keyof typeof REACTOR_ENDPOINTS], signal: controller.signal });
    if (keyValidation !== controller) return;
    setKeyAccepted(true);
    status.textContent = 'Ready to connect.';
  } catch (error) {
    if (keyValidation !== controller) return;
    setKeyAccepted(false, controller.signal.aborted ? 'Reactor did not respond. Check your connection and try again.' : error instanceof Error ? error.message : 'Could not check this key. Try again.');
    apiKey.focus({ preventScroll: true });
  } finally {
    clearTimeout(timeout);
    if (keyValidation === controller) { keyValidation = null; validateButton.disabled = false; validateButton.textContent = 'Use key'; syncGameAccess(); }
  }
}
const referencePreview = document.querySelector<HTMLImageElement>('.reference-preview img')!;
let referenceObjectUrl: string | null = null;
let bridge: Bridge | undefined;
let session: EdenSession | null = null;
let closing = false;
let live = false;
let view: View = 'raw';
let lastHud = 0;
let revealCallback = 0;
let frameTimeout = 0;
let toastTimeout = 0;
let currentMenu = false;
let generatedAt = 0;
let generatedChunks = 0;

function setView(next: View) {
  view = live ? next : 'raw';
  stage.dataset.view = view;
  viewButton.innerHTML = `${view === 'raw' ? 'Original' : view === 'eden' ? 'Eden' : 'Split view'} <kbd>V</kbd>`;
  element('view-label').textContent = view === 'raw' ? 'ORIGINAL / THREE.JS' : view === 'eden' ? 'EDEN / REACTOR' : 'ORIGINAL ← / → EDEN';
}
function cycle() { setView(view === 'raw' ? 'eden' : view === 'eden' ? 'compare' : 'raw'); focusGame(); }
function isEditing(target: Element | null) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement; }
function focusGame() { if (keyAccepted && waiting.hidden && !isEditing(document.activeElement)) bridge?.focus(); }
function syncGameAccess() {
  stage.dataset.locked = String(!keyAccepted);
  iframe.inert = !keyAccepted;
  iframe.tabIndex = keyAccepted ? 0 : -1;
  startScreen.hidden = !!session;
  element('start-hint').hidden = keyAccepted;
  element('forget-key').hidden = !apiKey.value.trim();
  connect.disabled = !keyAccepted || !bridge?.ready || closing || !!keyValidation;
  connect.textContent = closing ? 'Disconnecting…' : 'Start Eden';
  stopButton.hidden = !live;
  bridge?.setEnabled(keyAccepted && waiting.hidden && !isEditing(document.activeElement));
  bridge?.suspend(!keyAccepted || !waiting.hidden);
}
function lockSettings(locked: boolean) {
  element<HTMLFieldSetElement>('world-settings').disabled = locked;
  apiKey.readOnly = locked;
  environment.disabled = locked;
  validateButton.disabled = locked || !!keyValidation;
}
function showError(error: unknown) {
  if (error instanceof ReactorAuthError) {
    setKeyAccepted(false, error.message);
    apiKey.focus({ preventScroll: true });
    keyAlert.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  errorBox.textContent = error instanceof Error ? error.message : String(error);
  errorBox.hidden = false;
}
function toast(message: string) {
  const el = element('toast');
  el.textContent = message; el.hidden = false;
  clearTimeout(toastTimeout); toastTimeout = window.setTimeout(() => { el.hidden = true; }, 2500);
}

function bindGame() {
  bridge = (iframe.contentWindow as DoomWindow | null)?.doomBridge;
  if (!bridge?.ready) return;
  syncGameAccess();
  status.textContent = keyAccepted ? 'Ready to connect.' : 'Original ready. Add your key to transform it.';
  bridge.onFrame((frame) => {
    currentMenu = frame.menu;
    // Place only the generated WORLD in the original viewport. Doom's HUD,
    // menu, palette effects and native aspect ratio stay outside generation.
    const { view: layout } = frame;
    output.style.left = `${layout.viewX / layout.canvasWidth * 100}%`;
    output.style.top = `${layout.viewY / layout.canvasHeight * 100}%`;
    output.style.width = `${layout.viewWidth / layout.canvasWidth * 100}%`;
    output.style.height = `${layout.viewHeight / layout.canvasHeight * 100}%`;
    if (frame.now - lastHud > 30) {
      if (hud.width !== layout.canvasWidth || hud.height !== layout.canvasHeight) {
        hud.width = layout.canvasWidth; hud.height = layout.canvasHeight;
      }
      const ctx = hud.getContext('2d')!;
      ctx.clearRect(0, 0, hud.width, hud.height);
      ctx.drawImage(frame.overlay, 0, 0);
      lastHud = frame.now;
    }
    // Menus must remain usable even when generation has stopped advancing.
    output.style.visibility = frame.menu ? 'hidden' : '';
    hud.style.visibility = frame.menu ? 'hidden' : '';
  });
  focusGame();
}

async function start() {
  if (session || closing || keyValidation || !bridge?.ready) return;
  if (!keyAccepted || !apiKey.value.trim()) { setKeyAccepted(false); apiKey.focus(); return; }
  if (!prompt.value.trim()) { showError(new Error('Enter an appearance prompt.')); prompt.focus(); return; }
  const chosenSeed = Number(seed.value);
  if (!seed.value || !Number.isInteger(chosenSeed) || chosenSeed < 0 || chosenSeed > 2147483647) { showError(new Error('Choose a seed between 0 and 2147483647.')); seed.focus(); return; }
  errorBox.hidden = true;
  apiKey.blur();
  const active = new EdenSession();
  session = active;
  live = false;
  generatedChunks = 0;
  let generationStarted = false;
  waiting.hidden = false;
  syncGameAccess();
  lockSettings(true);
  bridge.setEnabled(false);
  bridge.suspend(true);
  active.onAuthenticated = () => { if (session === active) setKeyAccepted(true); };
  active.onStage = (text) => { if (session === active && !live) element('waiting-text').textContent = text; };
  active.onError = (error) => { if (session === active) { showError(error); void stop(); } };
  active.onChunk = (chunks) => { if (session === active) generatedChunks = chunks; };
  active.onVideo = (stream) => {
    if (session !== active) return;
    output.srcObject = stream;
    if (revealCallback) output.cancelVideoFrameCallback(revealCallback);
    const reveal = () => {
      revealCallback = 0;
      if (session !== active) return;
      // WebRTC may decode placeholder black before the model's first chunk.
      // A transport frame is not proof of completed generation.
      if (!generationStarted || generatedChunks < 1 || !hasPicture(output)) {
        revealCallback = output.requestVideoFrameCallback(reveal);
        return;
      }
      live = true;
      generatedAt = performance.now();
      clearTimeout(frameTimeout);
      waiting.hidden = true;
      syncGameAccess();
      viewButton.disabled = false;
      setView('eden');
      status.textContent = 'Live on your key. Stop Eden to disconnect.';
      focusGame();
    };
    revealCallback = output.requestVideoFrameCallback(reveal);
    void output.play().catch((error) => { showError(error); void stop(); });
  };
  // Bounds the whole startup, including connection, staging and first decode.
  frameTimeout = window.setTimeout(() => { if (session === active && !live) { showError(new Error('No generated frame arrived within two minutes. The local game is still available; check cloud capacity and try again.')); void stop(); } }, 120_000);
  try {
    const image = reference.files?.[0] ?? (referenceMode.value === 'greenhouse' ? await builtInReference() : await new Promise<File>((resolve, reject) => {
      bridge!.source.toBlob((blob) => blob ? resolve(new File([blob], 'doom-opening.png', { type: 'image/png' })) : reject(new Error('Could not capture the opening frame.')), 'image/png');
    }));
    if (session !== active) return;
    await active.start({ apiKey: apiKey.value.trim(), apiUrl: REACTOR_ENDPOINTS[environment.value as keyof typeof REACTOR_ENDPOINTS], canvas: bridge.source, reference: image, prompt: prompt.value.trim(), seed: chosenSeed });
    generationStarted = true;
  } catch (error) {
    if (session !== active) return;
    if (!(error instanceof DOMException && error.name === 'AbortError')) showError(error);
    await stop();
  }
}

async function stop() {
  if (closing) return;
  const old = session;
  session = null;
  live = false;
  closing = !!old;
  clearTimeout(frameTimeout);
  if (revealCallback) output.cancelVideoFrameCallback(revealCallback);
  revealCallback = 0;
  output.pause(); output.srcObject = null;
  waiting.hidden = true;
  syncGameAccess();
  viewButton.disabled = true;
  setView('raw');
  status.textContent = closing ? 'Closing the cloud session…' : 'Original Doom';
  focusGame();
  try { await old?.stop(); }
  catch { showError(new Error('Cloud disconnect could not be confirmed. Check your Reactor sessions before reconnecting.')); }
  finally {
    closing = false;
    lockSettings(false);
    syncGameAccess();
    status.textContent = 'Disconnected. Change the world and reconnect.';
  }
}

async function fullscreen() {
  document.body.classList.toggle('theater');
  if (document.body.classList.contains('theater')) {
    try { await document.documentElement.requestFullscreen(); } catch { /* CSS theater mode remains available. */ }
  } else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  focusGame();
}

connect.onclick = () => void start();
stopButton.onclick = () => void stop();
element('cancel').onclick = () => void stop();
viewButton.onclick = cycle;
element('fullscreen').onclick = () => void fullscreen();
element('exit-theater').onclick = () => void fullscreen();
element('show-key').onclick = () => {
  const reveal = apiKey.type === 'password'; apiKey.type = reveal ? 'text' : 'password';
  element('show-key').textContent = reveal ? 'Hide' : 'Show';
  element('show-key').setAttribute('aria-pressed', String(reveal));
  element('show-key').setAttribute('aria-label', reveal ? 'Hide API key' : 'Show API key');
};
element('forget-key').onclick = () => { invalidateKey(); apiKey.value = ''; maskKey(); void stop(); };
validateButton.onclick = () => void validateKey();
apiKey.addEventListener('input', invalidateKey);
environment.addEventListener('change', invalidateKey);
apiKey.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void validateKey(); } });
element('copy-config').onclick = () => void copyText(JSON.stringify({ model: 'reactor/eden-live', source: 'client', prompt: prompt.value.trim(), seed: Number(seed.value), reference: reference.files?.[0]?.name ?? (referenceMode.value === 'greenhouse' ? 'appearance-greenhouse.png' : 'current-frame'), inputFps: 24 }, null, 2));
element('copy-quickstart').onclick = () => void copyText(element('quickstart-code').textContent ?? '');
document.addEventListener('focusin', syncGameAccess);
document.addEventListener('focusout', () => queueMicrotask(syncGameAccess));
element('reset').onclick = async () => {
  if (closing) return;
  await stop();
  bridge = undefined; syncGameAccess();
  iframe.src = `/doom/?-iwad=doom1.wad&-warp=1%201&-skill=2&-nomusic&take=${Date.now()}`;
};
reference.onchange = () => {
  if (referenceObjectUrl) URL.revokeObjectURL(referenceObjectUrl);
  referenceObjectUrl = reference.files?.[0] ? URL.createObjectURL(reference.files[0]) : null;
  if (referenceObjectUrl) referencePreview.src = referenceObjectUrl;
  else if (referenceMode.value === 'greenhouse') referencePreview.src = '/appearance-greenhouse.png';
  else if (bridge?.ready) referencePreview.src = bridge.source.toDataURL('image/png');
};
referenceMode.onchange = () => { reference.value = ''; reference.onchange?.(new Event('change')); };
element('clear-reference').onclick = () => { reference.value = ''; referenceMode.value = 'greenhouse'; reference.onchange?.(new Event('change')); };

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.source !== iframe.contentWindow) return;
  if (event.data?.type === 'doom:ready') bindGame();
  if (event.data?.type === 'doom:error') showError(new Error(`Doom: ${event.data.message}`));
  if (event.data?.type === 'doom:action') {
    if (event.data.action === 'session') { if (session) void stop(); else void start(); return; }
    if (event.data.action === 'fullscreen') void fullscreen();
    else if (live) {
      if (event.data.action === 'compare') { setView(view === 'raw' ? 'eden' : 'raw'); focusGame(); }
      else cycle();
    } else toast('Start Eden to compare the generated world.');
  }
});
window.addEventListener('keydown', (event) => {
  if (isEditing(event.target instanceof Element ? event.target : null) || event.repeat) return;
  if (event.code === 'KeyF') { event.preventDefault(); void fullscreen(); }
  if (event.code === 'KeyV') { event.preventDefault(); cycle(); }
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('theater'); });
window.addEventListener('pagehide', () => { keyValidation?.abort(); void session?.stop(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session) { toast('Cloud session stopped while the page was hidden.'); void stop(); }
});

// Diagnostics contain no credential or token values.
Object.defineProperty(window, 'edenDemo', { get: () => ({ live, view, closing, chunks: generatedChunks, menu: currentMenu, seconds: live ? (performance.now() - generatedAt) / 1000 : 0, capturedFrames: bridge?.frames ?? 0 }) });

const probe = document.createElement('canvas');
probe.width = 32; probe.height = 18;
const probeContext = probe.getContext('2d', { willReadFrequently: true })!;
function hasPicture(video: HTMLVideoElement) {
  if (!video.videoWidth || video.readyState < 2) return false;
  probeContext.drawImage(video, 0, 0, 32, 18);
  const pixels = probeContext.getImageData(0, 0, 32, 18).data;
  let lit = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 24) lit++;
  return lit > 12;
}

async function builtInReference() {
  const response = await fetch('/appearance-greenhouse.png');
  if (!response.ok) throw new Error('The bundled appearance reference is missing. Rebuild the app or choose Current Doom frame in the reference selector.');
  return new File([await response.blob()], 'orbital-greenhouse.png', { type: 'image/png' });
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Copied. No API key is included.'); }
  catch { showError(new Error('Clipboard access was blocked. You can select and copy the example from the page.')); }
}

setView('raw');
syncGameAccess();
bindGame();
if (new URLSearchParams(location.search).has('theater')) document.body.classList.add('theater');

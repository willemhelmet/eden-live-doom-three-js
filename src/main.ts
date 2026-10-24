import './style.css';
import { EdenSession } from './session';

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
const viewButton = element<HTMLButtonElement>('view');
const status = element('status');
const errorBox = element('error');
const waiting = element('waiting');
const prompt = element<HTMLTextAreaElement>('prompt');
const reference = element<HTMLInputElement>('reference');
const referenceMode = element<HTMLSelectElement>('reference-mode');
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
let config: { apiUrl: string; configured: boolean };

function setView(next: View) {
  view = live ? next : 'raw';
  stage.dataset.view = view;
  viewButton.innerHTML = `${view === 'raw' ? 'Original' : view === 'eden' ? 'Eden' : 'Split view'} <kbd>Y</kbd>`;
  element('view-label').textContent = view === 'raw' ? 'ORIGINAL / THREE.JS' : view === 'eden' ? 'EDEN / REACTOR' : 'ORIGINAL ← / → EDEN';
}
function cycle() { setView(view === 'raw' ? 'eden' : view === 'eden' ? 'compare' : 'raw'); focusGame(); }
function focusGame() { if (element('setup').hidden && waiting.hidden) bridge?.focus(); }
function showError(error: unknown) {
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
  connect.disabled = closing;
  connect.textContent = 'Start Eden';
  status.textContent = config?.configured ? 'Ready. Play the original or start Eden.' : 'Original ready · add your API key in .env for Eden';
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
  if (session || closing || !bridge?.ready) return;
  if (!prompt.value.trim()) { showError(new Error('Enter an appearance prompt in Setup.')); return; }
  errorBox.hidden = true;
  const active = new EdenSession();
  session = active;
  live = false;
  generatedChunks = 0;
  let generationStarted = false;
  connect.textContent = 'Stop Eden';
  waiting.hidden = false;
  element('setup').hidden = true;
  element('settings').setAttribute('aria-expanded', 'false');
  bridge.setEnabled(false);
  bridge.suspend(true);
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
      bridge?.setEnabled(true);
      bridge?.suspend(false);
      viewButton.disabled = false;
      setView('eden');
      status.textContent = 'Live · Y / V compare · Stop Eden to disconnect';
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
    await active.start({ apiUrl: config.apiUrl, canvas: bridge.source, reference: image, prompt: prompt.value.trim() });
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
  bridge?.setEnabled(true);
  bridge?.suspend(false);
  viewButton.disabled = true;
  setView('raw');
  connect.disabled = closing;
  connect.textContent = closing ? 'Disconnecting…' : 'Start Eden';
  status.textContent = closing ? 'Closing the cloud session…' : 'Original Doom';
  focusGame();
  try { await old?.stop(); }
  catch { showError(new Error('Cloud disconnect could not be confirmed. Check your Reactor sessions before starting another take.')); }
  finally {
    closing = false;
    connect.disabled = !bridge?.ready;
    connect.textContent = 'Start Eden';
    status.textContent = 'Original Doom · Eden disconnected';
  }
}

async function fullscreen() {
  document.body.classList.toggle('theater');
  if (document.body.classList.contains('theater')) {
    try { await document.documentElement.requestFullscreen(); } catch { /* Steam / kiosk may already own fullscreen. */ }
  } else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  focusGame();
}

connect.onclick = () => { if (session) void stop(); else void start(); };
element('cancel').onclick = () => void stop();
viewButton.onclick = cycle;
element('fullscreen').onclick = () => void fullscreen();
element('exit-theater').onclick = () => void fullscreen();
element('settings').onclick = () => {
  const setup = element('setup'); setup.hidden = !setup.hidden;
  element('settings').setAttribute('aria-expanded', String(!setup.hidden));
  bridge?.setEnabled(setup.hidden);
  if (setup.hidden) focusGame();
};
element('reset').onclick = async () => {
  if (closing) return;
  await stop();
  bridge = undefined; connect.disabled = true; connect.textContent = 'Loading Doom…';
  iframe.src = `/doom/?-iwad=doom1.wad&-warp=1%201&-skill=2&-nomusic&take=${Date.now()}`;
};
reference.onchange = () => { element('reference-name').textContent = reference.files?.[0]?.name ?? (referenceMode.value === 'greenhouse' ? 'Built-in orbital greenhouse' : 'Current Doom frame'); };
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
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.repeat) return;
  if (event.code === 'KeyF') { event.preventDefault(); void fullscreen(); }
  if (event.code === 'KeyV') { event.preventDefault(); cycle(); }
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('theater'); });
window.addEventListener('pagehide', () => { void session?.stop(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session) { toast('Cloud session stopped while the page was hidden.'); void stop(); }
});

// Expose no credentials; this is useful when checking a Deck's frame delivery.
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
  if (!response.ok) throw new Error('The bundled appearance reference is missing. Rebuild the app or choose Current Doom frame in Setup.');
  return new File([await response.blob()], 'orbital-greenhouse.png', { type: 'image/png' });
}

setView('raw');
try {
  const response = await fetch('/api/config');
  config = await response.json();
  if (!response.ok) throw new Error('Could not load local configuration.');
  bindGame();
} catch (error) { showError(error); }
if (new URLSearchParams(location.search).has('theater')) document.body.classList.add('theater');

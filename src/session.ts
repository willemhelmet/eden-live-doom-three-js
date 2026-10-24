import { EdenLiveModel } from '@reactor-models/eden-live/core';
import { mintToken } from './auth.mjs';

export type Stage = 'Connecting to Eden…' | 'Preparing appearance…' | 'Waiting for the first generated frame…';

export class EdenSession {
  private eden: EdenLiveModel | null = null;
  private track: MediaStreamTrack | null = null;
  private abort = new AbortController();
  private stopping: Promise<void> | null = null;
  private removers: (() => void)[] = [];
  private makeModel: (apiUrl: string) => EdenLiveModel;
  private fetchImpl: typeof fetch;
  onVideo: (stream: MediaStream) => void = () => {};
  onStage: (stage: Stage) => void = () => {};
  onError: (error: Error) => void = () => {};
  onChunk: (chunks: number) => void = () => {};

  constructor(deps: { makeModel?: (apiUrl: string) => EdenLiveModel; fetchImpl?: typeof fetch } = {}) {
    this.makeModel = deps.makeModel ?? ((apiUrl) => new EdenLiveModel({ apiUrl, readyTimeoutMs: 60_000, controlRequestTimeoutMs: 60_000, maxSessionAttempts: 1, logLevel: 'error' }));
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async start(options: { apiKey: string; apiUrl: string; canvas: HTMLCanvasElement; reference: File; prompt: string; seed?: number }) {
    const alive = () => this.abort.signal.throwIfAborted();
    this.onStage('Connecting to Eden…');
    const jwt = await mintToken({ apiKey: options.apiKey, apiUrl: options.apiUrl, signal: this.abort.signal }, this.fetchImpl);
    alive();
    const eden = this.makeModel(options.apiUrl);
    this.eden = eden;
    this.removers.push(eden.onMainVideo((_track, stream) => { if (!this.abort.signal.aborted) this.onVideo(stream); }));
    this.removers.push(eden.onStateUpdate((state) => { if (!this.abort.signal.aborted && state.started && state.chunks > 0) this.onChunk(state.chunks); }));
    const onError = (error: Error) => { if (!this.abort.signal.aborted) this.onError(error); };
    eden.on('error', onError);
    this.removers.push(() => eden.off('error', onError));
    await eden.connect(jwt);
    alive();
    await waitReady(eden, this.abort.signal);
    alive();
    this.onStage('Preparing appearance…');
    // Capture only the local source. The returned video is a separate element.
    this.track = options.canvas.captureStream(24).getVideoTracks()[0];
    if (!this.track) throw new Error('This browser cannot capture the Doom canvas. Use Chromium.');
    await eden.publishSourceVideo(this.track);
    alive();
    required(await eden.setSource({ source: 'client' }), 'set_source');
    alive();
    required(await eden.setPaused({ paused: true }), 'set_paused');
    alive();
    const image = await eden.uploadFile(options.reference);
    alive();
    required(await eden.setImage({ image }), 'set_image');
    alive();
    required(await eden.setPrompt({ prompt: options.prompt }), 'set_prompt');
    alive();
    required(await eden.start({ seed: options.seed ?? 2026092901 }), 'start');
    alive();
    this.onStage('Waiting for the first generated frame…');
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.abort.abort();
    this.track?.stop();
    for (const remove of this.removers.splice(0)) remove();
    // SDK serializes this behind an in-flight connect; no new session until done.
    this.stopping = this.eden ? this.eden.disconnect() : Promise.resolve();
    return this.stopping;
  }
}

function required<T>(reply: T | undefined, command: string): T {
  if (reply === undefined) throw new Error(`Eden refused ${command}. Check the endpoint and served model version.`);
  return reply;
}

function waitReady(eden: EdenLiveModel, signal: AbortSignal): Promise<void> {
  if (eden.getStatus() === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(timer); off(); signal.removeEventListener('abort', aborted); };
    const aborted = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { clean(); reject(new Error('Eden did not become ready within 60 seconds.')); }, 60_000);
    const onStatus = (status: string) => { if (status === 'ready') { clean(); resolve(); } };
    const off = () => eden.off('statusChanged', onStatus);
    eden.on('statusChanged', onStatus);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

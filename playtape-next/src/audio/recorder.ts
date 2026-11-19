/* Microphone capture. The stream is opened once and kept warm while a song
   is open, so Record starts immediately and the input level is visible
   before recording (the old app reopened the mic on every take). */

import { engine } from './engine';
import type { AudioData } from '../storage/wav';

export type MicState = 'off' | 'starting' | 'ready' | 'recording';

export interface Take {
  audio: AudioData;
  /** Context frame of the first captured sample. */
  startFrame: number;
  duration: number;
}

/** Peaks per second kept for drawing the take while it is being recorded. */
export const LIVE_PEAK_RATE = 100;

function ls(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

class Recorder {
  state: MicState = 'off';
  /** Latest input peak 0..1, decays in the UI. */
  level = 0;
  clipped = false;
  /** Peak envelope of the take in progress (LIVE_PEAK_RATE values per second). */
  livePeaks: number[] = [];
  deviceId = ls('playtape_input') ?? '';
  /** 0 = input 1, 1 = input 2, 2 = both. */
  channelMode = parseInt(ls('playtape_chan') ?? '2', 10);

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private blocks: Float32Array[] = [];
  private startFrame: number | null = null;
  private inputLatency = 0;
  private peakCarry = { max: 0, n: 0 };
  private warming: Promise<void> | null = null;
  private tuner: AnalyserNode | null = null;
  private resolveStop: ((t: Take | null) => void) | null = null;
  private resolveGrab: ((a: { audio: AudioData; endFrame: number } | null) => void) | null = null;
  /** Whether the last minute of input is being kept in memory. */
  ringOn = false;

  /** Context time of the first captured sample of the take in progress, once known. */
  get captureStartTime(): number | null {
    return this.startFrame == null || !engine.ctx ? null : this.startFrame / engine.ctx.sampleRate;
  }

  get supported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';
  }

  /** Open the mic if it is not open already. Rejects with the getUserMedia error. */
  warm(): Promise<void> {
    if (this.state === 'ready' || this.state === 'recording') return Promise.resolve();
    this.warming ??= this.open().finally(() => { this.warming = null; });
    return this.warming;
  }

  private async open(): Promise<void> {
    this.state = 'starting';
    try {
      await engine.ensure();
      if (!engine.hasWorklets) throw new Error('This browser cannot record here (AudioWorklet unavailable).');
      const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };
      if (this.deviceId) audio.deviceId = { exact: this.deviceId };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch (e) {
        if (!this.deviceId || (e as DOMException).name !== 'OverconstrainedError') throw e;
        delete audio.deviceId; // the remembered device is gone: fall back to the default
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      }
      const ctx = engine.ctx!;
      await engine.resume();
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      this.inputLatency = (track?.getSettings?.() as { latency?: number } | undefined)?.latency ?? 0;
      this.source = ctx.createMediaStreamSource(stream);
      this.node = new AudioWorkletNode(ctx, 'pt-recorder', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit',
      });
      this.node.port.postMessage({ cmd: 'mode', mode: this.channelMode });
      if (this.ringOn) this.node.port.postMessage({ cmd: 'ring', on: true });
      this.node.port.onmessage = (e) => this.onMessage(e.data);
      // The node must reach the destination to be processed; a silent gain keeps the mic out of the speakers.
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;
      this.source.connect(this.node);
      this.node.connect(this.sink);
      this.sink.connect(ctx.destination);
      track?.addEventListener('ended', () => this.cool());
      this.state = 'ready';
    } catch (e) {
      this.state = 'off';
      throw e;
    }
  }

  /** Keep (or stop keeping) the last minute of input in memory. */
  setRing(on: boolean): void {
    this.ringOn = on;
    this.node?.port.postMessage({ cmd: 'ring', on });
  }

  /** Take the last `seconds` of input out of the ring. Null if there is none. */
  grab(seconds: number): Promise<{ audio: AudioData; endFrame: number } | null> {
    if (!this.node || !this.ringOn || this.state === 'off') return Promise.resolve(null);
    return new Promise((resolve) => {
      this.resolveGrab = resolve;
      this.node!.port.postMessage({ cmd: 'grab', seconds });
    });
  }

  private onMessage(d: { type: string; peak?: number; frame?: number; samples?: Float32Array }): void {
    if (d.type === 'meter') {
      this.level = Math.max(this.level, d.peak!);
      if (d.peak! >= 0.985) this.clipped = true;
    } else if (d.type === 'started') {
      this.startFrame = d.frame!;
    } else if (d.type === 'data') {
      this.blocks.push(d.samples!);
      this.addLivePeaks(d.samples!);
    } else if (d.type === 'stopped') {
      this.finish();
    } else if (d.type === 'ring') {
      const resolve = this.resolveGrab;
      this.resolveGrab = null;
      const s = d.samples!;
      resolve?.(s.length ? { audio: { sampleRate: engine.ctx!.sampleRate, channels: [s] }, endFrame: d.frame! } : null);
    }
  }

  private addLivePeaks(samples: Float32Array): void {
    const per = Math.max(1, Math.round(engine.ctx!.sampleRate / LIVE_PEAK_RATE));
    let { max, n } = this.peakCarry;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i] < 0 ? -samples[i] : samples[i];
      if (v > max) max = v;
      if (++n === per) { this.livePeaks.push(max); max = 0; n = 0; }
    }
    this.peakCarry = { max, n };
  }

  /** Begin capturing. The mic must be warm. */
  start(): void {
    if (this.state !== 'ready' || !this.node) return;
    this.blocks = [];
    this.livePeaks = [];
    this.peakCarry = { max: 0, n: 0 };
    this.startFrame = null;
    this.clipped = false;
    this.state = 'recording';
    this.node.port.postMessage({ cmd: 'start', mode: this.channelMode });
  }

  /** Stop capturing and return the take (null if nothing was captured). */
  stop(): Promise<Take | null> {
    if (this.state !== 'recording' || !this.node) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.resolveStop = resolve;
      try { this.node!.port.postMessage({ cmd: 'stop' }); } catch { this.finish(); }
    });
  }

  private finish(): void {
    const blocks = this.blocks;
    const startFrame = this.startFrame;
    this.blocks = [];
    this.startFrame = null;
    if (this.state === 'recording') this.state = 'ready';
    const resolve = this.resolveStop;
    this.resolveStop = null;
    let total = 0;
    for (const b of blocks) total += b.length;
    if (!total || startFrame == null) { resolve?.(null); return; }
    const data = new Float32Array(total);
    let o = 0;
    for (const b of blocks) { data.set(b, o); o += b.length; }
    const sampleRate = engine.ctx!.sampleRate;
    resolve?.({ audio: { sampleRate, channels: [data] }, startFrame, duration: total / sampleRate });
  }

  /** Release the microphone. */
  cool(): void {
    if (this.state === 'recording') this.finish();
    try { this.source?.disconnect(); } catch { /* fine */ }
    try { this.node?.disconnect(); } catch { /* fine */ }
    try { this.sink?.disconnect(); } catch { /* fine */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.tuner?.disconnect(); } catch { /* fine */ }
    this.stream = null; this.source = null; this.node = null; this.sink = null; this.tuner = null;
    this.state = 'off';
    this.level = 0;
  }

  /** Round-trip latency to subtract from every take, in seconds.
      Uses the per-device value measured by Calibrate when there is one
      (same storage keys as the old app), otherwise an estimate. */
  offsetSec(): number {
    return this.offsetInfo().ms / 1000;
  }

  private offsetKey(): string { return 'tape_recOffsetMs:' + (this.deviceId || 'default'); }

  /** The offset in use and whether it was measured (or typed in) for this input, or is only an estimate. */
  offsetInfo(): { ms: number; measured: boolean } {
    const stored = ls(this.offsetKey()) ?? (this.deviceId ? null : ls('tape_recOffsetMs'));
    if (stored != null) return { ms: parseInt(stored, 10) || 0, measured: true };
    const ctx = engine.ctx;
    // output path = device latency + the master limiter's 5 ms lookahead
    const est = (ctx?.baseLatency ?? 0) + (ctx?.outputLatency ?? 0) + this.inputLatency + (engine.hasWorklets ? 0.005 : 0);
    return { ms: Math.round(est * 1000), measured: false };
  }

  setOffsetMs(ms: number): void {
    lsSet(this.offsetKey(), String(Math.round(Math.max(-200, Math.min(500, ms)))));
  }

  /** Audio inputs the browser knows about. Names are only filled in once the mic has been allowed. */
  async listInputs(): Promise<{ id: string; label: string }[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
    } catch {
      return [];
    }
  }

  /** Switch input device; reopens the mic if it was open. */
  async setDevice(id: string): Promise<void> {
    this.deviceId = id;
    lsSet('playtape_input', id);
    if (this.state === 'ready') { this.cool(); await this.warm(); }
  }

  setChannel(mode: number): void {
    this.channelMode = mode;
    lsSet('playtape_chan', String(mode));
    this.node?.port.postMessage({ cmd: 'mode', mode });
  }

  /** An analyser on the live input, for the tuner. Null while the mic is off. */
  tunerAnalyser(): AnalyserNode | null {
    if (!this.source || !engine.ctx) return null;
    if (!this.tuner) {
      this.tuner = engine.ctx.createAnalyser();
      this.tuner.fftSize = 2048;
      this.source.connect(this.tuner);
    }
    return this.tuner;
  }
}

export const recorder = new Recorder();

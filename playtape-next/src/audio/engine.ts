/* The audio engine: one AudioContext, the master bus (gain → lookahead
   limiter → output), the shared reverb, the buffer registry and one
   persistent TrackChain per track. */

import { DRUM_TRIM } from './drums';
import { computePeaks, makeIR } from './dsp';
import { TrackChain } from './graph';
import { audible, type ReverbType, type Song } from '../model/types';
import type { AudioData } from '../storage/wav';
import limiterSrc from './worklets/limiter.worklet.js?raw';
import recorderSrc from './worklets/recorder.worklet.js?raw';

/** Output never exceeds this (about -1 dBFS), scaled further by the user's loudness ceiling. */
export const CEILING = 0.89;

export async function addWorklets(actx: BaseAudioContext): Promise<boolean> {
  if (!actx.audioWorklet) return false;
  try {
    for (const src of [limiterSrc, recorderSrc]) {
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      try { await actx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    }
    return true;
  } catch (e) {
    console.warn('AudioWorklet modules failed to load', e);
    return false;
  }
}

/** Master limiter for any context. Falls back to the old compressor-style
    limiter only where AudioWorklet is unavailable. */
export function createLimiter(actx: BaseAudioContext, hasWorklets: boolean, ceiling: number): { node: AudioNode; setCeiling: (v: number) => void } {
  if (hasWorklets) {
    const node = new AudioWorkletNode(actx, 'pt-limiter', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers',
    });
    const p = node.parameters.get('ceiling')!;
    p.value = ceiling;
    return { node, setCeiling: (v) => { p.value = v; } };
  }
  const c = actx.createDynamicsCompressor();
  c.threshold.value = -1.5; c.knee.value = 0; c.ratio.value = 20; c.attack.value = 0.003; c.release.value = 0.12;
  return { node: c, setCeiling: () => {} };
}

export function reverbBuffer(actx: BaseAudioContext, type: ReverbType): AudioBuffer {
  const [l, r] = makeIR(actx.sampleRate, type);
  const b = actx.createBuffer(2, l.length, actx.sampleRate);
  b.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
  b.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
  return b;
}

class Engine {
  ctx: AudioContext | null = null;
  hasWorklets = false;
  master!: GainNode;
  masterAnalyser!: AnalyserNode;
  reverb!: ConvolverNode;
  /** Live Keys and drum voices play through these. */
  synthBus!: GainNode;
  drumBus!: GainNode;

  readonly buffers = new Map<string, AudioBuffer>();
  readonly peaks = new Map<string, Float32Array>();
  readonly chains = new Map<number, TrackChain>();

  private limiter!: { node: AudioNode; setCeiling: (v: number) => void };
  private reverbType: ReverbType | null = null;
  private ready: Promise<void> | null = null;
  /** User loudness ceiling, 0.2..1. Always applied; nothing bypasses it. */
  private userCeiling = 1;

  /** Create the context (must first be called from a user gesture) and load worklets. */
  ensure(): Promise<void> {
    this.ready ??= (async () => {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.masterAnalyser = ctx.createAnalyser();
      this.masterAnalyser.fftSize = 512;
      this.reverb = ctx.createConvolver();
      const ret = ctx.createGain();
      ret.gain.value = 0.9;
      this.reverb.connect(ret);
      ret.connect(this.master);
      this.setReverbType('room');
      this.synthBus = ctx.createGain();
      this.synthBus.connect(this.master);
      this.drumBus = ctx.createGain();
      this.drumBus.gain.value = 0.9 * DRUM_TRIM;
      this.drumBus.connect(this.master);
      this.hasWorklets = await addWorklets(ctx);
      this.limiter = createLimiter(ctx, this.hasWorklets, CEILING * this.userCeiling);
      this.master.connect(this.limiter.node);
      this.limiter.node.connect(this.masterAnalyser);
      this.limiter.node.connect(ctx.destination);
    })();
    void this.resume();
    return this.ready;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* needs a user gesture; the next one will do it */ }
    }
  }

  get now(): number { return this.ctx ? this.ctx.currentTime : 0; }

  setCeiling(v: number): void {
    this.userCeiling = Math.max(0.2, Math.min(1, v));
    this.limiter?.setCeiling(CEILING * this.userCeiling);
  }

  setReverbType(type: ReverbType): void {
    if (!this.ctx || type === this.reverbType) return;
    this.reverb.buffer = reverbBuffer(this.ctx, type);
    this.reverbType = type;
  }

  /** Wrap raw samples in an AudioBuffer and register it (with its peak envelope). */
  addBuffer(bufId: string, audio: AudioData): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(audio.channels.length, audio.channels[0].length, audio.sampleRate);
    audio.channels.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
    this.buffers.set(bufId, buf);
    this.peaks.set(bufId, computePeaks(audio.channels[0], buf.duration));
    return buf;
  }

  bufferData(bufId: string): AudioData | null {
    const b = this.buffers.get(bufId);
    if (!b) return null;
    return { sampleRate: b.sampleRate, channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)) };
  }

  async decodeFile(bytes: ArrayBuffer): Promise<AudioData> {
    const b = await this.ctx!.decodeAudioData(bytes.slice(0));
    return { sampleRate: b.sampleRate, channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)) };
  }

  clearBuffers(): void {
    this.buffers.clear();
    this.peaks.clear();
  }

  /** Make the live graph match the song: create, update and remove track chains. */
  sync(song: Song): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(song.masterVol, this.ctx.currentTime, 0.015);
    this.drumBus.gain.setTargetAtTime((song.drums?.vol ?? 0.9) * DRUM_TRIM, this.ctx.currentTime, 0.015);
    this.setReverbType(song.reverbType);
    const seen = new Set<number>();
    for (const t of song.tracks) {
      seen.add(t.id);
      let chain = this.chains.get(t.id);
      const fresh = !chain;
      if (!chain) {
        chain = new TrackChain(this.ctx, this.master, this.reverb, { meter: true });
        this.chains.set(t.id, chain);
      }
      chain.apply(t, audible(song, t), song.bpm, fresh);
    }
    for (const [id, chain] of this.chains) {
      if (!seen.has(id)) { chain.dispose(); this.chains.delete(id); }
    }
  }

  /** The small detent tick of a knob (silent in Calm mode: the caller decides). */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 2600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03 * this.userCeiling, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.02);
  }

  /** A sharp click at a set time, for measuring latency. */
  sharpClick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 2000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.0006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.04);
  }

  disposeChains(): void {
    for (const chain of this.chains.values()) chain.dispose();
    this.chains.clear();
  }
}

export const engine = new Engine();

const meterBuf = new Uint8Array(256);

/** RMS level 0..1 of an analyser (scaled like the old meters). */
export function meterLevel(an: AnalyserNode | null | undefined): number {
  if (!an) return 0;
  const n = Math.min(meterBuf.length, an.fftSize);
  an.getByteTimeDomainData(meterBuf);
  let s = 0;
  for (let i = 0; i < n; i++) { const v = (meterBuf[i] - 128) / 128; s += v * v; }
  return Math.min(1, Math.sqrt(s / n) * 2.6);
}

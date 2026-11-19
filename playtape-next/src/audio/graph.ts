/* One track's signal chain. Order (same as the single-file app's buildTrackChain):
     input → low cut ×2 → drive → drive level → [cab] → lo → mid → hi
           → [compressor → make-up] → [tremolo] → (+ [delay]) → pan → fader → [meter] → master
                                                                    fader → send → reverb
   Differences from the old app, on purpose:
   - The chain is built once and stays alive, so knobs work while stopped.
   - Parameters glide (setTargetAtTime) instead of jumping: no zipper noise.
   - The expensive nodes in [brackets] are present only when in use, and that
     rule is the same live and offline, so an export matches playback
     (the old offline graph dropped nodes the live graph kept).
   - Drive curve and cabinet are rebuilt only when their own controls change,
     and the cabinet impulse is deterministic. */

import { delayTimeSec, driveCurve, makeCabIR } from './dsp';
import type { CabType, Track } from '../model/types';

const GLIDE = 0.015;

const cabCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function cabBuffer(actx: BaseAudioContext, type: Exclude<CabType, 'off'>): AudioBuffer {
  let m = cabCache.get(actx);
  if (!m) cabCache.set(actx, (m = new Map()));
  let b = m.get(type);
  if (!b) {
    const [l, r] = makeCabIR(actx.sampleRate, type);
    b = actx.createBuffer(2, l.length, actx.sampleRate);
    b.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
    b.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
    m.set(type, b);
  }
  return b;
}

function shape(t: Track): string {
  return `${t.cab}|${t.squeeze > 0}|${t.delayOn}|${t.tremOn}`;
}

export class TrackChain {
  readonly input: GainNode;
  readonly analyser: AnalyserNode | null;
  private pan: StereoPannerNode;
  private fader: GainNode;
  private send: GainNode | null = null;

  private inner: AudioNode[] = [];
  private lc1!: BiquadFilterNode;
  private lc2!: BiquadFilterNode;
  private drive!: WaveShaperNode;
  private driveLvl!: GainNode;
  private lo!: BiquadFilterNode;
  private mid!: BiquadFilterNode;
  private hi!: BiquadFilterNode;
  private comp: DynamicsCompressorNode | null = null;
  private makeup: GainNode | null = null;
  private trem: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoDepth: GainNode | null = null;
  private delay: DelayNode | null = null;
  private fb: GainNode | null = null;
  private wet: GainNode | null = null;

  private shapeKey = '';
  private driveKey = '';

  constructor(
    private actx: BaseAudioContext,
    dest: AudioNode,
    reverbDest: AudioNode | null,
    opts: { meter?: boolean } = {},
  ) {
    this.input = actx.createGain();
    this.pan = actx.createStereoPanner();
    this.fader = actx.createGain();
    this.fader.gain.value = 0;
    this.pan.connect(this.fader);
    if (opts.meter) {
      this.analyser = actx.createAnalyser();
      this.analyser.fftSize = 256;
      this.fader.connect(this.analyser);
      this.analyser.connect(dest);
    } else {
      this.analyser = null;
      this.fader.connect(dest);
    }
    if (reverbDest) {
      this.send = actx.createGain();
      this.send.gain.value = 0;
      this.fader.connect(this.send);
      this.send.connect(reverbDest);
    }
  }

  private build(t: Track): void {
    const a = this.actx;
    try { this.input.disconnect(); } catch { /* not connected yet */ }
    for (const n of this.inner) { try { n.disconnect(); } catch { /* already gone */ } }
    if (this.lfo) { try { this.lfo.stop(); } catch { /* never started */ } }
    this.inner = [];
    this.comp = this.makeup = this.trem = this.lfoDepth = this.delay = this.fb = this.wet = null;
    this.lfo = null;

    let last: AudioNode = this.input;
    const link = <N extends AudioNode>(n: N): N => { last.connect(n); last = n; this.inner.push(n); return n; };

    this.lc1 = link(a.createBiquadFilter()); this.lc1.type = 'highpass'; this.lc1.Q.value = 0.707;
    this.lc2 = link(a.createBiquadFilter()); this.lc2.type = 'highpass'; this.lc2.Q.value = 0.707;
    this.drive = link(a.createWaveShaper());
    this.driveLvl = link(a.createGain());
    if (t.cab !== 'off') {
      const cab = link(a.createConvolver());
      cab.normalize = false;
      cab.buffer = cabBuffer(a, t.cab);
    }
    this.lo = link(a.createBiquadFilter()); this.lo.type = 'lowshelf'; this.lo.frequency.value = 120;
    this.mid = link(a.createBiquadFilter()); this.mid.type = 'peaking'; this.mid.frequency.value = 1000; this.mid.Q.value = 0.8;
    this.hi = link(a.createBiquadFilter()); this.hi.type = 'highshelf'; this.hi.frequency.value = 8000;
    if (t.squeeze > 0) {
      this.comp = link(a.createDynamicsCompressor());
      this.comp.knee.value = 8; this.comp.attack.value = 0.005; this.comp.release.value = 0.16;
      this.makeup = link(a.createGain());
    }
    if (t.tremOn) {
      this.trem = link(a.createGain());
      this.lfoDepth = a.createGain();
      this.lfoDepth.connect(this.trem.gain);
      this.inner.push(this.lfoDepth);
      this.startLfo(t, 0);
    }
    if (t.delayOn) {
      this.delay = a.createDelay(2.0);
      this.fb = a.createGain();
      this.wet = a.createGain();
      last.connect(this.delay);
      this.delay.connect(this.fb); this.fb.connect(this.delay);
      this.delay.connect(this.wet); this.wet.connect(this.pan);
      this.inner.push(this.delay, this.fb, this.wet);
    }
    last.connect(this.pan);
    this.shapeKey = shape(t);
    this.driveKey = '';
  }

  private startLfo(t: Track, when: number): void {
    if (!this.lfoDepth) return;
    if (this.lfo) { try { this.lfo.stop(); this.lfo.disconnect(); } catch { /* fine */ } }
    this.lfo = this.actx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = t.tremRate;
    this.lfo.connect(this.lfoDepth);
    this.lfo.start(when);
  }

  /** Restart the tremolo so its phase is tied to the start of playback. */
  retrigger(t: Track, when: number): void {
    if (t.tremOn) this.startLfo(t, when);
  }

  /** Push the track's settings into the nodes. `instant` skips the glide (offline, first build). */
  apply(t: Track, isAudible: boolean, bpm: number, instant = false): void {
    const rebuilt = shape(t) !== this.shapeKey;
    if (rebuilt) this.build(t);
    const now = this.actx.currentTime;
    const set = (p: AudioParam, v: number) => {
      if (instant || rebuilt) p.value = v; else p.setTargetAtTime(v, now, GLIDE);
    };
    const hp = t.lowcut > 0 ? t.lowcut : 10;
    set(this.lc1.frequency, hp); set(this.lc2.frequency, hp);
    const dk = t.driveOn ? `${t.driveType}:${t.drive.toFixed(3)}` : 'off';
    if (dk !== this.driveKey) {
      this.drive.curve = t.driveOn ? driveCurve(t.drive, t.driveType) : null;
      this.driveKey = dk;
    }
    set(this.driveLvl.gain, t.driveOn ? t.driveLevel : 1);
    set(this.lo.gain, t.eqLo); set(this.mid.gain, t.eqMid); set(this.hi.gain, t.eqHi);
    if (this.comp && this.makeup) {
      set(this.comp.threshold, -(t.squeeze * 38));
      set(this.comp.ratio, 1 + t.squeeze * 7);
      set(this.makeup.gain, 1 + t.squeeze * 0.7);
    }
    if (this.lfo && this.lfoDepth) {
      set(this.lfo.frequency, t.tremRate);
      set(this.lfoDepth.gain, t.tremDepth * 0.5);
    }
    if (this.delay && this.fb && this.wet) {
      set(this.delay.delayTime, delayTimeSec(t.delaySync, bpm));
      set(this.fb.gain, t.delayFb);
      set(this.wet.gain, t.delayMix);
    }
    set(this.pan.pan, t.pan);
    set(this.fader.gain, isAudible ? t.vol : 0);
    if (this.send) set(this.send.gain, isAudible ? t.verb * 0.8 : 0);
  }

  dispose(): void {
    if (this.lfo) { try { this.lfo.stop(); } catch { /* fine */ } }
    for (const n of [this.input, ...this.inner, this.pan, this.fader, this.send, this.analyser]) {
      try { n?.disconnect(); } catch { /* fine */ }
    }
  }
}

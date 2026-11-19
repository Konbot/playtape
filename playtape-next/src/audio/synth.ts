/* Keys: the four two-oscillator presets and the gliding "Stylo" (the old
   Pocket Synth), ported from keysVoice / styloVoice. One instrument, played
   from the screen, the computer keyboard or MIDI, recorded with the main
   Record key and rendered to audio when the take ends. */

import type { Note } from '../model/types';
import type { AudioData } from '../storage/wav';

export interface Preset {
  label: string;
  /** Monophonic with slides between notes. */
  mono?: boolean;
  w1: OscillatorType; w2: OscillatorType;
  semi2: number; det2: number; mix2: number;
  lp: number; a: number; d: number; s: number; r: number; vol: number;
}

export const PRESETS: Record<string, Preset> = {
  felt:  { label: 'Felt piano', w1: 'triangle', w2: 'sine',     semi2: -12, det2: 0,  mix2: 0.45, lp: 1700, a: 0.008, d: 0.4,  s: 0.3,  r: 0.35, vol: 0.55 },
  organ: { label: 'Organ',      w1: 'square',   w2: 'square',   semi2: 12,  det2: 0,  mix2: 0.5,  lp: 3800, a: 0.006, d: 0.06, s: 0.95, r: 0.09, vol: 0.3 },
  dream: { label: 'Dream',      w1: 'sawtooth', w2: 'sawtooth', semi2: 0,   det2: 12, mix2: 0.9,  lp: 1300, a: 0.12,  d: 0.5,  s: 0.6,  r: 0.7,  vol: 0.4 },
  bass:  { label: 'Fat bass',   w1: 'sawtooth', w2: 'square',   semi2: -12, det2: 0,  mix2: 0.6,  lp: 750,  a: 0.006, d: 0.25, s: 0.5,  r: 0.15, vol: 0.55 },
  // Stylo uses its own voice below; the envelope fields are only its tail length.
  stylo: { label: 'Stylo', mono: true, w1: 'sawtooth', w2: 'sawtooth', semi2: 0, det2: 0, mix2: 0, lp: 2400, a: 0.008, d: 0, s: 1, r: 0.06, vol: 0.7 },
};
export const PRESET_ORDER = ['felt', 'organ', 'dream', 'bass', 'stylo'];

const STYLO = { tone: 2400, vib: 0.35, vol: 0.7, glide: 0.05 };

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface PolyHandle { o1: OscillatorNode; o2: OscillatorNode; amp: GainNode; pr: Preset }
interface MonoHandle { osc: OscillatorNode; vib: OscillatorNode; amp: GainNode }

/** dur = null gives a held live voice (returns a handle); a number gives a one-shot. */
function polyVoice(actx: BaseAudioContext, dest: AudioNode, midi: number, vel: number, when: number, dur: number | null, pr: Preset): PolyHandle | null {
  const v = vel * pr.vol;
  const o1 = actx.createOscillator(); o1.type = pr.w1; o1.frequency.value = midiToFreq(midi);
  const o2 = actx.createOscillator(); o2.type = pr.w2; o2.frequency.value = midiToFreq(midi + pr.semi2); o2.detune.value = pr.det2;
  const g2 = actx.createGain(); g2.gain.value = pr.mix2;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = pr.lp; lp.Q.value = 0.8;
  const amp = actx.createGain(); amp.gain.value = 0.0001;
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(amp); amp.connect(dest);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(v, when + pr.a);
  amp.gain.setTargetAtTime(v * pr.s, when + pr.a, Math.max(0.01, pr.d / 3));
  o1.start(when); o2.start(when);
  if (dur != null) {
    const end = when + Math.max(0.05, dur);
    amp.gain.setTargetAtTime(0.0001, end, Math.max(0.02, pr.r / 3));
    o1.stop(end + pr.r + 0.3); o2.stop(end + pr.r + 0.3);
    return null;
  }
  return { o1, o2, amp, pr };
}

function styloVoice(actx: BaseAudioContext, dest: AudioNode, midi: number, when: number, dur: number | null, glideFrom: number | null | undefined): MonoHandle | null {
  const o = STYLO;
  const osc = actx.createOscillator(); osc.type = 'sawtooth';
  if (glideFrom != null && o.glide > 0) {
    osc.frequency.setValueAtTime(midiToFreq(glideFrom), when);
    osc.frequency.exponentialRampToValueAtTime(midiToFreq(midi), when + o.glide);
  } else osc.frequency.setValueAtTime(midiToFreq(midi), when);
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.tone; lp.Q.value = 3;
  const vib = actx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 6.5;
  const vibG = actx.createGain(); vibG.gain.value = o.vib * 5.5; vib.connect(vibG); vibG.connect(osc.frequency);
  const amp = actx.createGain(); amp.gain.value = 0.0001;
  osc.connect(lp); lp.connect(amp); amp.connect(dest);
  const a = 0.008, r = 0.06, lvl = o.vol;
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(lvl, when + a);
  if (dur != null) {
    const end = when + Math.max(0.05, dur);
    amp.gain.setValueAtTime(lvl, Math.max(when + a, end - r));
    amp.gain.linearRampToValueAtTime(0.0001, end);
    osc.start(when); vib.start(when); osc.stop(end + 0.03); vib.stop(end + 0.03);
    return null;
  }
  osc.start(when); vib.start(when);
  return { osc, vib, amp };
}

export interface NoteEvent {
  type: 'on' | 'off';
  pitch: number;
  vel: number;
  /** AudioContext time of the event. */
  time: number;
  glide?: number | null;
}

/** The live, playable instrument. */
export class LiveSynth {
  preset = 'felt';
  /** Called for every note start and end, so a recording can be captured. */
  onNote: ((e: NoteEvent) => void) | null = null;
  /** Called when the set of sounding pitches changes (to light the keys). */
  onHeld: ((pitches: number[]) => void) | null = null;

  private poly = new Map<number, PolyHandle>();
  private mono: { voice: MonoHandle; pitch: number } | null = null;
  /** Pitches physically held, oldest first (mono mode falls back to the previous one). */
  private stack: number[] = [];

  constructor(private getCtx: () => AudioContext | null, private getDest: () => AudioNode | null) {}

  private emitHeld(): void {
    this.onHeld?.(this.mono ? [this.mono.pitch] : [...this.poly.keys()]);
  }

  setPreset(name: string): void {
    if (!PRESETS[name] || name === this.preset) return;
    this.allOff();
    this.preset = name;
  }

  noteOn(pitch: number, vel = 0.8): void {
    const ctx = this.getCtx();
    const dest = this.getDest();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const pr = PRESETS[this.preset];
    if (pr.mono) {
      this.stack = this.stack.filter((p) => p !== pitch);
      this.stack.push(pitch);
      this.monoTo(pitch, vel, now);
    } else {
      if (this.poly.has(pitch)) return;
      const h = polyVoice(ctx, dest, pitch, vel, now, null, pr);
      if (!h) return;
      this.poly.set(pitch, h);
      this.onNote?.({ type: 'on', pitch, vel, time: now });
    }
    this.emitHeld();
  }

  private monoTo(pitch: number, vel: number, now: number): void {
    const ctx = this.getCtx()!;
    if (this.mono) {
      if (this.mono.pitch === pitch) return;
      const from = this.mono.pitch;
      const f = this.mono.voice.osc.frequency;
      try {
        f.cancelScheduledValues(now);
        f.setValueAtTime(f.value, now);
        f.exponentialRampToValueAtTime(midiToFreq(pitch), now + Math.max(0.005, STYLO.glide));
      } catch { /* voice already ending */ }
      this.onNote?.({ type: 'off', pitch: from, vel: 0, time: now });
      this.mono.pitch = pitch;
      this.onNote?.({ type: 'on', pitch, vel, time: now, glide: from });
    } else {
      const voice = styloVoice(ctx, this.getDest()!, pitch, now, null, null);
      if (!voice) return;
      this.mono = { voice, pitch };
      this.onNote?.({ type: 'on', pitch, vel, time: now, glide: null });
    }
  }

  noteOff(pitch: number): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (PRESETS[this.preset].mono) {
      this.stack = this.stack.filter((p) => p !== pitch);
      if (!this.mono) return;
      if (this.stack.length) this.monoTo(this.stack[this.stack.length - 1], 0.8, now);
      else this.monoStop(now);
    } else {
      const h = this.poly.get(pitch);
      if (!h) return;
      this.poly.delete(pitch);
      try {
        h.amp.gain.cancelScheduledValues(now);
        h.amp.gain.setValueAtTime(Math.max(0.0001, h.amp.gain.value), now);
        h.amp.gain.setTargetAtTime(0.0001, now, Math.max(0.02, h.pr.r / 3));
        h.o1.stop(now + h.pr.r + 0.3); h.o2.stop(now + h.pr.r + 0.3);
      } catch { /* already stopped */ }
      this.onNote?.({ type: 'off', pitch, vel: 0, time: now });
    }
    this.emitHeld();
  }

  private monoStop(now: number): void {
    const m = this.mono;
    if (!m) return;
    this.mono = null;
    try {
      m.voice.amp.gain.cancelScheduledValues(now);
      m.voice.amp.gain.setValueAtTime(m.voice.amp.gain.value, now);
      m.voice.amp.gain.linearRampToValueAtTime(0.0001, now + 0.05);
      m.voice.osc.stop(now + 0.08); m.voice.vib.stop(now + 0.08);
    } catch { /* already stopped */ }
    this.onNote?.({ type: 'off', pitch: m.pitch, vel: 0, time: now });
  }

  allOff(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    for (const p of [...this.poly.keys()]) this.noteOff(p);
    this.stack = [];
    this.monoStop(ctx.currentTime);
    this.emitHeld();
  }
}

/** Render recorded notes to mono audio. Note times are seconds from the start of the buffer. */
export async function renderNotes(notes: Note[], presetName: string, sampleRate: number): Promise<AudioData> {
  const pr = PRESETS[presetName] ?? PRESETS.felt;
  let end = 0;
  for (const n of notes) end = Math.max(end, n.start + n.dur);
  const total = Math.max(0.5, end + pr.r + 0.4);
  const off = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);
  for (const n of notes) {
    if (pr.mono) styloVoice(off, off.destination, n.pitch, n.start, n.dur, n.glide);
    else polyVoice(off, off.destination, n.pitch, n.vel, n.start, n.dur, pr);
  }
  const out = await off.startRendering();
  return { sampleRate, channels: [out.getChannelData(0)] };
}

/** Computer-keyboard layout: Z row and Q row, two octaves. */
export const QWERTY: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24,
};

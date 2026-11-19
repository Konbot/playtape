/* The drum machine voices (ported from dKick / dSnare / dHat / dClap).
   The old app built a fresh 0.4 s noise buffer for every single hit; here one
   seeded buffer per context is reused, which also makes a printed pattern
   identical every time. */

import { mulberry32 } from '../lib/prng';
import { DRUM_VOICES, emptyPattern, type DrumPattern, type DrumVoice } from '../model/types';
import type { AudioData } from '../storage/wav';

/** Headroom: a kick, snare and hat landing together peaked above full scale in the old voices. */
export const DRUM_TRIM = 0.72;

export const DRUM_LABELS: Record<DrumVoice, string> = { kick: 'Kick', snare: 'Snare', hatC: 'Hat', hatO: 'Open', clap: 'Clap' };

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(actx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(actx);
  if (!b) {
    const n = Math.floor(actx.sampleRate);
    b = actx.createBuffer(1, n, actx.sampleRate);
    const d = b.getChannelData(0);
    const rnd = mulberry32(0x44524d53);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
    noiseCache.set(actx, b);
  }
  return b;
}

/** A burst of noise; `seed` picks where in the buffer it starts so hits are not all identical. */
function burst(actx: BaseAudioContext, t: number, dur: number, seed: number): AudioBufferSourceNode {
  const src = actx.createBufferSource();
  src.buffer = noise(actx);
  src.start(t, (seed * 0.0731) % 0.5, dur);
  return src;
}

export function hit(actx: BaseAudioContext, dest: AudioNode, voice: DrumVoice, t: number, seed = 0): void {
  if (voice === 'kick') {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
  } else if (voice === 'snare') {
    const nb = burst(actx, t, 0.2, seed);
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const ng = actx.createGain(); ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    nb.connect(hp); hp.connect(ng); ng.connect(dest);
    const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = 180;
    const og = actx.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.12);
  } else if (voice === 'hatC' || voice === 'hatO') {
    const dur = voice === 'hatO' ? 0.3 : 0.05;
    const nb = burst(actx, t, dur + 0.02, seed + 3);
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = actx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    nb.connect(hp); hp.connect(g); g.connect(dest);
  } else {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.012;
      const nb = burst(actx, tt, 0.11, seed + i * 5);
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2;
      const g = actx.createGain(); g.gain.setValueAtTime(0.6, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.09);
      nb.connect(bp); bp.connect(g); g.connect(dest);
    }
  }
}

export function triggerStep(actx: BaseAudioContext, dest: AudioNode, pattern: DrumPattern, step: number, time: number): void {
  for (const v of DRUM_VOICES) if (pattern[v][step]) hit(actx, dest, v, time, step);
}

export const patternActive = (p: DrumPattern | undefined) => !!p && DRUM_VOICES.some((v) => p[v].some(Boolean));

export function basicBeat(): DrumPattern {
  const p = emptyPattern();
  p.kick[0] = p.kick[8] = true;
  p.snare[4] = p.snare[12] = true;
  for (let i = 0; i < 16; i += 2) p.hatC[i] = true;
  return p;
}

export const stepDur = (bpm: number) => 60 / bpm / 4;

/** Render `bars` bars of the pattern to mono audio. */
export async function renderPattern(pattern: DrumPattern, bpm: number, bars: number, vol: number, sampleRate: number): Promise<AudioData> {
  const sd = stepDur(bpm);
  const dur = bars * 16 * sd;
  const off = new OfflineAudioContext(1, Math.ceil((dur + 0.35) * sampleRate), sampleRate);
  const g = off.createGain();
  g.gain.value = vol * DRUM_TRIM;
  g.connect(off.destination);
  for (let s = 0; s < bars * 16; s++) triggerStep(off, g, pattern, s % 16, s * sd);
  const out = await off.startRendering();
  return { sampleRate, channels: [out.getChannelData(0)] };
}

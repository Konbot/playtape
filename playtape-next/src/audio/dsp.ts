/* Pure DSP helpers: no AudioContext needed, so they are unit-testable and
   give the same result live and offline. Ported from the single-file app
   (makeIR, buildCabBuffer, driveCurveTyped, computePeaks) with the random
   noise replaced by a seeded generator. */

import { mulberry32 } from '../lib/prng';
import type { CabType, DriveType, ReverbType } from '../model/types';

const IR_SEEDS: Record<ReverbType, number> = { room: 0x52304f4d, hall: 0x48414c4c, plate: 0x504c4154, spring: 0x5350524e };

/** Stereo reverb impulse response. */
export function makeIR(sampleRate: number, type: ReverbType): [Float32Array, Float32Array] {
  let dur = 1.2, decay = 2.5, bright = 1;
  let echoes: number[] | null = null;
  if (type === 'room') { dur = 0.6; decay = 3.2; bright = 0.7; }
  else if (type === 'hall') { dur = 2.8; decay = 2.2; bright = 0.85; }
  else if (type === 'plate') { dur = 1.6; decay = 1.8; bright = 1.3; }
  else if (type === 'spring') { dur = 1.3; decay = 2.0; bright = 1.1; echoes = [0.035, 0.07, 0.11]; }
  const len = Math.floor(sampleRate * dur);
  const out: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const rnd = mulberry32(IR_SEEDS[type] + c * 7919);
    const d = new Float32Array(len);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, decay);
    if (echoes) echoes.forEach((e, k) => { const s = Math.floor(e * sampleRate); if (s < len) d[s] += (k % 2 ? -1 : 1) * 0.5 * (1 - k * 0.25); });
    let prev = 0;
    for (let i = 0; i < len; i++) { prev = prev * 0.6 + d[i] * 0.4; d[i] = d[i] * bright + prev * (1 - bright); }
    out.push(d);
  }
  return [out[0], out[1]];
}

/** Speaker-cabinet impulse response. Never called with 'off'. */
export function makeCabIR(sampleRate: number, type: Exclude<CabType, 'off'>): [Float32Array, Float32Array] {
  const dur = type === '4x12' ? 0.045 : 0.03;
  const cut = type === '4x12' ? 3200 : 5200;
  const len = Math.floor(sampleRate * dur);
  const a = Math.exp((-2 * Math.PI * cut) / sampleRate);
  const out: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const rnd = mulberry32((type === '4x12' ? 0x34783132 : 0x31783132) + c * 104729);
    const d = new Float32Array(len);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const imp = i === 0 ? 1 : (rnd() * 2 - 1) * Math.pow(1 - i / len, 2.2) * 0.6;
      lp = lp + (1 - a) * (imp - lp);
      d[i] = lp;
    }
    out.push(d);
  }
  return [out[0], out[1]];
}

export function driveCurve(amount: number, type: DriveType): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  let k = amount * 80;
  if (type === 'clean') k = amount * 22;
  else if (type === 'fuzz') k = amount * 260;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    let y = ((1 + k) * x) / (1 + k * Math.abs(x));
    if (type === 'fuzz') y = Math.max(-0.92, Math.min(0.92, y * 1.4));
    curve[i] = y;
  }
  return curve;
}

/** Peak envelope of one channel at roughly 100 points per second. */
export function computePeaks(ch: Float32Array, duration: number): Float32Array {
  const total = Math.min(12000, Math.max(1000, Math.ceil(duration * 100)));
  const block = Math.max(1, Math.floor(ch.length / total));
  const peaks = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    let max = 0;
    const s = i * block;
    for (let j = 0; j < block; j++) { const v = Math.abs(ch[s + j] || 0); if (v > max) max = v; }
    peaks[i] = max;
  }
  return peaks;
}

/** Delay time for a note value at a tempo. */
export function delayTimeSec(sync: string, bpm: number): number {
  const beat = 60 / bpm;
  if (sync === '1/4') return beat;
  if (sync === '1/8.') return beat * 0.75;
  if (sync === '1/16') return beat * 0.25;
  return beat * 0.5;
}

/** Where a finished take lands on the timeline.
    Capture starts before the downbeat (count-in, scheduling lead) and arrives
    late by the round-trip latency; both are trimmed off rather than shifted,
    so the pre-roll stays reachable by dragging the clip's left edge. */
export function placeTake(o: {
  startFrame: number;
  sampleRate: number;
  playStartCtx: number;
  playStartHead: number;
  offsetSec: number;
  duration: number;
  punch?: { a: number; b: number } | null;
}): { offset: number; trimStart: number; trimEnd: number } {
  const startTime = o.startFrame / o.sampleRate;
  let pos = o.playStartHead + (startTime - o.playStartCtx) - o.offsetSec;
  let ts = 0;
  const keepFrom = o.punch ? o.punch.a : o.playStartHead;
  if (pos < keepFrom) {
    const cut = Math.min(keepFrom - pos, Math.max(0, o.duration - 0.05));
    ts += cut;
    pos += cut;
  }
  let te = o.duration;
  if (o.punch) te = Math.min(te, ts + Math.max(0.05, o.punch.b - pos));
  return { offset: Math.max(0, pos), trimStart: ts, trimEnd: te };
}

/* Pitch detection for the tuner (autocorrelation, ported from the
   single-file app). Pure, so it is testable with synthetic tones. */

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Fundamental frequency in Hz, or -1 when the input is too quiet to tell. */
export function autoCorrelate(input: Float32Array, rate: number): number {
  let size = input.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += input[i] * input[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;
  let r1 = 0, r2 = size - 1;
  const thres = 0.2;
  for (let i = 0; i < size / 2; i++) if (Math.abs(input[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < size / 2; i++) if (Math.abs(input[size - i]) < thres) { r2 = size - i; break; }
  const buf = input.subarray(r1, r2);
  size = buf.length;
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) { let s = 0; for (let j = 0; j < size - i; j++) s += buf[j] * buf[j + i]; c[i] = s; }
  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;
  let maxv = -1, maxp = -1;
  for (let i = d; i < size; i++) if (c[i] > maxv) { maxv = c[i]; maxp = i; }
  if (maxp <= 0) return -1;
  let t0 = maxp;
  const x1 = c[t0 - 1] || 0, x2 = c[t0], x3 = c[t0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
  if (a) t0 = t0 - b / (2 * a);
  return rate / t0;
}

export function describePitch(hz: number): { name: string; cents: number; midi: number } {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const round = Math.round(midi);
  return { name: NOTES[((round % 12) + 12) % 12] + (Math.floor(round / 12) - 1), cents: Math.round((midi - round) * 100), midi: round };
}

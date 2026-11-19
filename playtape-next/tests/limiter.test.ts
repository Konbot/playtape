import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Runs the real worklet source with a minimal stand-in for the worklet globals. */
function loadLimiter(sampleRate: number) {
  const src = readFileSync(new URL('../src/audio/worklets/limiter.worklet.js', import.meta.url), 'utf8');
  let Proc: any;
  class AudioWorkletProcessor {}
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src)(
    AudioWorkletProcessor, (_name: string, c: unknown) => { Proc = c; }, sampleRate,
  );
  return new Proc();
}

function run(proc: any, input: Float32Array, ceiling: number): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) {
    const inL = input.subarray(i, i + 128);
    const oL = new Float32Array(128);
    const oR = new Float32Array(128);
    proc.process([[inL, inL]], [[oL, oR]], { ceiling: [ceiling] });
    out.set(oL.subarray(0, Math.min(128, input.length - i)), i);
  }
  return out;
}

describe('master limiter', () => {
  const rate = 48000;
  const L = Math.round(rate * 0.005);

  it('never lets a sample past the ceiling, even on a sudden +12 dB burst', () => {
    const input = new Float32Array(128 * 200);
    for (let i = 0; i < input.length; i++) {
      const loud = i > 6000 && i < 9000;
      input[i] = Math.sin(i * 0.31) * (loud ? 3.5 : 0.3);
    }
    input[12000] = 5; // single-sample spike
    const out = run(loadLimiter(rate), input, 0.89);
    let max = 0;
    for (const v of out) max = Math.max(max, Math.abs(v));
    expect(max).toBeLessThanOrEqual(0.89 + 1e-6);
  });

  it('passes quiet audio through unchanged apart from the lookahead delay', () => {
    const input = new Float32Array(128 * 40);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i * 0.05) * 0.4;
    const out = run(loadLimiter(rate), input, 0.89);
    for (let i = L; i < input.length; i += 97) expect(out[i]).toBeCloseTo(input[i - L], 6);
  });

  it('has already turned down when the peak arrives (no reliance on the hard clamp)', () => {
    const input = new Float32Array(128 * 60);
    for (let i = 3000; i < 5000; i++) input[i] = 2 * Math.sin((i - 3000) * 0.2);
    const proc = loadLimiter(rate);
    run(proc, input.subarray(0, 3072 + 128 * 2), 0.89);
    // 3000 + L = when the burst leaves the delay line; by then gain must be near 0.89/2
    expect(proc.env).toBeLessThan(0.5);
  });

  it('recovers after the loud part', () => {
    const input = new Float32Array(rate);
    for (let i = 0; i < 2000; i++) input[i] = 3;
    const proc = loadLimiter(rate);
    run(proc, input, 0.89);
    expect(proc.env).toBeGreaterThan(0.99);
  });
});

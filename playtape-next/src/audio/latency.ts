/* Round-trip latency measurement (ported from detectOnsets /
   analyzeCalibration): play sharp clicks, record them, and take the median
   delay between each click and the moment it shows up at the input. */

/** Sample indexes where the level jumps up (click arrivals). */
export function detectOnsets(ch: Float32Array, sr: number): number[] {
  const hop = Math.floor(sr * 0.005), win = Math.floor(sr * 0.02);
  const energies: { i: number; e: number }[] = [];
  for (let i = 0; i + win < ch.length; i += hop) {
    let s = 0;
    for (let j = 0; j < win; j++) { const v = ch[i + j]; s += v * v; }
    energies.push({ i, e: Math.sqrt(s / win) });
  }
  let maxE = 0;
  for (const o of energies) if (o.e > maxE) maxE = o.e;
  if (maxE < 0.01) return [];
  const thr = maxE * 0.25;
  const onsets: number[] = [];
  let last = -1e9, prev = 0;
  for (const o of energies) {
    if (o.e > thr && prev <= thr && o.i - last > sr * 0.1) { onsets.push(o.i); last = o.i; }
    prev = o.e;
  }
  // The energy window lights up as soon as the click enters its far end, up to
  // one window (20 ms) before the click itself: the old app reported that early
  // edge and so under-measured. Walk forward to the sample where the click starts.
  return onsets.map((start) => {
    const stop = Math.min(ch.length, start + win + hop);
    let peak = 0;
    for (let i = start; i < stop; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; }
    const gate = peak * 0.2;
    for (let i = start; i < stop; i++) if (Math.abs(ch[i]) >= gate) return i;
    return start;
  });
}

export type LatencyResult = { ok: true; ms: number; heard: number } | { ok: false; heard: number; reason: string };

/** `emits` are the context times the clicks were scheduled at; `startTime` is
    the context time of the first captured sample. */
export function measureLatency(data: Float32Array, startTime: number, sr: number, emits: number[]): LatencyResult {
  const detected = detectOnsets(data, sr).map((i) => startTime + i / sr);
  const delays: number[] = [];
  for (const et of emits) {
    let best: number | null = null;
    for (const dt of detected) { const d = dt - et; if (d > 0.002 && d < 0.4 && (best == null || d < best)) best = d; }
    if (best != null) delays.push(best);
  }
  if (delays.length < 3) {
    return { ok: false, heard: delays.length, reason: `Heard only ${delays.length} of ${emits.length} clicks. The clicks must reach this input: turn the speakers up, hold an earcup to the mic, or for an instrument input run a cable from the output into it (gain right down).` };
  }
  delays.sort((a, b) => a - b);
  const ms = Math.round(delays[Math.floor(delays.length / 2)] * 1000);
  if (ms < 1 || ms > 500) return { ok: false, heard: delays.length, reason: `Measured ${ms} ms, which looks wrong. Try again, or set the offset by ear.` };
  return { ok: true, ms, heard: delays.length };
}

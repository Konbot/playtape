/* Master brick-wall limiter with 5 ms lookahead.
   The old app used a DynamicsCompressor (ratio 20, 3 ms attack) as its
   "limiter": transients overshot it and the WAV encoder then hard-clipped.
   Here the gain needed for each incoming sample is known 5 ms before that
   sample leaves the delay line, so the gain is already down when the peak
   arrives. Runs unchanged in AudioContext and OfflineAudioContext. */
class LimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ceiling', defaultValue: 0.89, minValue: 0.05, maxValue: 1, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.L = Math.max(16, Math.round(sampleRate * 0.005));
    this.bufL = new Float32Array(this.L);
    this.bufR = new Float32Array(this.L);
    this.pos = 0;
    this.env = 1;
    // Sliding minimum of the wanted gain over the lookahead window (monotonic deque).
    this.cap = this.L + 2;
    this.dqVal = new Float32Array(this.cap);
    this.dqIdx = new Float64Array(this.cap);
    this.head = 0;
    this.count = 0;
    this.n = 0;
    this.att = 1 - Math.exp(-1 / (this.L * 0.22));
    this.rel = 1 - Math.exp(-1 / (sampleRate * 0.12));
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const inp = inputs[0];
    const inL = inp && inp[0];
    const inR = inp && (inp[1] || inp[0]);
    const oL = out[0];
    const oR = out[1];
    const c = params.ceiling[0];
    const { L, cap, dqVal, dqIdx, bufL, bufR, att, rel } = this;
    let { pos, env, head, count, n } = this;
    for (let i = 0; i < oL.length; i++) {
      const l = inL ? inL[i] : 0;
      const r = inR ? inR[i] : 0;
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      const peak = al > ar ? al : ar;
      const g = peak > c ? c / peak : 1;
      while (count > 0 && dqVal[(head + count - 1) % cap] >= g) count--;
      const tail = (head + count) % cap;
      dqVal[tail] = g;
      dqIdx[tail] = n;
      count++;
      while (dqIdx[head] < n - L) { head = (head + 1) % cap; count--; }
      const target = dqVal[head];
      env += (target - env) * (target < env ? att : rel);
      let yl = bufL[pos] * env;
      let yr = bufR[pos] * env;
      bufL[pos] = l;
      bufR[pos] = r;
      pos = pos + 1 === L ? 0 : pos + 1;
      if (yl > c) yl = c; else if (yl < -c) yl = -c;
      if (yr > c) yr = c; else if (yr < -c) yr = -c;
      oL[i] = yl;
      if (oR) oR[i] = yr;
      n++;
    }
    this.pos = pos; this.env = env; this.head = head; this.count = count; this.n = n;
    return true;
  }
}
registerProcessor('pt-limiter', LimiterProcessor);

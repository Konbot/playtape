/* Sample-accurate capture (ported from the single-file app's RecProcessor)
   plus an always-on input meter, so the level is visible before recording,
   and an optional ring buffer holding the last minute ("Catch that!").
   mode: 0 = input 1 (left), 1 = input 2 (right), 2 = both mixed to mono.
   The output carries exactly what would be recorded, so the live monitor
   plays the socket you chose and nothing else. */
const RING_SECONDS = 60;

class RecProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.started = false;
    this.mode = 2;
    this.buf = [];
    this.count = 0;
    this.batch = 4096;
    this.peak = 0;
    this.meterCount = 0;
    this.ring = null;
    this.ringPos = 0;
    this.ringFill = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.cmd === 'mode') this.mode = d.mode;
      else if (d.cmd === 'start') { this.recording = true; this.started = false; this.buf = []; this.count = 0; if (d.mode !== undefined) this.mode = d.mode; }
      else if (d.cmd === 'stop') { this.recording = false; this.flush(); this.port.postMessage({ type: 'stopped', frame: currentFrame }); }
      else if (d.cmd === 'ring') {
        // Memory only: nothing leaves this processor unless 'grab' is sent.
        this.ring = d.on ? new Float32Array(Math.floor(sampleRate * RING_SECONDS)) : null;
        this.ringPos = 0;
        this.ringFill = 0;
      } else if (d.cmd === 'grab') this.grab(d.seconds);
    };
  }

  grab(seconds) {
    const ring = this.ring;
    const n = ring ? Math.min(this.ringFill, Math.floor(seconds * sampleRate)) : 0;
    const out = new Float32Array(n);
    if (n) {
      const len = ring.length;
      let from = this.ringPos - n;
      if (from < 0) from += len;
      const first = Math.min(n, len - from);
      out.set(ring.subarray(from, from + first), 0);
      if (first < n) out.set(ring.subarray(0, n - first), first);
    }
    this.port.postMessage({ type: 'ring', samples: out, frame: currentFrame }, [out.buffer]);
  }

  flush() {
    if (!this.buf.length) return;
    let total = 0;
    for (const a of this.buf) total += a.length;
    const out = new Float32Array(total);
    let o = 0;
    for (const a of this.buf) { out.set(a, o); o += a.length; }
    this.buf = [];
    this.count = 0;
    this.port.postMessage({ type: 'data', samples: out }, [out.buffer]);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const a = input && input[0];
    if (!a) return true;
    const b = input[1];
    const n = a.length;
    const mode = this.mode;
    const copy = this.recording ? new Float32Array(n) : null;
    const thru = outputs[0] && outputs[0][0];
    const ring = this.ring;
    let rp = this.ringPos;
    let pk = this.peak;
    for (let i = 0; i < n; i++) {
      const v = mode === 1 && b ? b[i] : mode === 0 || !b ? a[i] : (a[i] + b[i]) * 0.5;
      if (copy) copy[i] = v;
      if (thru) thru[i] = v;
      if (ring) { ring[rp] = v; rp = rp + 1 === ring.length ? 0 : rp + 1; }
      const av = v < 0 ? -v : v;
      if (av > pk) pk = av;
    }
    if (ring) { this.ringPos = rp; this.ringFill = Math.min(ring.length, this.ringFill + n); }
    this.peak = pk;
    this.meterCount += n;
    if (this.meterCount >= 1536) {
      this.port.postMessage({ type: 'meter', peak: pk });
      this.peak = 0;
      this.meterCount = 0;
    }
    if (copy) {
      if (!this.started) { this.started = true; this.port.postMessage({ type: 'started', frame: currentFrame }); }
      this.buf.push(copy);
      this.count += n;
      if (this.count >= this.batch) this.flush();
    }
    return true;
  }
}
registerProcessor('pt-recorder', RecProcessor);

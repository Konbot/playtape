import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectOnsets, measureLatency } from '../src/audio/latency';
import { autoCorrelate, describePitch } from '../src/audio/tuner';
import { crc32, safeName, zipStore } from '../src/storage/zip';

describe('tuner', () => {
  const tone = (hz: number, rate = 48000, n = 2048) => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / rate) + 0.15 * Math.sin((4 * Math.PI * hz * i) / rate);
    return d;
  };

  it('finds the pitch of guitar strings within a couple of cents', () => {
    for (const [hz, name] of [[82.41, 'E2'], [110, 'A2'], [196, 'G3'], [329.63, 'E4']] as const) {
      const got = autoCorrelate(tone(hz), 48000);
      expect(Math.abs(1200 * Math.log2(got / hz))).toBeLessThan(3);
      expect(describePitch(got).name).toBe(name);
    }
  });

  it('reports flat and sharp in cents', () => {
    expect(describePitch(440).cents).toBe(0);
    expect(describePitch(440 * Math.pow(2, 20 / 1200)).cents).toBe(20);
    expect(describePitch(440 * Math.pow(2, -35 / 1200))).toMatchObject({ name: 'A4', cents: -35 });
  });

  it('says nothing when it is quiet', () => {
    expect(autoCorrelate(new Float32Array(2048), 48000)).toBe(-1);
  });
});

describe('latency measurement', () => {
  const sr = 48000;
  /** A recording that starts at context time 5 s with clicks arriving `delay` after each emit. */
  function recording(emits: number[], delay: number, startTime = 5) {
    const data = new Float32Array(sr * 5);
    for (let i = 0; i < data.length; i++) data[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.002; // faint noise floor
    for (const et of emits) {
      const at = Math.round((et + delay - startTime) * sr);
      for (let j = 0; j < 400; j++) if (at + j < data.length) data[at + j] += 0.8 * Math.sin(j * 0.26) * Math.exp(-j / 90);
    }
    return data;
  }
  const emits = Array.from({ length: 8 }, (_, i) => 5.3 + i * 0.5);

  it('finds one onset per click', () => {
    expect(detectOnsets(recording(emits, 0.03), sr)).toHaveLength(8);
  });

  it('measures the round trip to within 2 ms', () => {
    for (const ms of [18, 42, 137]) {
      const r = measureLatency(recording(emits, ms / 1000), 5, sr, emits);
      expect(r.ok).toBe(true);
      if (r.ok) expect(Math.abs(r.ms - ms)).toBeLessThanOrEqual(2);
    }
  });

  it('explains what to do when the clicks did not reach the input', () => {
    const r = measureLatency(new Float32Array(sr * 5), 5, sr, emits);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Heard only 0 of 8/);
  });
});

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes an archive other tools can read', () => {
    const a = new TextEncoder().encode('hello stems');
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    const parts = zipStore([{ name: 'Song/Gtr.wav', data: a }, { name: 'Song/Vöx.wav', data: b }], new Date(2026, 10, 18, 12, 0, 0));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const zip = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { zip.set(p, o); o += p.length; }
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    // end of central directory: 2 entries, and it points at a central directory record
    const end = total - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(v.getUint32(cdOffset + 16, true)).toBe(crc32(a));
    // first file's bytes sit right after its header and name
    const nameLen = v.getUint16(26, true);
    expect(new TextDecoder().decode(zip.subarray(30 + nameLen, 30 + nameLen + a.length))).toBe('hello stems');
    // second entry's stored offset points at a local header
    const cd2 = cdOffset + 46 + nameLen;
    expect(v.getUint32(v.getUint32(cd2 + 42, true), true)).toBe(0x04034b50);
  });

  it('makes file names safe but readable', () => {
    expect(safeName('Idea · Wed 18 Nov 14:32')).toBe('Idea · Wed 18 Nov 14 32');
    expect(safeName('a/b\\c?*.')).toBe('a b c');
    expect(safeName('  ')).toBe('song');
  });
});

describe('mp3 encoder (the bundled lamejs)', () => {
  it('still produces MPEG frames', () => {
    const src = readFileSync(new URL('../src/vendor/lame.min.js', import.meta.url), 'utf8');
    const lamejs = new Function(`${src}\nreturn lamejs;`)();
    const enc = new lamejs.Mp3Encoder(2, 44100, 192);
    const n = 1152 * 20;
    const l = new Int16Array(n), r = new Int16Array(n);
    for (let i = 0; i < n; i++) { l[i] = Math.sin(i * 0.05) * 12000; r[i] = Math.sin(i * 0.07) * 12000; }
    const a = enc.encodeBuffer(l, r);
    const b = enc.flush();
    const bytes = new Uint8Array(a.length + b.length);
    bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.length), 0);
    bytes.set(new Uint8Array(b.buffer, b.byteOffset, b.length), a.length);
    expect(bytes.length).toBeGreaterThan(4000);
    // MPEG audio frame sync: 11 set bits
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1] & 0xe0).toBe(0xe0);
  });
});

/* WAV encode/decode. Pure functions so the round trip is testable without a
   browser. Internal storage keeps raw float samples; WAV is for export and
   for reading files written by TAPE and the old PLAYTAPE. */

import { mulberry32 } from '../lib/prng';

export interface AudioData {
  sampleRate: number;
  channels: Float32Array[];
}

/** 16-bit PCM with TPDF dither (seeded, so identical input gives identical bytes). */
export function encodeWav16(audio: AudioData, dither = true): ArrayBuffer {
  const ch = audio.channels.length;
  const len = audio.channels[0]?.length ?? 0;
  const out = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(out);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, audio.sampleRate, true); v.setUint32(28, audio.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const rnd = mulberry32(0x54504446);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      let s = audio.channels[c][i] * 32767;
      if (dither) s += rnd() - rnd();
      s = Math.round(s);
      v.setInt16(o, s < -32768 ? -32768 : s > 32767 ? 32767 : s, true);
      o += 2;
    }
  }
  return out;
}

/** Reads PCM 8/16/24/32-bit and 32-bit float WAV. Returns null for anything else. */
export function decodeWav(bytes: ArrayBuffer): AudioData | null {
  const v = new DataView(bytes);
  if (bytes.byteLength < 44) return null;
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let fmt = 0, ch = 0, rate = 0, bits = 0, dataOff = -1, dataLen = 0;
  let p = 12;
  while (p + 8 <= bytes.byteLength) {
    const id = tag(p);
    const size = v.getUint32(p + 4, true);
    if (id === 'fmt ') {
      fmt = v.getUint16(p + 8, true); ch = v.getUint16(p + 10, true);
      rate = v.getUint32(p + 12, true); bits = v.getUint16(p + 22, true);
      if (fmt === 0xfffe && size >= 26) fmt = v.getUint16(p + 32, true); // WAVE_FORMAT_EXTENSIBLE sub-format
    } else if (id === 'data') {
      dataOff = p + 8;
      dataLen = Math.min(size, bytes.byteLength - dataOff);
      break;
    }
    p += 8 + size + (size & 1);
  }
  if (dataOff < 0 || !ch || !rate) return null;
  if (!((fmt === 1 && [8, 16, 24, 32].includes(bits)) || (fmt === 3 && bits === 32))) return null;
  const bps = bits / 8;
  const frames = Math.floor(dataLen / (bps * ch));
  const channels = Array.from({ length: ch }, () => new Float32Array(frames));
  let o = dataOff;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      let s: number;
      if (fmt === 3) s = v.getFloat32(o, true);
      else if (bits === 16) s = v.getInt16(o, true) / 32768;
      else if (bits === 24) s = ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16))) / 8388608;
      else if (bits === 32) s = v.getInt32(o, true) / 2147483648;
      else s = (v.getUint8(o) - 128) / 128;
      channels[c][i] = s;
      o += bps;
    }
  }
  return { sampleRate: rate, channels };
}

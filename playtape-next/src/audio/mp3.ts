/* MP3 export. The encoder (the same lamejs 1.2.1 the single-file apps
   bundle) runs in a Worker so a long song never freezes the page; the old app
   encoded on the main thread in timer slices. The 156 KB encoder is loaded
   only when an MP3 is actually made. */

import type { AudioData } from '../storage/wav';

const WORKER = `
self.onmessage = (e) => {
  const { left, right, sampleRate, kbps } = e.data;
  const enc = new lamejs.Mp3Encoder(2, sampleRate, kbps);
  const n = left.length, block = 1152 * 24, out = [];
  const l16 = new Int16Array(block), r16 = new Int16Array(block);
  let total = 0, blocks = 0;
  for (let i = 0; i < n; i += block) {
    const len = Math.min(block, n - i);
    for (let j = 0; j < len; j++) {
      let a = left[i + j]; a = a < -1 ? -1 : a > 1 ? 1 : a; l16[j] = a < 0 ? a * 0x8000 : a * 0x7fff;
      let b = right[i + j]; b = b < -1 ? -1 : b > 1 ? 1 : b; r16[j] = b < 0 ? b * 0x8000 : b * 0x7fff;
    }
    const m = enc.encodeBuffer(l16.subarray(0, len), r16.subarray(0, len));
    if (m.length) { out.push(new Uint8Array(m.buffer, m.byteOffset, m.length).slice()); total += m.length; }
    if (++blocks % 8 === 0) self.postMessage({ progress: (i + len) / n });
  }
  const tail = enc.flush();
  if (tail.length) { out.push(new Uint8Array(tail.buffer, tail.byteOffset, tail.length).slice()); total += tail.length; }
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const a of out) { bytes.set(a, o); o += a.length; }
  self.postMessage({ done: bytes.buffer }, [bytes.buffer]);
};`;

export async function encodeMp3(audio: AudioData, onProgress?: (p: number) => void, kbps = 192): Promise<ArrayBuffer> {
  const lame = (await import('../vendor/lame.min.js?raw')).default;
  const url = URL.createObjectURL(new Blob([lame, '\n', WORKER], { type: 'application/javascript' }));
  const worker = new Worker(url);
  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ progress?: number; done?: ArrayBuffer }>) => {
        if (e.data.progress != null) onProgress?.(e.data.progress);
        else if (e.data.done) resolve(e.data.done);
      };
      worker.onerror = (e) => reject(new Error(e.message || 'MP3 encoder failed'));
      // Copies, so the rendered mix stays usable (and the worker can own its input).
      const left = audio.channels[0].slice();
      const right = (audio.channels[1] ?? audio.channels[0]).slice();
      worker.postMessage({ left, right, sampleRate: audio.sampleRate, kbps }, [left.buffer, right.buffer]);
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

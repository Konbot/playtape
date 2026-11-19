/* The portable single-file project format shared with TAPE and the old
   PLAYTAPE: JSON { tape: 1, project: <project.json v4>, media: [{ bufId, name, b64 }] }
   where each media entry is a base64 WAV. */

import { fitClipsToBuffers, songFromLegacy, songToLegacy, type LegacyProject } from '../model/legacy';
import { usedBufIds, type Song } from '../model/types';
import { decodeWav, encodeWav16, type AudioData } from './wav';

export function b64FromBytes(ab: ArrayBuffer): string {
  const u8 = new Uint8Array(ab);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)) as unknown as number[]);
  return btoa(s);
}

export function bytesFromB64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8.buffer;
}

/** Returns the file as string parts (one per take) so a long song never has
    to exist as a single giant string. Wrap in `new Blob(parts)`. */
export function buildTapeParts(song: Song, audio: Map<string, AudioData>): string[] {
  const names = new Map<string, string>();
  const used: string[] = [];
  for (const bufId of usedBufIds(song)) if (audio.has(bufId)) { names.set(bufId, bufId + '.wav'); used.push(bufId); }
  const project = songToLegacy(song, names);
  project.buffers = used.map((bufId) => ({ bufId, mediaFile: names.get(bufId)! }));
  const parts: string[] = ['{"tape":1,"project":', JSON.stringify(project), ',"media":['];
  used.forEach((bufId, i) => {
    const b64 = b64FromBytes(encodeWav16(audio.get(bufId)!));
    parts.push(`${i ? ',' : ''}{"bufId":${JSON.stringify(bufId)},"name":${JSON.stringify(names.get(bufId))},"b64":"`, b64, '"}');
  });
  parts.push(']}');
  return parts;
}

export interface ParsedTape {
  song: Song;
  audio: Map<string, AudioData>;
  /** Media entries that could not be decoded. */
  failed: string[];
}

/** `decodeOther` handles media that is not plain WAV (imported mp3/m4a kept
    as original bytes by the old app); in the browser that is decodeAudioData. */
export async function parseTape(
  text: string,
  opts: { id: string; fallbackName: string; now: number; color?: number; decodeOther?: (bytes: ArrayBuffer) => Promise<AudioData | null> },
): Promise<ParsedTape> {
  const data = JSON.parse(text) as { tape?: number; project?: LegacyProject; media?: { bufId: string; name: string; b64: string }[] };
  if (!data.tape || !data.project) throw new Error('Not a .tape file');
  const audio = new Map<string, AudioData>();
  const failed: string[] = [];
  for (const m of data.media ?? []) {
    try {
      const bytes = bytesFromB64(m.b64);
      const decoded = decodeWav(bytes) ?? (opts.decodeOther ? await opts.decodeOther(bytes) : null);
      if (decoded) audio.set(m.bufId, decoded); else failed.push(m.name);
    } catch {
      failed.push(m.name);
    }
  }
  const song = songFromLegacy(data.project, opts);
  const durations = new Map<string, number>();
  for (const [id, a] of audio) durations.set(id, a.channels[0].length / a.sampleRate);
  fitClipsToBuffers(song, durations);
  return { song, audio, failed };
}

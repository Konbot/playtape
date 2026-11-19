import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTrack, newSong, type Song, type SongMeta } from '../src/model/types';
import { deleteSong, getAudio, listAudioIds, listSongs, loadSong, putAudio, resetConnection, saveSong, deleteAudio } from '../src/storage/db';
import { buildTapeParts, parseTape } from '../src/storage/tapefile';
import { decodeWav, encodeWav16, type AudioData } from '../src/storage/wav';

function tone(seconds: number, hz: number, rate = 8000, amp = 0.5): Float32Array {
  const d = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * hz * i) / rate) * amp;
  return d;
}

const meta = (song: Song, modified = song.modified): SongMeta => ({
  id: song.id, name: song.name, created: song.created, modified, duration: 1, color: song.color, trackCount: song.tracks.length, peaks: [],
});

describe('wav', () => {
  it('round-trips 16-bit within one LSB of dither', () => {
    const audio: AudioData = { sampleRate: 8000, channels: [tone(0.25, 440), tone(0.25, 660)] };
    const bytes = encodeWav16(audio);
    expect(bytes.byteLength).toBe(44 + 2000 * 2 * 2);
    const back = decodeWav(bytes)!;
    expect(back.sampleRate).toBe(8000);
    expect(back.channels).toHaveLength(2);
    let worst = 0;
    for (let i = 0; i < 2000; i++) worst = Math.max(worst, Math.abs(back.channels[1][i] - audio.channels[1][i]));
    expect(worst).toBeLessThan(2.5 / 32768);
  });

  it('encodes identical input to identical bytes', () => {
    const audio: AudioData = { sampleRate: 8000, channels: [tone(0.1, 300)] };
    expect(new Uint8Array(encodeWav16(audio))).toEqual(new Uint8Array(encodeWav16(audio)));
  });

  it('never wraps on overs', () => {
    const back = decodeWav(encodeWav16({ sampleRate: 8000, channels: [new Float32Array([1.5, -1.5, 1, -1])] }, false))!;
    expect(back.channels[0][0]).toBeCloseTo(32767 / 32768, 4);
    expect(back.channels[0][1]).toBe(-1);
  });

  it('reads float and 24-bit files and rejects junk', () => {
    const mk = (fmt: number, bits: number, write: (v: DataView, o: number) => void) => {
      const b = new ArrayBuffer(44 + bits / 8);
      const v = new DataView(b);
      'RIFF'.split('').forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
      'WAVE'.split('').forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
      'fmt '.split('').forEach((c, i) => v.setUint8(12 + i, c.charCodeAt(0)));
      v.setUint32(16, 16, true); v.setUint16(20, fmt, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true); v.setUint16(34, bits, true);
      'data'.split('').forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0)));
      v.setUint32(40, bits / 8, true);
      write(v, 44);
      return b;
    };
    expect(decodeWav(mk(3, 32, (v, o) => v.setFloat32(o, -0.25, true)))!.channels[0][0]).toBeCloseTo(-0.25);
    expect(decodeWav(mk(1, 24, (v, o) => { v.setUint8(o, 0); v.setUint8(o + 1, 0); v.setUint8(o + 2, 0xc0); }))!.channels[0][0]).toBeCloseTo(-0.5);
    expect(decodeWav(new ArrayBuffer(10))).toBeNull();
    expect(decodeWav(new TextEncoder().encode('ID3' + 'x'.repeat(60)).buffer as ArrayBuffer)).toBeNull();
  });
});

describe('.tape files', () => {
  it('round-trips a song and its audio', async () => {
    const song = newSong(1000, 3);
    song.name = 'Round "trip"';
    song.bpm = 123;
    const t = makeTrack(song, 'Gtr');
    t.clips.push({ id: 1, bufId: 'b1', offset: 0.5, trimStart: 0.05, trimEnd: 0.2 });
    song.tracks.push(t);
    const audio = new Map<string, AudioData>([['b1', { sampleRate: 8000, channels: [tone(0.25, 440)] }]]);
    const text = buildTapeParts(song, audio).join('');
    const raw = JSON.parse(text);
    expect(raw.tape).toBe(1);
    expect(raw.project.version).toBe(4);
    expect(raw.project.tracks[0].color).toMatch(/^--t\d$/);
    const back = await parseTape(text, { id: 'new', fallbackName: 'x', now: 2000 });
    expect(back.failed).toEqual([]);
    expect(back.song.name).toBe('Round "trip"');
    expect(back.song.bpm).toBe(123);
    expect(back.song.tracks[0].clips[0]).toMatchObject({ bufId: 'b1', offset: 0.5, trimStart: 0.05, trimEnd: 0.2 });
    expect(back.audio.get('b1')!.channels[0].length).toBe(2000);
  });

  it('rejects files that are not .tape', async () => {
    await expect(parseTape('{"hello":1}', { id: 'a', fallbackName: 'x', now: 1 })).rejects.toThrow(/Not a \.tape/);
  });
});

describe('library database', () => {
  beforeEach(() => {
    resetConnection();
    indexedDB = new IDBFactory();
  });

  it('saves, lists newest first, loads and deletes songs with their audio', async () => {
    const a = newSong(1000);
    const b = newSong(2000);
    a.tracks.push(makeTrack(a));
    await saveSong(a, meta(a));
    await saveSong(b, meta(b));
    await putAudio(a.id, 'b1', { sampleRate: 8000, channels: [tone(0.1, 440)] });
    await putAudio(a.id, 'b2', { sampleRate: 8000, channels: [tone(0.1, 220)] });
    await putAudio(b.id, 'b1', { sampleRate: 8000, channels: [tone(0.1, 110)] });

    expect((await listSongs()).map((m) => m.id)).toEqual([b.id, a.id]);
    expect((await loadSong(a.id))!.tracks).toHaveLength(1);
    expect((await getAudio(a.id, 'b2'))!.channels[0].length).toBe(800);
    expect((await listAudioIds(a.id)).sort()).toEqual(['b1', 'b2']);

    await deleteAudio(a.id, ['b2']);
    expect(await getAudio(a.id, 'b2')).toBeNull();

    await deleteSong(a.id);
    expect(await loadSong(a.id)).toBeNull();
    expect(await listAudioIds(a.id)).toEqual([]);
    expect((await getAudio(b.id, 'b1'))!.channels[0].length).toBe(800);
    expect((await listSongs()).map((m) => m.id)).toEqual([b.id]);
  });

  it('keeps float samples exactly', async () => {
    const s = newSong(1);
    const data = new Float32Array([0, 0.123456, -0.98765, 1]);
    await putAudio(s.id, 'b1', { sampleRate: 44100, channels: [data] });
    expect(Array.from((await getAudio(s.id, 'b1'))!.channels[0])).toEqual(Array.from(data));
  });
});

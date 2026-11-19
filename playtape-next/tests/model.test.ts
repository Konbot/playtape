import { describe, expect, it } from 'vitest';
import { History } from '../src/model/history';
import { fitClipsToBuffers, legacyBufferList, songFromLegacy, songToLegacy, type LegacyProject } from '../src/model/legacy';
import { autoName, makeTrack, newSong, pickTrackColor, songDuration } from '../src/model/types';
import { placeTake, makeIR, makeCabIR, driveCurve } from '../src/audio/dsp';

describe('song model', () => {
  it('names a new song without asking', () => {
    expect(autoName(new Date(2026, 10, 18, 14, 32))).toBe('Idea · Wed 18 Nov 14:32');
    expect(autoName(new Date(2027, 0, 3, 9, 5))).toBe('Idea · Sun 3 Jan 09:05');
  });

  it('gives each new track a free colour and id', () => {
    const song = newSong(1000);
    const a = makeTrack(song); song.tracks.push(a);
    const b = makeTrack(song); song.tracks.push(b);
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(a.color).not.toBe(b.color);
    song.tracks.splice(0, 1);
    expect(pickTrackColor(song)).toBe(a.color);
  });

  it('measures duration including nudge', () => {
    const song = newSong(1000);
    const t = makeTrack(song);
    t.nudge = 0.1;
    t.clips.push({ id: 1, bufId: 'b1', offset: 2, trimStart: 1, trimEnd: 4 });
    song.tracks.push(t);
    expect(songDuration(song)).toBeCloseTo(5.1);
  });
});

describe('history', () => {
  it('undoes and redoes snapshots, and a new change clears redo', () => {
    const h = new History<{ n: number }>();
    let state = { n: 1 };
    h.push('set 2', state); state = { n: 2 };
    h.push('set 3', state); state = { n: 3 };
    expect(h.undoLabel).toBe('set 3');
    state = h.undo(state)!.state;
    expect(state.n).toBe(2);
    state = h.undo(state)!.state;
    expect(state.n).toBe(1);
    expect(h.undo(state)).toBeNull();
    state = h.redo(state)!.state;
    expect(state.n).toBe(2);
    h.push('set 9', state); state = { n: 9 };
    expect(h.canRedo).toBe(false);
  });

  it('keeps at most `limit` entries', () => {
    const h = new History<number>(3);
    for (let i = 0; i < 10; i++) h.push('x', i);
    let count = 0;
    while (h.undo(0)) count++;
    expect(count).toBe(3);
  });
});

describe('take placement', () => {
  const base = { sampleRate: 48000, playStartCtx: 10, playStartHead: 4, duration: 6 };

  it('trims the scheduling lead and latency instead of shifting the take', () => {
    // capture began 60 ms before the downbeat; round trip is 20 ms
    const r = placeTake({ ...base, startFrame: (10 - 0.06) * 48000, offsetSec: 0.02 });
    expect(r.offset).toBeCloseTo(4);
    expect(r.trimStart).toBeCloseTo(0.08);
    expect(r.trimEnd).toBe(6);
  });

  it('drops a whole count-in', () => {
    const r = placeTake({ ...base, startFrame: (10 - 2.4) * 48000, offsetSec: 0 });
    expect(r.offset).toBeCloseTo(4);
    expect(r.trimStart).toBeCloseTo(2.4);
  });

  it('never places before zero', () => {
    const r = placeTake({ ...base, playStartHead: 0, startFrame: 10 * 48000, offsetSec: 0.05 });
    expect(r.offset).toBe(0);
    expect(r.trimStart).toBeCloseTo(0.05);
  });

  it('keeps only the punch region', () => {
    const r = placeTake({ ...base, playStartHead: 2, startFrame: 10 * 48000, offsetSec: 0, punch: { a: 4, b: 6 } });
    expect(r.offset).toBeCloseTo(4);
    expect(r.trimStart).toBeCloseTo(2);
    expect(r.trimEnd).toBeCloseTo(4);
  });
});

describe('deterministic impulses', () => {
  it('builds the same reverb and cabinet every time', () => {
    expect(Array.from(makeIR(8000, 'plate')[0].slice(0, 64))).toEqual(Array.from(makeIR(8000, 'plate')[0].slice(0, 64)));
    expect(Array.from(makeCabIR(8000, '4x12')[1])).toEqual(Array.from(makeCabIR(8000, '4x12')[1]));
    expect(makeIR(8000, 'room')[0][10]).not.toBe(makeIR(8000, 'room')[1][10]);
  });

  it('drive curve is odd-symmetric around the centre and bounded', () => {
    const c = driveCurve(0.6, 'fuzz');
    expect(c[1024]).toBeCloseTo(0, 5);
    expect(Math.max(...c)).toBeLessThanOrEqual(0.92 + 1e-6);
    expect(c[1024 + 200]).toBeCloseTo(-c[1024 - 200], 5);
  });
});

describe('TAPE project compatibility', () => {
  const legacy: LegacyProject = {
    version: 4, name: 'My song', bpm: 96, masterVol: 0.8, reverbType: 'hall', playhead: 3,
    loop: { on: true, a: 1, b: 5 },
    playtape: { stage: 2, keysPreset: 'organ', keysMelody: [{ pitch: 60, vel: 0.8, start: 0, dur: 1 }] },
    drums: { pattern: { kick: [true] }, vol: 0.9, live: true },
    buffers: [{ bufId: 'b1', mediaFile: 'b1.wav' }, { bufId: 'b2', mediaFile: 'imp_riff.mp3' }],
    tracks: [
      { id: 1, name: 'Gtr', color: '--t3', mute: false, solo: true, nudge: 0.01, lowcut: 80, eqLo: 2, squeeze: 0.4, vol: 1.1,
        driveOn: true, driveType: 'fuzz', cab: '4x12', delayOn: true, delaySync: '1/8.',
        clips: [{ id: 5, bufId: 'b1', offset: 1, trimStart: 0.2, trimEnd: 3 }] },
      { id: 4, name: 'Riff', color: '--t5', clips: [{ id: 6, bufId: 'b2', offset: 0, trimStart: 0, trimEnd: 99 }] },
    ],
  };

  it('reads a version 4 project', () => {
    const song = songFromLegacy(legacy, { id: 's1', fallbackName: 'x', now: 5 });
    expect(song.name).toBe('My song');
    expect(song.bpm).toBe(96);
    expect(song.reverbType).toBe('hall');
    expect(song.loop).toEqual({ on: true, a: 1, b: 5 });
    expect(song.tracks[0]).toMatchObject({ id: 1, color: 2, solo: true, lowcut: 80, driveType: 'fuzz', cab: '4x12', delaySync: '1/8.', eqMid: 0 });
    expect(song.tracks[1].color).toBe(4);
    fitClipsToBuffers(song, new Map([['b1', 3], ['b2', 7.5]]));
    expect(song.tracks[1].clips[0].trimEnd).toBe(7.5);
  });

  it('writes it back without losing what it does not understand', () => {
    const song = songFromLegacy(legacy, { id: 's1', fallbackName: 'x', now: 5 });
    const out = songToLegacy(song, new Map([['b1', 'b1.wav'], ['b2', 'imp_riff.mp3']]));
    expect(out.version).toBe(4);
    // the drum pattern is understood now: normalised to 16 steps, and never left "live"
    expect(out.drums!.pattern!.kick).toHaveLength(16);
    expect(out.drums!.pattern!.kick[0]).toBe(true);
    expect(out.drums!.pattern!.snare.some(Boolean)).toBe(false);
    expect(out.drums).toMatchObject({ vol: 0.9, live: false });
    expect(out.playtape).toMatchObject(legacy.playtape!);
    expect(out.buffers).toEqual(legacy.buffers);
    expect(out.tracks![0]).toMatchObject(legacy.tracks![0]);
    expect(out.tracks![1].color).toBe('--t5');
    // and it survives a second pass
    const again = songFromLegacy(out, { id: 's1', fallbackName: 'x', now: 5 });
    expect(again.tracks).toEqual(song.tracks);
    expect(again.legacyExtra).toEqual(song.legacyExtra);
    expect(again.drums).toEqual(song.drums);
  });

  it('reads pre-clip projects (one take per track)', () => {
    const old: LegacyProject = { tracks: [{ id: 2, name: 'Vox', mediaFile: 'track2.wav', offset: 1.5, trimStart: 0.1 }] };
    expect(legacyBufferList(old)).toEqual([{ bufId: 'b2', mediaFile: 'track2.wav' }]);
    const song = songFromLegacy(old, { id: 's', fallbackName: 'Old one', now: 1 });
    expect(song.name).toBe('Old one');
    fitClipsToBuffers(song, new Map([['b2', 8]]));
    expect(song.tracks[0].clips[0]).toMatchObject({ bufId: 'b2', offset: 1.5, trimStart: 0.1, trimEnd: 8 });
    expect(song.tracks[0].clips[0].id).toBeGreaterThan(0);
  });

  it('drops clips whose audio is missing', () => {
    const song = songFromLegacy(legacy, { id: 's1', fallbackName: 'x', now: 5 });
    fitClipsToBuffers(song, new Map([['b1', 3]]));
    expect(song.tracks[1].clips).toHaveLength(0);
  });
});

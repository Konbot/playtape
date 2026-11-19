import { describe, expect, it } from 'vitest';
import { duplicateClip, landTake, moveClip, snapTime, splitClip, switchTake } from '../src/model/edit';
import { fitClipsToBuffers, songFromLegacy, songToLegacy } from '../src/model/legacy';
import { clipEnd, makeTrack, newSong, usedBufIds, type Clip, type Track } from '../src/model/types';

const clip = (id: number, bufId: string, offset: number, dur: number, trimStart = 0): Clip => ({ id, bufId, offset, trimStart, trimEnd: trimStart + dur });

function track(...clips: Clip[]): Track {
  const t = makeTrack(newSong(1));
  t.clips = clips;
  return t;
}

function ids(start: number) {
  let n = start;
  return () => ++n;
}

describe('split', () => {
  it('cuts a clip in two at a song position', () => {
    const c = clip(1, 'b1', 2, 6, 0.5);
    const right = splitClip(c, 5, 2)!;
    expect(c).toMatchObject({ offset: 2, trimStart: 0.5, trimEnd: 3.5 });
    expect(right).toMatchObject({ id: 2, bufId: 'b1', offset: 5, trimStart: 3.5, trimEnd: 6.5 });
    expect(clipEnd(right)).toBe(8);
  });

  it('refuses positions outside the clip or on its very edge', () => {
    const c = clip(1, 'b1', 2, 6);
    expect(splitClip(c, 1, 2)).toBeNull();
    expect(splitClip(c, 2.01, 2)).toBeNull();
    expect(splitClip(c, 8, 2)).toBeNull();
    expect(c.trimEnd).toBe(6);
  });
});

describe('recording onto a track', () => {
  it('keeps a retake of the same part as another take, not as overlapping audio', () => {
    const t = track(clip(1, 'b1', 4, 8));
    landTake(t, clip(2, 'b2', 4.1, 7.8), ids(10));
    expect(t.clips).toHaveLength(1);
    const c = t.clips[0];
    expect(c.bufId).toBe('b2');
    expect(c.takes!.map((k) => k.bufId)).toEqual(['b1', 'b2']);
    expect(c.take).toBe(1);
  });

  it('a third pass stacks on the first two', () => {
    const t = track(clip(1, 'b1', 4, 8));
    landTake(t, clip(2, 'b2', 4, 8), ids(10));
    landTake(t, clip(3, 'b3', 4, 8), ids(10));
    expect(t.clips).toHaveLength(1);
    expect(t.clips[0].takes!.map((k) => k.bufId)).toEqual(['b1', 'b2', 'b3']);
    expect(t.clips[0].take).toBe(2);
  });

  it('punching into the middle of a long clip splits it and keeps the old middle as take 1', () => {
    const t = track(clip(1, 'b1', 0, 20));
    landTake(t, clip(2, 'b2', 8, 4), ids(10));
    const sorted = [...t.clips].sort((a, b) => a.offset - b.offset);
    expect(sorted.map((c) => [c.offset, clipEnd(c), c.bufId])).toEqual([[0, 8, 'b1'], [8, 12, 'b2'], [12, 20, 'b1']]);
    const mid = sorted[1];
    expect(mid.takes).toEqual([
      { bufId: 'b1', offset: 8, trimStart: 8, trimEnd: 12 },
      { bufId: 'b2', offset: 8, trimStart: 0, trimEnd: 4 },
    ]);
    // nothing overlaps
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].offset).toBeGreaterThanOrEqual(clipEnd(sorted[i - 1]) - 1e-9);
  });

  it('covers partial overlaps like tape, trimming what was there', () => {
    const t = track(clip(1, 'b1', 0, 5), clip(2, 'b2', 6, 5));
    landTake(t, clip(3, 'b3', 4, 4), ids(10));
    const sorted = [...t.clips].sort((a, b) => a.offset - b.offset);
    expect(sorted.map((c) => [c.offset, clipEnd(c), c.bufId])).toEqual([[0, 4, 'b1'], [4, 8, 'b3'], [8, 11, 'b2']]);
    expect(sorted[1].takes).toBeUndefined();
  });

  it('leaves clips elsewhere on the track alone', () => {
    const far = clip(1, 'b1', 30, 5);
    const t = track(far);
    landTake(t, clip(2, 'b2', 0, 5), ids(10));
    expect(t.clips).toHaveLength(2);
    expect(t.clips[0]).toBe(far);
  });
});

describe('takes', () => {
  it('switches which take plays and remembers each take\'s own trim', () => {
    const t = track(clip(1, 'b1', 4, 8));
    landTake(t, clip(2, 'b2', 4.2, 7), ids(10));
    const c = t.clips[0];
    c.trimStart = 0.5; // user trims the active take
    switchTake(c, 0);
    expect(c).toMatchObject({ bufId: 'b1', offset: 4, trimStart: 0, trimEnd: 8, take: 0 });
    switchTake(c, 1);
    expect(c).toMatchObject({ bufId: 'b2', offset: 4.2, trimStart: 0.5, take: 1 });
    switchTake(c, 2); // wraps
    expect(c.take).toBe(0);
  });

  it('moving a clip moves every take with it', () => {
    const t = track(clip(1, 'b1', 4, 8));
    landTake(t, clip(2, 'b2', 4.2, 7), ids(10));
    const c = t.clips[0];
    moveClip(c, 10.2);
    switchTake(c, 0);
    expect(c.offset).toBeCloseTo(10);
  });

  it('counts take buffers as used, and survives the TAPE project round trip', () => {
    const song = newSong(1);
    const t = makeTrack(song);
    t.clips = [clip(1, 'b1', 4, 8)];
    landTake(t, clip(2, 'b2', 4, 8), ids(10));
    t.clips[0].midi = { preset: 'felt', notes: [{ pitch: 60, vel: 0.8, start: 0.1, dur: 0.5 }] };
    song.tracks.push(t);
    expect([...usedBufIds(song)].sort()).toEqual(['b1', 'b2']);
    const legacy = songToLegacy(song, new Map());
    expect(legacy.buffers!.map((b) => b.bufId).sort()).toEqual(['b1', 'b2']);
    // the fields TAPE reads describe the active take
    expect(legacy.tracks![0].clips![0]).toMatchObject({ bufId: 'b2', offset: 4, trimStart: 0, trimEnd: 8 });
    const back = songFromLegacy(JSON.parse(JSON.stringify(legacy)), { id: 'x', fallbackName: 'x', now: 1 });
    expect(back.tracks[0].clips[0].takes).toEqual(song.tracks[0].clips[0].takes);
    expect(back.tracks[0].clips[0].midi).toEqual(song.tracks[0].clips[0].midi);
    // a take whose audio went missing is dropped, the clip stays
    fitClipsToBuffers(back, new Map([['b2', 8]]));
    expect(back.tracks[0].clips[0].takes).toBeUndefined();
    expect(back.tracks[0].clips[0].bufId).toBe('b2');
  });
});

describe('duplicate and snap', () => {
  it('places the copy right after the original', () => {
    const c = clip(1, 'b1', 2, 3, 1);
    const d = duplicateClip(c, 9);
    expect(d).toMatchObject({ id: 9, offset: 5, trimStart: 1, trimEnd: 4 });
    expect(d).not.toBe(c);
  });

  it('prefers a nearby magnet, then the grid, then leaves the time alone', () => {
    expect(snapTime(3.96, [4, 10], 0.1, 0.25)).toBe(4);
    expect(snapTime(3.6, [4, 10], 0.1, 0.25)).toBe(3.5);
    expect(snapTime(3.6, [4, 10], 0.1, null)).toBe(3.6);
  });
});

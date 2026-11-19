/* Clip editing as pure functions on the song model, so the rules are
   testable without a browser. */

import { clipDur, clipEnd, type Clip, type TakeRef, type Track } from './types';

const EPS = 0.02;

export const takeOf = (c: Clip): TakeRef => ({ bufId: c.bufId, offset: c.offset, trimStart: c.trimStart, trimEnd: c.trimEnd });

/** Split a clip at a song position. Returns the right-hand piece (already
    trimmed) or null when the position is not inside the clip. The left piece
    is the original, shortened. Alternate takes and notes stay with neither:
    a split piece is plain audio. */
export function splitClip(c: Clip, at: number, newId: number): Clip | null {
  if (at <= c.offset + EPS || at >= clipEnd(c) - EPS) return null;
  const cut = c.trimStart + (at - c.offset);
  const right: Clip = { id: newId, bufId: c.bufId, offset: at, trimStart: cut, trimEnd: c.trimEnd };
  c.trimEnd = cut;
  delete c.takes;
  delete c.take;
  delete c.midi;
  return right;
}

/** Put a freshly recorded clip on a track the way tape would: it covers what
    was there. If it is a retake of (roughly) one existing clip, that clip's
    audio is kept inside the new one as an earlier take instead of being lost.
    Clips that only partly overlap are trimmed back to make room. */
export function landTake(track: Track, clip: Clip, nextId: () => number): void {
  const s = clip.offset;
  const e = clipEnd(clip);
  // Nobody starts a retake on exactly the same sample: an old clip that pokes
  // out by less than this still counts as "the same part".
  const slack = Math.max(0.6, (e - s) * 0.15);
  const kept: Clip[] = [];
  const covered: Clip[] = [];
  for (const c of track.clips) {
    const cs = c.offset;
    const ce = clipEnd(c);
    if (ce <= s + EPS || cs >= e - EPS) { kept.push(c); continue; }
    const whole = cs >= s - slack && ce <= e + slack;
    if (whole) { covered.push(c); continue; }
    // partly outside the new take: keep the outside parts, the inside part is covered
    let mid: Clip = c;
    if (cs < s - EPS) {
      const right = splitClip(mid, s, nextId());
      kept.push(mid); // left piece stays
      if (!right) continue;
      mid = right;
    }
    if (clipEnd(mid) > e + EPS) {
      const right = splitClip(mid, e, nextId());
      if (right) kept.push(right);
    }
    covered.push(mid);
  }
  const span = e - s;
  if (covered.length === 1 && clipDur(covered[0]) >= span * 0.6) {
    const old = covered[0];
    const earlier = old.takes?.length ? old.takes.map((t) => ({ ...t })) : [takeOf(old)];
    clip.takes = [...earlier, takeOf(clip)];
    clip.take = clip.takes.length - 1;
  }
  track.clips = [...kept, clip];
}

/** Make another take the one that plays. */
export function switchTake(c: Clip, index: number): void {
  if (!c.takes || c.takes.length < 2) return;
  const cur = c.take ?? c.takes.length - 1;
  const next = ((index % c.takes.length) + c.takes.length) % c.takes.length;
  c.takes[cur] = takeOf(c);
  const t = c.takes[next];
  c.bufId = t.bufId; c.offset = t.offset; c.trimStart = t.trimStart; c.trimEnd = t.trimEnd;
  c.take = next;
  delete c.midi; // notes belong to the take they were played on
}

/** Move a clip in time; its other takes travel with it. */
export function moveClip(c: Clip, newOffset: number): void {
  const off = Math.max(0, newOffset);
  const d = off - c.offset;
  c.offset = off;
  if (c.takes) c.takes.forEach((t, i) => { if (i !== c.take) t.offset = Math.max(0, t.offset + d); });
}

export function duplicateClip(c: Clip, newId: number): Clip {
  const copy: Clip = JSON.parse(JSON.stringify(c));
  copy.id = newId;
  const d = clipEnd(c) - c.offset;
  moveClip(copy, c.offset + d);
  return copy;
}

/** Snap a time to the nearest of a set of magnetic points if one is within
    `reach` seconds; otherwise to `grid` (when given); otherwise leave it. */
export function snapTime(t: number, magnets: number[], reach: number, grid: number | null): number {
  let best = t;
  let bestD = reach;
  for (const m of magnets) {
    const d = Math.abs(m - t);
    if (d < bestD) { best = m; bestD = d; }
  }
  if (bestD < reach) return best;
  if (grid) return Math.round(t / grid) * grid;
  return t;
}

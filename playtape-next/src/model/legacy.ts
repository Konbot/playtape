/* Conversion to and from the project.json shape (version 4) shared by TAPE
   and the single-file PLAYTAPE. Rule from CONTRIBUTING.md: project files must
   stay compatible in both directions, and anything app-specific lives under a
   namespaced key so the other app can ignore it. */

import { DRUM_VOICES, TRACK_COLOR_COUNT, emptyPattern, trackDefaults, usedBufIds, type Clip, type Note, type ReverbType, type Song, type TakeRef, type Track, type TrackParams } from './types';

export interface LegacyClip { id: number; bufId: string; offset: number; trimStart: number; trimEnd: number; takes?: TakeRef[]; take?: number; midi?: { preset: string; notes: Note[] } }

export interface LegacyTrack extends Partial<TrackParams> {
  id: number;
  name?: string;
  color?: string;
  mute?: boolean;
  solo?: boolean;
  clips?: LegacyClip[];
  /** Pre-clip projects: one take per track. */
  mediaFile?: string;
  offset?: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface LegacyProject {
  version?: number;
  name?: string;
  bpm?: number;
  masterVol?: number;
  reverbType?: string;
  playhead?: number;
  loop?: { on?: boolean; a?: number; b?: number };
  playtape?: Record<string, unknown>;
  drums?: { pattern?: Record<string, boolean[]>; vol?: number; live?: boolean };
  buffers?: { bufId: string; mediaFile: string }[];
  tracks?: LegacyTrack[];
}

const REVERBS: ReverbType[] = ['room', 'hall', 'plate', 'spring'];

function colorIndex(c: string | undefined, fallback: number): number {
  const m = /--t(\d)/.exec(c ?? '');
  return m ? (parseInt(m[1], 10) - 1) % TRACK_COLOR_COUNT : fallback % TRACK_COLOR_COUNT;
}

/** Which media file holds each buffer, for loading a project's audio. */
export function legacyBufferList(data: LegacyProject): { bufId: string; mediaFile: string }[] {
  if (data.buffers) return data.buffers;
  return (data.tracks ?? []).filter((t) => t.mediaFile).map((t) => ({ bufId: 'b' + t.id, mediaFile: t.mediaFile! }));
}

export function songFromLegacy(data: LegacyProject, opts: { id: string; fallbackName: string; now: number; color?: number }): Song {
  const defaults = trackDefaults();
  let clipId = 0;
  const tracks: Track[] = (data.tracks ?? []).map((td, i) => {
    const params = { ...defaults } as TrackParams;
    for (const k of Object.keys(defaults) as (keyof TrackParams)[]) {
      if (td[k] !== undefined) (params as unknown as Record<string, unknown>)[k] = td[k];
    }
    let clips: Clip[];
    if (td.clips) clips = td.clips.map((c) => {
      const clip: Clip = { id: c.id, bufId: c.bufId, offset: c.offset, trimStart: c.trimStart, trimEnd: c.trimEnd };
      if (Array.isArray(c.takes) && c.takes.length > 1) { clip.takes = c.takes.map((t) => ({ ...t })); clip.take = c.take ?? c.takes.length - 1; }
      if (c.midi) clip.midi = { preset: c.midi.preset, notes: c.midi.notes.map((n) => ({ ...n })) };
      return clip;
    });
    else if (td.mediaFile) clips = [{ id: 0, bufId: 'b' + td.id, offset: td.offset ?? 0, trimStart: td.trimStart ?? 0, trimEnd: td.trimEnd ?? Number.MAX_VALUE }];
    else clips = [];
    return { id: td.id, name: td.name ?? `Track ${td.id}`, color: colorIndex(td.color, i), mute: !!td.mute, solo: !!td.solo, clips, ...params };
  });
  for (const t of tracks) for (const c of t.clips) clipId = Math.max(clipId, c.id);
  for (const t of tracks) for (const c of t.clips) if (!c.id) c.id = ++clipId;
  const reverb = REVERBS.includes(data.reverbType as ReverbType) ? (data.reverbType as ReverbType) : 'room';
  const song: Song = {
    id: opts.id,
    name: data.name || opts.fallbackName,
    created: opts.now,
    modified: opts.now,
    bpm: Math.min(240, Math.max(40, data.bpm || 100)),
    masterVol: data.masterVol ?? 0.9,
    reverbType: reverb,
    loop: { on: !!data.loop?.on, a: data.loop?.a || 0, b: data.loop?.b || 0 },
    color: opts.color ?? 0,
    tracks,
  };
  // Carried through untouched so a round trip to TAPE loses nothing.
  if (data.drums?.pattern) {
    const pattern = emptyPattern();
    for (const v of DRUM_VOICES) {
      const row = data.drums.pattern[v];
      if (Array.isArray(row)) for (let i = 0; i < 16; i++) pattern[v][i] = !!row[i];
    }
    song.drums = { pattern, vol: data.drums.vol ?? 0.9 };
  }
  if (data.playtape !== undefined) {
    const { next: _next, ...playtape } = data.playtape;
    song.legacyExtra = { playtape };
  }
  return song;
}

/** Clamp clip windows to the real buffer lengths (and drop clips whose audio is missing). */
export function fitClipsToBuffers(song: Song, durations: Map<string, number>): void {
  for (const t of song.tracks) {
    t.clips = t.clips.filter((c) => durations.has(c.bufId));
    for (const c of t.clips) {
      const d = durations.get(c.bufId)!;
      c.trimEnd = Math.min(c.trimEnd, d);
      c.trimStart = Math.max(0, Math.min(c.trimStart, c.trimEnd - 0.01));
      if (c.takes) {
        // a take whose audio is gone cannot be switched to; keep the rest
        const active = c.takes[c.take ?? c.takes.length - 1];
        c.takes = c.takes.filter((k) => k === active || durations.has(k.bufId));
        if (c.takes.length < 2) { delete c.takes; delete c.take; } else c.take = Math.max(0, c.takes.indexOf(active));
      }
    }
  }
}

export function songToLegacy(song: Song, mediaNames: Map<string, string>): LegacyProject {
  const extra = song.legacyExtra;
  const used = usedBufIds(song);
  const out: LegacyProject = {
    version: 4,
    name: song.name,
    bpm: song.bpm,
    masterVol: song.masterVol,
    reverbType: song.reverbType,
    playhead: 0,
    loop: { on: song.loop.on, a: song.loop.a, b: song.loop.b },
    playtape: { ...(extra?.playtape ?? {}), next: { id: song.id, color: song.color, created: song.created } },
    buffers: [...used].map((bufId) => ({ bufId, mediaFile: mediaNames.get(bufId) ?? bufId + '.wav' })),
    tracks: song.tracks.map((t) => {
      const { id, name, color, mute, solo, clips, ...params } = t;
      return { id, name, color: `--t${(color % TRACK_COLOR_COUNT) + 1}`, mute, solo, ...params, clips: clips.map((c) => JSON.parse(JSON.stringify(c)) as LegacyClip) };
    }),
  };
  if (song.drums) out.drums = { pattern: song.drums.pattern, vol: song.drums.vol, live: false };
  return out;
}

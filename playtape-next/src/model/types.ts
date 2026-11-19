/* The song model. Field names for tracks and clips match the TAPE/PLAYTAPE
   project.json (version 4) so songs keep opening in both apps. */

export type DriveType = 'clean' | 'crunch' | 'fuzz';
export type CabType = 'off' | '1x12' | '4x12';
export type DelaySync = '1/4' | '1/8.' | '1/8' | '1/16';
export type ReverbType = 'room' | 'hall' | 'plate' | 'spring';

/** One recorded pass. A clip plays exactly one of its takes. */
export interface TakeRef {
  bufId: string;
  offset: number;
  trimStart: number;
  trimEnd: number;
}

/** A played note, in seconds from the start of the clip's buffer. */
export interface Note {
  pitch: number;
  vel: number;
  start: number;
  dur: number;
  /** Stylo only: the pitch this note slides in from. */
  glide?: number | null;
}

export interface Clip {
  id: number;
  bufId: string;
  /** Position on the timeline, seconds. */
  offset: number;
  /** Window into the source buffer, seconds. */
  trimStart: number;
  trimEnd: number;
  /** All takes of this clip in recording order (present once there are two or
      more). The active one is mirrored in bufId/offset/trimStart/trimEnd, which
      is all TAPE and the old PLAYTAPE read. */
  takes?: TakeRef[];
  /** Index of the active take in `takes`. */
  take?: number;
  /** Clips played on Keys keep their notes so the sound can be changed later. */
  midi?: { preset: string; notes: Note[] };
}

export const DRUM_VOICES = ['kick', 'snare', 'hatC', 'hatO', 'clap'] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];
export type DrumPattern = Record<DrumVoice, boolean[]>;

export function emptyPattern(): DrumPattern {
  return { kick: Array(16).fill(false), snare: Array(16).fill(false), hatC: Array(16).fill(false), hatO: Array(16).fill(false), clap: Array(16).fill(false) };
}

export interface TrackParams {
  eqLo: number;
  eqMid: number;
  eqHi: number;
  squeeze: number;
  verb: number;
  pan: number;
  vol: number;
  nudge: number;
  lowcut: number;
  driveOn: boolean;
  drive: number;
  driveLevel: number;
  driveType: DriveType;
  cab: CabType;
  delayOn: boolean;
  delaySync: DelaySync;
  delayFb: number;
  delayMix: number;
  tremOn: boolean;
  tremRate: number;
  tremDepth: number;
}

export interface Track extends TrackParams {
  id: number;
  name: string;
  /** Index into the 8-colour track palette. */
  color: number;
  mute: boolean;
  solo: boolean;
  clips: Clip[];
}

export interface Song {
  id: string;
  name: string;
  created: number;
  modified: number;
  bpm: number;
  masterVol: number;
  reverbType: ReverbType;
  loop: { on: boolean; a: number; b: number };
  /** Palette index used for the cassette. */
  color: number;
  tracks: Track[];
  /** Set once a mixdown has been exported: the cassette earns its sticker. */
  exported?: boolean;
  /** The one-bar, 16-step drum pattern (same shape as TAPE's). */
  drums?: { pattern: DrumPattern; vol: number };
  /** Data from TAPE or the old PLAYTAPE that this app does not use
      (stage, old key notes). Carried through so exports lose nothing. */
  legacyExtra?: { playtape?: Record<string, unknown> };
}

/** What the Library needs to draw a cassette without loading the song. */
export interface SongMeta {
  id: string;
  name: string;
  created: number;
  modified: number;
  duration: number;
  color: number;
  trackCount: number;
  /** About 48 peak values (0..1) across the whole song, for the label. */
  peaks: number[];
  exported?: boolean;
}

export const TRACK_COLOR_COUNT = 8;

export function trackDefaults(): TrackParams {
  return {
    eqLo: 0, eqMid: 0, eqHi: 0, squeeze: 0, verb: 0, pan: 0, vol: 1, nudge: 0, lowcut: 0,
    driveOn: false, drive: 0.4, driveLevel: 0.8, driveType: 'crunch', cab: 'off',
    delayOn: false, delaySync: '1/8', delayFb: 0.3, delayMix: 0.25,
    tremOn: false, tremRate: 5, tremDepth: 0.5,
  };
}

export const clipDur = (c: Clip) => c.trimEnd - c.trimStart;
export const clipEnd = (c: Clip) => c.offset + clipDur(c);

export function songDuration(song: Pick<Song, 'tracks'>): number {
  let end = 0;
  for (const t of song.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c) + t.nudge);
  return end;
}

/** Every buffer the song refers to, including takes that are not playing. */
export function usedBufIds(song: Pick<Song, 'tracks'>): Set<string> {
  const used = new Set<string>();
  for (const t of song.tracks) {
    for (const c of t.clips) {
      used.add(c.bufId);
      for (const k of c.takes ?? []) used.add(k.bufId);
    }
  }
  return used;
}

export function nextTrackId(song: Pick<Song, 'tracks'>): number {
  return song.tracks.reduce((m, t) => Math.max(m, t.id), 0) + 1;
}

export function nextClipId(song: Pick<Song, 'tracks'>): number {
  let m = 0;
  for (const t of song.tracks) for (const c of t.clips) m = Math.max(m, c.id);
  return m + 1;
}

/** First palette colour no track is using yet, else the least used one. */
export function pickTrackColor(song: Pick<Song, 'tracks'>): number {
  const used = new Array(TRACK_COLOR_COUNT).fill(0);
  for (const t of song.tracks) used[t.color % TRACK_COLOR_COUNT]++;
  let best = 0;
  for (let i = 1; i < TRACK_COLOR_COUNT; i++) if (used[i] < used[best]) best = i;
  return best;
}

export function makeTrack(song: Pick<Song, 'tracks'>, name?: string): Track {
  const id = nextTrackId(song);
  return { id, name: name ?? `Track ${id}`, color: pickTrackColor(song), mute: false, solo: false, clips: [], ...trackDefaults() };
}

export function audible(song: Pick<Song, 'tracks'>, t: Track): boolean {
  if (t.mute) return false;
  if (song.tracks.some((x) => x.solo) && !t.solo) return false;
  return true;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Idea · Wed 18 Nov 14:32": a name nobody has to think about. */
export function autoName(when = new Date()): string {
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  return `Idea · ${DAYS[when.getDay()]} ${when.getDate()} ${MONTHS[when.getMonth()]} ${hh}:${mm}`;
}

export function newSong(now = Date.now(), color = 0): Song {
  return {
    id: `s${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: autoName(new Date(now)),
    created: now,
    modified: now,
    bpm: 100,
    masterVol: 0.9,
    reverbType: 'room',
    loop: { on: false, a: 0, b: 0 },
    color,
    tracks: [],
  };
}

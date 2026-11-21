/* App state and actions. The UI reads `app`; everything that changes a song
   goes through `mutate` so it is undoable, heard immediately and saved
   without the user ever being asked. */

import { placeTake } from './audio/dsp';
import { hit, patternActive, renderPattern, stepDur } from './audio/drums';
import { engine } from './audio/engine';
import { initMidi } from './audio/midi';
import { recorder, type MicState } from './audio/recorder';
import { LiveSynth, PRESETS, renderNotes } from './audio/synth';
import { loopValid, transport } from './audio/transport';
import { toast } from './lib/toast.svelte';
import { duplicateClip, landTake, moveClip, snapTime, splitClip, switchTake } from './model/edit';
import { History } from './model/history';
import { fitClipsToBuffers } from './model/legacy';
import {
  TRACK_COLOR_COUNT, clipDur, clipEnd, emptyPattern, makeTrack, newSong, nextClipId, songDuration, usedBufIds,
  type Clip, type DrumPattern, type DrumVoice, type Note, type Song, type SongMeta, type Track,
} from './model/types';
import * as db from './storage/db';
import { parseTape } from './storage/tapefile';
import type { AudioData } from './storage/wav';

export type Theme = 'auto' | 'paper' | 'night';
export type Source = 'mic' | 'keys' | 'drums';

function ls(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode: settings just do not stick */ }
}

export const app = $state({
  route: 'library' as 'library' | 'song',
  busy: false,
  library: [] as SongMeta[],
  libraryReady: false,
  song: null as Song | null,
  view: 'capture' as 'capture' | 'mix',
  playing: false,
  recording: false,
  mic: 'off' as MicState,
  click: false,
  /** What the Record key records. */
  source: 'mic' as Source,
  keysPreset: ls('playtape_keys_preset', 'felt'),
  /** Lowest note of the on-screen keyboard (MIDI number). */
  keysBase: 48,
  /** Pitches sounding right now, to light the keys. */
  held: [] as number[],
  midiDevices: [] as string[],
  /** While recording into a loop region: only this range is kept. */
  punch: null as { a: number; b: number } | null,
  /** "Catch that!": keep the last minute of mic input in memory. */
  catchOn: ls('playtape_catch', '0') === '1',
  /** Live monitor: the input is heard through the app while you play. */
  monitor: recorder.monitor,
  monitorVol: recorder.monitorVol,
  /** About how late you hear yourself on the monitor, in ms. */
  monitorMs: 0,
  selected: null as { trackId: number; clipId: number } | null,
  /** Track the next take goes to; null means a new track. */
  target: null as number | null,
  /** Timeline zoom, pixels per second. */
  pps: 60,
  canUndo: false,
  canRedo: false,
  saveState: 'saved' as 'saved' | 'saving' | 'error',
  theme: ls('playtape_theme', 'auto') as Theme,
  calm: ls('playtape_calm', '0') === '1',
  ceiling: parseFloat(ls('playtape_ceiling', '1')) || 1,
  /** Bumped when a buffer's peaks become available, so waveforms redraw. */
  peaksVersion: 0,
  /** The open modal sheet, if any. */
  sheet: null as null | 'share' | 'settings' | 'tuner',
  /** Track whose pedals are docked above the transport in the Mix view. */
  fxTrack: null as number | null,
  /** Progress of an export in flight. */
  exporting: null as null | { label: string; progress: number },
  /** Input devices and the timing offset, as shown in Settings. */
  inputs: [] as { id: string; label: string }[],
  inputId: recorder.deviceId,
  channel: recorder.channelMode,
  offsetMs: 0,
  offsetMeasured: false,
  calibrating: false,
  /** Songs the single-file TAPE / PLAYTAPE left on this device, offered for import. */
  old: { snapshot: null as number | null, recents: [] as { name: string; when: number }[] },
});

const history = new History<Song>();
let persisted = false;
let bufCounter = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let wakeLock: WakeLockSentinel | null = null;
let starting = false;
let recKind: 'mic' | 'keys' | null = null;
let punchTimer: ReturnType<typeof setInterval> | undefined;
/** True when a punch-in armed a track by itself; it is disarmed again afterwards. */
let autoTarget = false;

export const snapshot = (song: Song) => $state.snapshot(song) as Song;

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const t = Math.floor((s * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${t}`;
}

export function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/* ---------- settings ---------- */

export function applySettings(): void {
  const root = document.documentElement;
  if (app.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = app.theme;
  if (app.calm) root.dataset.calm = ''; else delete root.dataset.calm;
  engine.setCeiling(app.ceiling);
}

export function setTheme(t: Theme): void { app.theme = t; lsSet('playtape_theme', t); applySettings(); }
export function setCalm(v: boolean): void { app.calm = v; lsSet('playtape_calm', v ? '1' : '0'); applySettings(); }

/* ---------- library ---------- */

export async function refreshLibrary(): Promise<void> {
  try {
    app.library = (await db.listSongs()).filter((m) => !pendingDelete.has(m.id));
  } catch (e) {
    toast(`Could not read your library: ${(e as Error).message}`, { kind: 'error' });
  }
  app.libraryReady = true;
}

function summaryPeaks(song: Song, n = 48): number[] {
  const dur = songDuration(song);
  if (dur <= 0) return [];
  const out = new Array<number>(n).fill(0);
  for (const t of song.tracks) {
    for (const c of t.clips) {
      const pk = engine.peaks.get(c.bufId);
      const buf = engine.buffers.get(c.bufId);
      if (!pk || !buf) continue;
      for (let i = 0; i < n; i++) {
        const a = Math.max((i / n) * dur, c.offset);
        const b = Math.min(((i + 1) / n) * dur, clipEnd(c));
        if (b <= a) continue;
        const i0 = Math.floor(((c.trimStart + a - c.offset) / buf.duration) * pk.length);
        const i1 = Math.ceil(((c.trimStart + b - c.offset) / buf.duration) * pk.length);
        for (let k = Math.max(0, i0); k < Math.min(pk.length, i1); k++) if (pk[k] > out[i]) out[i] = pk[k];
      }
    }
  }
  return out.map((v) => Math.round(Math.min(1, v) * 100) / 100);
}

function metaOf(song: Song): SongMeta {
  return {
    id: song.id, name: song.name, created: song.created, modified: song.modified,
    duration: songDuration(song), color: song.color, trackCount: song.tracks.length, peaks: summaryPeaks(song),
    exported: !!song.exported,
  };
}

const pendingDelete = new Map<string, ReturnType<typeof setTimeout>>();

/** Remove a song from the Library. No confirm box: it can be undone for a few seconds. */
export function deleteSong(meta: SongMeta): void {
  app.library = app.library.filter((m) => m.id !== meta.id);
  const timer = setTimeout(() => {
    pendingDelete.delete(meta.id);
    db.deleteSong(meta.id).catch((e) => toast(`Could not delete: ${(e as Error).message}`, { kind: 'error' }));
  }, 6500);
  pendingDelete.set(meta.id, timer);
  toast(`Deleted “${meta.name}”`, {
    action: {
      label: 'Undo',
      run: () => { clearTimeout(pendingDelete.get(meta.id)); pendingDelete.delete(meta.id); void refreshLibrary(); },
    },
  });
}

export async function renameSongInLibrary(meta: SongMeta, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean || clean === meta.name) return;
  const song = await db.loadSong(meta.id);
  if (!song) return;
  song.name = clean;
  song.modified = Date.now();
  // `meta` comes from reactive state; IndexedDB can only store the plain copy.
  await db.saveSong(song, { ...($state.snapshot(meta) as SongMeta), name: clean, modified: song.modified });
  await refreshLibrary();
}

/* ---------- opening and closing a song ---------- */

function enterSong(song: Song, isPersisted: boolean): void {
  history.clear();
  persisted = isPersisted;
  app.song = song;
  transport.song = app.song;
  transport.head = 0;
  transport.metronome = app.click;
  app.selected = null;
  app.target = null;
  app.punch = null;
  app.source = 'mic';
  app.view = 'capture';
  app.sheet = null;
  app.fxTrack = null;
  app.canUndo = app.canRedo = false;
  app.saveState = 'saved';
  app.playing = app.recording = false;
  app.pps = window.innerWidth < 700 ? 40 : 60;
  engine.sync(app.song!);
  app.route = 'song';
}

async function warmMicIfAllowed(): Promise<void> {
  try {
    const st = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (st.state !== 'granted') return;
    recorder.ringOn = app.catchOn;
    await recorder.warm();
  } catch { /* no Permissions API or no mic: we ask on the first Record instead */ }
  app.mic = recorder.state;
}

export async function openSong(id: string): Promise<void> {
  if (app.busy) return;
  app.busy = true;
  try {
    await engine.ensure();
    const song = await db.loadSong(id);
    if (!song) { toast('That song could not be found.', { kind: 'error' }); await refreshLibrary(); return; }
    engine.disposeChains();
    engine.clearBuffers();
    const durations = new Map<string, number>();
    const ids = [...usedBufIds(song)];
    const loaded = await Promise.all(ids.map((bufId) => db.getAudio(song.id, bufId)));
    ids.forEach((bufId, i) => { const audio = loaded[i]; if (audio) durations.set(bufId, engine.addBuffer(bufId, audio).duration); });
    const before = song.tracks.reduce((n, t) => n + t.clips.length, 0);
    fitClipsToBuffers(song, durations);
    const after = song.tracks.reduce((n, t) => n + t.clips.length, 0);
    bufCounter = 0;
    for (const b of await db.listAudioIds(song.id)) bufCounter = Math.max(bufCounter, parseInt(b.replace(/\D/g, ''), 10) || 0);
    enterSong(song, true);
    app.peaksVersion++;
    if (after < before) toast(`${before - after} clip(s) had no audio and were left out.`, { kind: 'error' });
    void warmMicIfAllowed();
  } catch (e) {
    toast(`Could not open the song: ${(e as Error).message}`, { kind: 'error' });
  } finally {
    app.busy = false;
  }
}

export function nextSongColor(): number {
  const used = new Array(TRACK_COLOR_COUNT).fill(0);
  for (const m of app.library) used[m.color % TRACK_COLOR_COUNT]++;
  let best = 0;
  for (let i = 1; i < TRACK_COLOR_COUNT; i++) if (used[i] < used[best]) best = i;
  return best;
}

/** The one-tap path: new song, straight into recording. */
export async function recordNewIdea(): Promise<void> {
  if (app.busy) return;
  app.busy = true;
  try {
    await engine.ensure();
    engine.disposeChains();
    engine.clearBuffers();
    bufCounter = 0;
    enterSong(newSong(Date.now(), nextSongColor()), false);
  } finally {
    app.busy = false;
  }
  await startRecording();
}

/** Open a blank song without recording (to start with Keys, Drums or an import). */
export async function newEmptySong(): Promise<void> {
  if (app.busy) return;
  app.busy = true;
  try {
    await engine.ensure();
    engine.disposeChains();
    engine.clearBuffers();
    bufCounter = 0;
    enterSong(newSong(Date.now(), nextSongColor()), false);
    void warmMicIfAllowed();
  } finally {
    app.busy = false;
  }
}

export async function closeSong(): Promise<void> {
  if (app.recording) await stopRecording();
  transport.stop();
  synth.allOff();
  await saveNow();
  recorder.cool();
  app.mic = 'off';
  const song = app.song;
  if (song && persisted) {
    // Takes that only existed in undo history are no longer reachable: reclaim the space.
    try {
      const used = usedBufIds(song);
      await db.deleteAudio(song.id, (await db.listAudioIds(song.id)).filter((b) => !used.has(b)));
    } catch { /* not worth interrupting anyone for */ }
  }
  app.route = 'library';
  app.song = null;
  transport.song = null;
  engine.disposeChains();
  engine.clearBuffers();
  history.clear();
  await refreshLibrary();
}

/* ---------- saving ---------- */

export function scheduleSave(): void {
  app.saveState = 'saving';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), 400);
}

export async function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  const song = app.song;
  if (!song) return;
  // A brand-new song with nothing in it is not worth a cassette.
  if (!persisted && song.tracks.length === 0 && !patternActive(song.drums?.pattern)) { app.saveState = 'saved'; return; }
  const plain = snapshot(song);
  try {
    await db.saveSong(plain, metaOf(plain));
    if (!persisted) { persisted = true; void db.requestPersistence(); }
    if (app.song?.id === plain.id) app.saveState = 'saved';
  } catch (e) {
    app.saveState = 'error';
    toast(`Could not save: ${(e as Error).message}`, { kind: 'error' });
  }
}

/* ---------- editing ---------- */

/** `replan` re-schedules what is sounding; only needed when clips, tempo or the loop changed. */
function afterChange(replan = true): void {
  const song = app.song!;
  song.modified = Date.now();
  engine.sync(song);
  if (replan) transport.refresh();
  app.canUndo = history.canUndo;
  app.canRedo = history.canRedo;
  scheduleSave();
}

/** Make an undoable change to the open song. */
export function mutate(label: string, fn: (song: Song) => void, opts: { replan?: boolean } = {}): void {
  const song = app.song;
  if (!song) return;
  history.push(label, snapshot(song));
  fn(song);
  afterChange(opts.replan ?? true);
}

/** For drags: call `beginEdit` once, `liveEdit` while moving, `endEdit` on release. */
export function beginEdit(label: string): void {
  if (app.song) history.push(label, snapshot(app.song));
}
export function liveEdit(): void {
  if (app.song) engine.sync(app.song);
}
export function endEdit(replan = true): void {
  if (app.song) afterChange(replan);
}

function restore(state: Song): void {
  const song = app.song!;
  // Fields that may be absent in the restored state must not linger.
  delete song.drums;
  Object.assign(song, state);
  app.selected = null;
  if (app.target != null && !song.tracks.some((t) => t.id === app.target)) app.target = null;
  if (app.fxTrack != null && !song.tracks.some((t) => t.id === app.fxTrack)) app.fxTrack = null;
  afterChange();
}

export function undo(): void {
  const song = app.song;
  if (!song || app.recording) return;
  const r = history.undo(snapshot(song));
  if (!r) { toast('Nothing to undo'); return; }
  restore(r.state);
  toast(`Undid: ${r.label}`, { action: { label: 'Redo', run: redo }, timeout: 3200 });
}

export function redo(): void {
  const song = app.song;
  if (!song || app.recording) return;
  const r = history.redo(snapshot(song));
  if (!r) { toast('Nothing to redo'); return; }
  restore(r.state);
}

export function renameSong(name: string): void {
  const clean = name.trim();
  if (!clean || !app.song || clean === app.song.name) return;
  mutate('Rename song', (s) => { s.name = clean; }, { replan: false });
}

export function renameTrack(t: Track, name: string): void {
  const clean = name.trim();
  if (!clean || clean === t.name) return;
  mutate('Rename track', () => { t.name = clean; }, { replan: false });
}

/** Add an empty track and aim Record at it. */
export function addTrack(): void {
  const song = app.song;
  if (!song || app.recording) return;
  const res = { id: 0 };
  mutate('Add track', (s) => {
    const t = makeTrack(s);
    s.tracks.push(t);
    res.id = t.id;
  }, { replan: false });
  app.target = res.id;
  app.selected = null;
}

export function deleteTrack(id: number): void {
  const t = app.song?.tracks.find((x) => x.id === id);
  if (!t) return;
  mutate(`Delete ${t.name}`, (s) => { s.tracks = s.tracks.filter((x) => x.id !== id); });
  if (app.target === id) app.target = null;
  if (app.fxTrack === id) app.fxTrack = null;
  if (app.selected?.trackId === id) app.selected = null;
  toast(`Deleted “${t.name}”`, { action: { label: 'Undo', run: undo } });
}

export function setBpm(bpm: number): void {
  const v = Math.round(Math.min(240, Math.max(40, bpm)));
  if (!app.song || v === app.song.bpm) return;
  mutate('Change tempo', (s) => { s.bpm = v; });
}

export function setClick(on: boolean): void {
  app.click = on;
  transport.metronome = on;
}

export function setZoom(pps: number): void {
  app.pps = Math.min(300, Math.max(12, pps));
}

/* ---------- clips ---------- */

export function selectedClip(): { track: Track; clip: Clip } | null {
  const sel = app.selected;
  if (!sel || !app.song) return null;
  const track = app.song.tracks.find((t) => t.id === sel.trackId);
  const clip = track?.clips.find((c) => c.id === sel.clipId);
  return track && clip ? { track, clip } : null;
}

export function deleteSelectedClip(): void {
  const sel = selectedClip();
  if (!sel || app.recording) return;
  mutate('Delete clip', () => { sel.track.clips = sel.track.clips.filter((c) => c.id !== sel.clip.id); });
  app.selected = null;
  toast('Clip deleted', { action: { label: 'Undo', run: undo } });
}

export function splitSelected(): void {
  const sel = selectedClip();
  if (!sel || app.recording) return;
  const at = transport.position();
  if (at <= sel.clip.offset + 0.02 || at >= clipEnd(sel.clip) - 0.02) {
    toast('Put the playhead inside the clip, then split.');
    return;
  }
  mutate('Split clip', (s) => {
    const right = splitClip(sel.clip, at, nextClipId(s));
    if (right) { sel.track.clips.push(right); app.selected = { trackId: sel.track.id, clipId: right.id }; }
  });
}

export function duplicateSelected(): void {
  const sel = selectedClip();
  if (!sel || app.recording) return;
  mutate('Duplicate clip', (s) => {
    const copy = duplicateClip(snapshotClip(sel.clip), nextClipId(s));
    sel.track.clips.push(copy);
    app.selected = { trackId: sel.track.id, clipId: copy.id };
  });
}

const snapshotClip = (c: Clip) => $state.snapshot(c) as Clip;

export function stepTake(dir: 1 | -1): void {
  const sel = selectedClip();
  if (!sel?.clip.takes || app.recording) return;
  mutate('Switch take', () => switchTake(sel.clip, (sel.clip.take ?? sel.clip.takes!.length - 1) + dir));
}

/** Move a clip to another track (by index in the track list). Call inside an edit. */
export function moveClipToTrack(clipId: number, fromTrackId: number, toIndex: number): void {
  const song = app.song;
  if (!song) return;
  const from = song.tracks.find((t) => t.id === fromTrackId);
  const to = song.tracks[toIndex];
  if (!from || !to || from === to) return;
  const i = from.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return;
  const [clip] = from.clips.splice(i, 1);
  to.clips.push(snapshotClip(clip));
  if (app.selected?.clipId === clipId) app.selected = { trackId: to.id, clipId };
}

/** Snapping for a drag: magnetic to the playhead, the loop and other clips'
    edges; to the sixteenth-note grid as well when the click is on. */
export function snapper(ignoreClipId: number | null): (t: number, free: boolean) => number {
  const song = app.song!;
  const magnets = [0, transport.position()];
  if (loopValid(song)) magnets.push(song.loop.a, song.loop.b);
  for (const t of song.tracks) for (const c of t.clips) if (c.id !== ignoreClipId) magnets.push(c.offset, clipEnd(c));
  const grid = app.click ? 60 / song.bpm / 4 : null;
  return (t, free) => (free ? t : snapTime(t, magnets, 8 / app.pps, grid));
}

export { moveClip };

/* ---------- loop ---------- */

export function toggleLoop(): void {
  const song = app.song;
  if (!song || app.recording) return;
  if (loopValid(song)) {
    mutate(song.loop.on ? 'Loop off' : 'Loop on', (s) => { s.loop.on = !s.loop.on; });
    return;
  }
  // No region yet: the selected clip, otherwise two bars from the playhead.
  const sel = selectedClip();
  const bar = (60 / song.bpm) * 4;
  const a = sel ? sel.clip.offset : transport.position();
  const b = sel ? clipEnd(sel.clip) : a + bar * 2;
  mutate('Set loop', (s) => { s.loop = { on: true, a, b }; });
  toast('Loop on. Drag its ends on the ruler. Record now redoes just this part.');
}

export function loopSelected(): void {
  const sel = selectedClip();
  if (!sel || app.recording) return;
  mutate('Loop clip', (s) => { s.loop = { on: true, a: sel.clip.offset, b: clipEnd(sel.clip) }; });
}

/* ---------- instruments ---------- */

export const synth = new LiveSynth(() => engine.ctx, () => engine.synthBus);
synth.preset = PRESETS[app.keysPreset] ? app.keysPreset : 'felt';
synth.onHeld = (p) => { app.held = p; };

let capture: { open: Map<number, { start: number; vel: number; glide?: number | null }>; notes: Note[] } | null = null;

/** Time of an instrument event in seconds since the downbeat, as the player heard it. */
function heardSinceDownbeat(ctxTime: number): number {
  const lat = (engine.ctx?.outputLatency ?? 0) + (engine.ctx?.baseLatency ?? 0);
  return ctxTime - lat - transport.playStartCtx;
}

synth.onNote = (e) => {
  if (!capture) return;
  const t = heardSinceDownbeat(e.time);
  if (e.type === 'on') capture.open.set(e.pitch, { start: Math.max(0, t), vel: e.vel, glide: e.glide });
  else {
    const o = capture.open.get(e.pitch);
    if (!o) return;
    capture.open.delete(e.pitch);
    if (t - o.start > 0.03) capture.notes.push({ pitch: e.pitch, vel: o.vel, start: o.start, dur: t - o.start, glide: o.glide ?? null });
  }
};

export async function keyDown(pitch: number, vel = 0.8): Promise<void> {
  if (!engine.ctx) await engine.ensure();
  void engine.resume();
  synth.noteOn(pitch, vel);
}
export function keyUp(pitch: number): void { synth.noteOff(pitch); }

export function setKeysPreset(name: string): void {
  if (!PRESETS[name]) return;
  synth.setPreset(name);
  app.keysPreset = name;
  lsSet('playtape_keys_preset', name);
}

export function shiftOctave(dir: 1 | -1): void {
  synth.allOff();
  app.keysBase = Math.min(84, Math.max(24, app.keysBase + dir * 12));
}

export function padHit(voice: DrumVoice): void {
  void engine.ensure().then(() => { void engine.resume(); hit(engine.ctx!, engine.drumBus, voice, engine.ctx!.currentTime); });
}

export function setSource(s: Source): void {
  if (app.recording || s === app.source) return;
  synth.allOff();
  app.source = s;
  if (s === 'keys') {
    void engine.ensure();
    void initMidi({
      noteOn: (p, v) => { if (app.route === 'song') { if (app.source !== 'keys') setSource('keys'); void keyDown(p, v); } },
      noteOff: (p) => keyUp(p),
      drum: (i) => padHit((['kick', 'snare', 'hatC', 'hatO', 'clap'] as const)[i]),
      devices: (names) => {
        if (names.length > app.midiDevices.length) toast(`MIDI connected: ${names[names.length - 1]}`, { kind: 'ok' });
        app.midiDevices = names;
      },
    });
  }
}

transport.liveDrums = () => (app.source === 'drums' && app.song?.drums && patternActive(app.song.drums.pattern) ? app.song.drums.pattern : null);

export function toggleStep(voice: DrumVoice, step: number): void {
  if (!app.song) return;
  const res = { on: false };
  mutate('Drum step', (s) => {
    s.drums ??= { pattern: emptyPattern(), vol: 0.9 };
    res.on = s.drums.pattern[voice][step] = !s.drums.pattern[voice][step];
  }, { replan: false });
  if (res.on && !transport.playing) padHit(voice);
}

export function setPattern(label: string, pattern: DrumPattern): void {
  mutate(label, (s) => { s.drums = { pattern, vol: s.drums?.vol ?? 0.9 }; }, { replan: false });
}

/** Turn the pattern into an audio clip as long as the song (at least four bars). */
export async function addDrumsToSong(): Promise<void> {
  const song = app.song;
  if (!song || app.busy) return;
  if (!patternActive(song.drums?.pattern)) { toast('Tap some steps first, or try Basic beat.'); return; }
  app.busy = true;
  try {
    await engine.ensure();
    const barLen = stepDur(song.bpm) * 16;
    const bars = Math.min(400, Math.max(4, Math.ceil(songDuration(song) / barLen - 0.01)));
    const audio = await renderPattern(snapshot(song).drums!.pattern, song.bpm, bars, song.drums!.vol, engine.ctx!.sampleRate);
    const bufId = `b${++bufCounter}`;
    engine.addBuffer(bufId, audio);
    app.peaksVersion++;
    await db.putAudio(song.id, bufId, audio);
    mutate('Add drums', (s) => {
      const t = makeTrack(s, `Drums${s.tracks.some((x) => x.name === 'Drums') ? ' 2' : ''}`);
      t.clips.push({ id: nextClipId(s), bufId, offset: 0, trimStart: 0, trimEnd: bars * barLen });
      s.tracks.push(t);
    });
    app.source = 'mic'; // the printed track plays now; the live pattern would double it
    await saveNow();
    toast(`Drums added for ${bars} bars`, { kind: 'ok', action: { label: 'Undo', run: undo } });
  } catch (e) {
    toast(`Could not add the drums: ${(e as Error).message}`, { kind: 'error' });
  } finally {
    app.busy = false;
  }
}

/** Re-render a played clip with another sound. */
export async function revoiceSelected(preset: string): Promise<void> {
  const sel = selectedClip();
  const song = app.song;
  if (!sel?.clip.midi || !song || app.recording || !PRESETS[preset]) return;
  const midi = snapshotClip(sel.clip).midi!;
  const old = engine.buffers.get(sel.clip.bufId);
  const audio = await renderNotes(midi.notes, preset, engine.ctx!.sampleRate);
  const bufId = `b${++bufCounter}`;
  const buf = engine.addBuffer(bufId, audio);
  app.peaksVersion++;
  await db.putAudio(song.id, bufId, audio);
  mutate(`Sound: ${PRESETS[preset].label}`, () => {
    const c = sel.clip;
    const atEnd = !old || c.trimEnd >= old.duration - 0.02;
    c.bufId = bufId;
    c.trimEnd = atEnd ? buf.duration : Math.min(c.trimEnd, buf.duration);
    c.midi = { preset, notes: midi.notes };
    if (c.takes && c.take != null) c.takes[c.take] = { bufId, offset: c.offset, trimStart: c.trimStart, trimEnd: c.trimEnd };
  });
}

/* ---------- transport ---------- */

transport.onStop = () => { app.playing = false; };

export async function togglePlay(): Promise<void> {
  const song = app.song;
  if (!song) return;
  if (app.recording) { await stopRecording(); return; }
  if (transport.playing) { transport.stop(); return; }
  await engine.ensure();
  await engine.resume();
  const hasClips = song.tracks.some((t) => t.clips.length);
  const drumsOnly = !hasClips && app.source === 'drums' && patternActive(song.drums?.pattern);
  if (!hasClips && !drumsOnly) { toast('Nothing to play yet. Press Record.'); return; }
  engine.sync(song);
  transport.play({ openEnded: drumsOnly });
  app.playing = true;
}

export function rewind(): void {
  if (app.recording) return;
  transport.seek(0);
}

export function seek(pos: number): void {
  if (app.recording) return;
  transport.seek(pos);
}

export function micError(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The microphone is blocked. Allow it from the address bar (the lock or mic icon), then press Record again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found. Plug one in or check the system sound settings.';
  if (name === 'NotReadableError') return 'Another app is using the microphone. Close it and press Record again.';
  return `Could not start the microphone: ${(e as Error)?.message ?? e}`;
}

/** With a loop on, Record redoes just the loop: roll in up to a bar early, keep only the region. */
function armPunch(song: Song): { a: number; b: number } | null {
  if (!(song.loop.on && loopValid(song))) return null;
  const pre = Math.min(song.loop.a, (60 / song.bpm) * 4);
  transport.head = Math.max(0, song.loop.a - pre);
  // Redoing a selected clip's part should land on that clip's track.
  if (app.target == null && app.selected) { app.target = app.selected.trackId; autoTarget = true; }
  return { a: song.loop.a, b: song.loop.b };
}

function beginRecordingRun(song: Song, kind: 'mic' | 'keys'): void {
  const punch = armPunch(song);
  app.punch = punch;
  const rollIn = punch ? punch.a - transport.head : 0;
  transport.play({ countIn: app.click && rollIn < 60 / song.bpm, holdOpen: true });
  recKind = kind;
  app.recording = true;
  app.playing = true;
  app.selected = null;
  clearInterval(punchTimer);
  if (punch) {
    punchTimer = setInterval(() => {
      if (app.recording && app.punch && transport.position() >= app.punch.b + 0.05) void stopRecording();
    }, 30);
  }
}

export async function startRecording(): Promise<void> {
  const song = app.song;
  if (!song || app.recording || starting) return;
  if (app.source === 'drums') { await addDrumsToSong(); return; }
  starting = true;
  try {
    await engine.ensure();
    if (app.source === 'keys') {
      await engine.resume();
      if (transport.playing) transport.stop();
      engine.sync(song);
      capture = { open: new Map(), notes: [] };
      beginRecordingRun(song, 'keys');
      return;
    }
    if (!recorder.supported) {
      toast('Recording needs a secure page (https or localhost) in a current browser.', { kind: 'error' });
      return;
    }
    app.mic = 'starting';
    try {
      recorder.ringOn = app.catchOn;
      await recorder.warm();
    } catch (e) {
      app.mic = recorder.state;
      toast(micError(e), { kind: 'error' });
      return;
    }
    await engine.resume();
    if (transport.playing) transport.stop();
    engine.sync(song);
    recorder.start();
    beginRecordingRun(song, 'mic');
    app.mic = recorder.state;
    try { wakeLock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* not supported or not allowed */ }
  } finally {
    starting = false;
  }
}

/** Put a new clip on the target track (covering what is there) or on a new track. */
function landClip(s: Song, clip: Clip, newTrackName: string, targetId: number | null): string | null {
  const existing = s.tracks.find((t) => t.id === targetId);
  if (!existing) {
    const t = makeTrack(s, newTrackName);
    t.clips.push(clip);
    s.tracks.push(t);
    return null;
  }
  let id = clip.id;
  landTake(existing, clip, () => ++id);
  return clip.takes ? `Take ${clip.takes.length}. The earlier ${clip.takes.length === 2 ? 'one is' : 'ones are'} still inside the clip.` : null;
}

const countNamed = (s: Song, prefix: string) => s.tracks.filter((x) => x.name.startsWith(prefix)).length + 1;

export async function stopRecording(): Promise<void> {
  const song = app.song;
  if (!song || !app.recording) return;
  const startHead = transport.playStartHead;
  const startCtx = transport.playStartCtx;
  const punch = app.punch;
  const kind = recKind;
  app.recording = false;
  recKind = null;
  clearInterval(punchTimer);
  const stopTime = engine.now;
  const pending = kind === 'mic' ? recorder.stop() : Promise.resolve(null);
  transport.stop();
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  app.punch = null;
  const landOn = app.target;
  if (autoTarget) { autoTarget = false; app.target = null; }
  transport.head = startHead; // back to where the take began: Play is now "listen back"

  if (kind === 'keys') {
    const cap = capture;
    capture = null;
    if (!cap) return;
    const end = heardSinceDownbeat(stopTime);
    for (const [pitch, o] of cap.open) if (end - o.start > 0.03) cap.notes.push({ pitch, vel: o.vel, start: o.start, dur: end - o.start, glide: o.glide ?? null });
    let notes = cap.notes.sort((x, y) => x.start - y.start);
    if (punch) notes = notes.filter((n) => startHead + n.start >= punch.a - 0.05 && startHead + n.start < punch.b);
    if (!notes.length) { toast('No notes were played.'); return; }
    const preset = synth.preset;
    const audio = await renderNotes(notes, preset, engine.ctx!.sampleRate);
    const bufId = `b${++bufCounter}`;
    const buf = engine.addBuffer(bufId, audio);
    app.peaksVersion++;
    let ts = Math.max(0, notes[0].start - 0.01);
    let te = buf.duration;
    if (punch) { ts = Math.max(ts, punch.a - startHead); te = Math.min(te, punch.b - startHead); }
    let stored = true;
    try { await db.putAudio(song.id, bufId, audio); } catch (e) { stored = false; toast(`The take is here but could not be stored: ${(e as Error).message}`, { kind: 'error' }); }
    const res = { note: null as string | null };
    mutate('Record keys', (s) => {
      res.note = landClip(s, { id: nextClipId(s), bufId, offset: startHead + ts, trimStart: ts, trimEnd: te, midi: { preset, notes } }, `${PRESETS[preset].label} ${countNamed(s, PRESETS[preset].label)}`, landOn);
    });
    if (stored) await saveNow();
    if (res.note) toast(res.note);
    return;
  }

  const take = await pending;
  app.mic = recorder.state;
  if (!take) { toast('Nothing was captured. Check the microphone.', { kind: 'error' }); return; }
  const place = placeTake({
    startFrame: take.startFrame, sampleRate: take.audio.sampleRate,
    playStartCtx: startCtx, playStartHead: startHead, offsetSec: recorder.offsetSec(), duration: take.duration, punch,
  });
  if (place.trimEnd - place.trimStart < 0.2) { toast('That was too short to keep.'); return; }
  const bufId = `b${++bufCounter}`;
  engine.addBuffer(bufId, take.audio);
  app.peaksVersion++;
  let stored = true;
  try { await db.putAudio(song.id, bufId, take.audio); } catch (e) {
    stored = false;
    toast(`The take is here but could not be stored: ${(e as Error).message}`, { kind: 'error' });
  }
  const res = { note: null as string | null };
  mutate('Record take', (s) => {
    res.note = landClip(s, { id: nextClipId(s), bufId, offset: place.offset, trimStart: place.trimStart, trimEnd: place.trimEnd }, `Mic ${countNamed(s, 'Mic')}`, landOn);
  });
  if (stored) await saveNow();
  if (res.note) toast(res.note);
  if (recorder.clipped) toast('That take hit the limit. Back off the mic a little, or turn the input down.');
}

export function toggleRecord(): void {
  void (app.recording ? stopRecording() : startRecording());
}

/* ---------- live monitor ---------- */

/** Hear the input through the app while playing (a plugged-in guitar, a keyboard, a mic on headphones). */
export async function setMonitor(on: boolean): Promise<void> {
  app.monitor = on;
  try {
    await recorder.setMonitor(on);
    if (on && app.route === 'song' && recorder.state === 'off') {
      await engine.ensure();
      recorder.ringOn = app.catchOn;
      await recorder.warm();
    }
  } catch (e) {
    toast(micError(e), { kind: 'error' });
  }
  app.mic = recorder.state;
  app.monitorMs = recorder.monitorDelayMs();
  if (on && ls('playtape_monitor_tip', '0') !== '1') {
    lsSet('playtape_monitor_tip', '1');
    toast('Monitor on: you hear your input as you play. Use headphones, or a microphone will feed back.', { timeout: 7000 });
  }
}

export function setMonitorVol(v: number): void {
  recorder.setMonitorVol(v);
  app.monitorVol = recorder.monitorVol;
}

/* ---------- Catch that! ---------- */

export async function setCatch(on: boolean): Promise<void> {
  app.catchOn = on;
  lsSet('playtape_catch', on ? '1' : '0');
  recorder.setRing(on);
  if (on && app.route === 'song' && recorder.state === 'off') {
    try {
      await engine.ensure();
      recorder.ringOn = true;
      await recorder.warm();
      app.mic = recorder.state;
    } catch (e) {
      toast(micError(e), { kind: 'error' });
    }
  }
  if (on) toast('Catch that! is on: the last minute of mic input stays in memory, nowhere else.');
}

/** Keep what was just played, even though Record was not on. */
export async function catchThat(seconds = 30): Promise<void> {
  const song = app.song;
  if (!song || app.recording) return;
  if (!app.catchOn || recorder.state === 'off') { toast('Catch that! needs the microphone on. Turn it on in Settings.'); return; }
  const got = await recorder.grab(seconds);
  const dur = got ? got.audio.channels[0].length / got.audio.sampleRate : 0;
  if (!got || dur < 0.5) { toast('Nothing to catch yet.'); return; }
  const bufId = `b${++bufCounter}`;
  engine.addBuffer(bufId, got.audio);
  app.peaksVersion++;
  let stored = true;
  try { await db.putAudio(song.id, bufId, got.audio); } catch { stored = false; }
  // While playing, what you played along to ends "now"; when stopped it starts at the playhead.
  let offset = transport.playing ? transport.position() - dur : transport.position();
  let trimStart = 0;
  if (offset < 0) { trimStart = -offset; offset = 0; }
  mutate('Catch that!', (s) => {
    const t = makeTrack(s, `Caught ${countNamed(s, 'Caught')}`);
    t.clips.push({ id: nextClipId(s), bufId, offset, trimStart, trimEnd: dur });
    s.tracks.push(t);
  });
  if (stored) await saveNow();
  toast(`Kept the last ${Math.round(dur - trimStart)} seconds`, { kind: 'ok', action: { label: 'Undo', run: undo } });
}

/* ---------- import ---------- */

async function importAudioInto(song: Song, name: string, audio: AudioData): Promise<void> {
  const bufId = `b${++bufCounter}`;
  const buf = engine.addBuffer(bufId, audio);
  app.peaksVersion++;
  await db.putAudio(song.id, bufId, audio);
  mutate(`Import ${name}`, (s) => {
    const t = makeTrack(s, name.replace(/\.[^.]+$/, '').slice(0, 40));
    t.clips.push({ id: nextClipId(s), bufId, offset: 0, trimStart: 0, trimEnd: buf.duration });
    s.tracks.push(t);
  });
}

/** Store a song that came from outside (a .tape file, an old project folder) in the Library. */
export async function saveImportedSong(song: Song, audio: Map<string, AudioData>): Promise<void> {
  for (const [bufId, a] of audio) await db.putAudio(song.id, bufId, a);
  // Peaks for the cassette come from the audio, so register it briefly.
  const keep = { buffers: new Map(engine.buffers), peaks: new Map(engine.peaks) };
  for (const [bufId, a] of audio) engine.addBuffer(bufId, a);
  const meta = metaOf(song);
  engine.buffers.clear(); engine.peaks.clear();
  keep.buffers.forEach((v, k) => engine.buffers.set(k, v));
  keep.peaks.forEach((v, k) => engine.peaks.set(k, v));
  await db.saveSong(song, meta);
}

/** `.tape` files become new songs in the Library; audio files become tracks
    (in the open song, or in a new song when dropped on the Library). */
export async function importFiles(files: FileList | File[]): Promise<void> {
  await engine.ensure();
  let lastImported: string | null = null;
  for (const f of Array.from(files)) {
    try {
      if (/\.tape$/i.test(f.name)) {
        const now = Date.now();
        const id = `s${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        const parsed = await parseTape(await f.text(), {
          id, now, fallbackName: f.name.replace(/\.tape$/i, ''), color: nextSongColor(),
          decodeOther: (bytes) => engine.decodeFile(bytes).catch(() => null),
        });
        await saveImportedSong(parsed.song, parsed.audio);
        lastImported = id;
        if (parsed.failed.length) toast(`“${parsed.song.name}”: ${parsed.failed.length} take(s) could not be read.`, { kind: 'error' });
      } else {
        const audio = await engine.decodeFile(await f.arrayBuffer());
        if (app.route === 'song' && app.song) {
          await importAudioInto(app.song, f.name, audio);
          await saveNow();
        } else {
          engine.disposeChains();
          engine.clearBuffers();
          bufCounter = 0;
          const song = newSong(Date.now(), nextSongColor());
          song.name = f.name.replace(/\.[^.]+$/, '').slice(0, 60);
          enterSong(song, false);
          await importAudioInto(app.song!, f.name, audio);
          await saveNow();
          void warmMicIfAllowed();
        }
      }
    } catch (e) {
      toast(`Could not read ${f.name}: ${(e as Error).message}`, { kind: 'error' });
    }
  }
  if (app.route === 'library') {
    await refreshLibrary();
    if (lastImported) {
      const id = lastImported;
      toast('Imported into your Library', { kind: 'ok', action: { label: 'Open', run: () => void openSong(id) } });
    }
  }
}

export { clipDur, loopValid };

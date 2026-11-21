/* Output and setup: exporting (MP3, WAV, stems, project file), the settings
   that live in the Settings sheet, and latency calibration. */

import { engine } from './audio/engine';
import { measureLatency } from './audio/latency';
import { encodeMp3 } from './audio/mp3';
import { recorder } from './audio/recorder';
import { renderMix } from './audio/render';
import { transport } from './audio/transport';
import { toast } from './lib/toast.svelte';
import { audible, usedBufIds, type ReverbType } from './model/types';
import { fitClipsToBuffers, songFromLegacy } from './model/legacy';
import { app, micError, mutate, nextSongColor, openSong, refreshLibrary, saveImportedSong, scheduleSave, snapshot } from './state.svelte';
import { allowRead, canPickFolders, listOldRecents, pickFolder, readOldSnapshot, readProjectFolder, type OldProject, type OldRecent } from './storage/oldData';
import { buildTapeParts } from './storage/tapefile';
import { decodeWav, encodeWav16, type AudioData } from './storage/wav';
import { safeName, zipStore } from './storage/zip';

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

/* ---------- sheets ---------- */

export function openSheet(s: 'share' | 'settings' | 'tuner'): void {
  app.sheet = s;
  if (s === 'settings') void refreshInputs();
}
export function closeSheet(): void { app.sheet = null; }

/* ---------- sound settings ---------- */

export function setCeiling(v: number): void {
  app.ceiling = Math.max(0.2, Math.min(1, v));
  lsSet('playtape_ceiling', String(app.ceiling));
  engine.setCeiling(app.ceiling);
}

export function setReverb(type: ReverbType): void {
  if (!app.song || app.song.reverbType === type) return;
  mutate('Reverb room', (s) => { s.reverbType = type; }, { replan: false });
}

/* ---------- input ---------- */

function syncOffset(): void {
  const o = recorder.offsetInfo();
  app.offsetMs = o.ms;
  app.offsetMeasured = o.measured;
  app.monitorMs = recorder.monitorDelayMs();
}

export async function refreshInputs(): Promise<void> {
  app.inputs = await recorder.listInputs();
  app.inputId = recorder.deviceId;
  app.channel = recorder.channelMode;
  syncOffset();
}

/** Open the mic from Settings so the inputs get their names and the meter runs. */
export async function turnMicOn(): Promise<void> {
  try {
    await engine.ensure();
    recorder.ringOn = app.catchOn;
    await recorder.warm();
    await refreshInputs();
  } catch (e) {
    toast(micError(e), { kind: 'error' });
  }
  app.mic = recorder.state;
}

export async function setInput(id: string): Promise<void> {
  try {
    await recorder.setDevice(id);
  } catch (e) {
    toast(micError(e), { kind: 'error' });
  }
  app.mic = recorder.state;
  await refreshInputs();
}

export function setChannel(mode: number): void {
  recorder.setChannel(mode);
  app.channel = mode;
}

export function setOffset(ms: number): void {
  if (!Number.isFinite(ms)) return;
  recorder.setOffsetMs(ms);
  syncOffset();
}

/** Play eight clicks, listen for them at the input, and store the measured round trip for this input. */
export async function calibrate(): Promise<void> {
  if (app.calibrating || app.recording) return;
  if (transport.playing) transport.stop();
  app.calibrating = true;
  try {
    await engine.ensure();
    recorder.ringOn = app.catchOn;
    await recorder.warm();
    app.mic = recorder.state;
    await engine.resume();
    const ctx = engine.ctx!;
    recorder.holdMonitor(true); // or the clicks come round again through the monitor
    recorder.start();
    const begin = ctx.currentTime + 0.35;
    const emits = Array.from({ length: 8 }, (_, i) => begin + i * 0.5);
    emits.forEach((t) => engine.sharpClick(t));
    await new Promise((r) => setTimeout(r, (0.35 + 8 * 0.5 + 0.5) * 1000));
    const take = await recorder.stop();
    recorder.clipped = false;
    if (!take) { toast('No audio reached the input, so nothing could be measured.', { kind: 'error' }); return; }
    const r = measureLatency(take.audio.channels[0], take.startFrame / take.audio.sampleRate, take.audio.sampleRate, emits);
    if (r.ok) {
      recorder.setOffsetMs(r.ms);
      toast(`Measured ${r.ms} ms for this input. Every take is shifted by that.`, { kind: 'ok' });
    } else {
      toast(r.reason, { kind: 'error' });
    }
  } catch (e) {
    toast(micError(e), { kind: 'error' });
  } finally {
    recorder.holdMonitor(false);
    app.calibrating = false;
    app.mic = recorder.state;
    syncOffset();
  }
}

/* ---------- export ---------- */

export type Delivery = 'save' | 'share';

/** Whether this device can hand a file to another app (the system share sheet). */
export function canShareFiles(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([''], 'a.mp3', { type: 'audio/mpeg' })] });
  } catch {
    return false;
  }
}

async function deliver(parts: BlobPart[], name: string, type: string, how: Delivery, title: string): Promise<boolean> {
  const blob = new Blob(parts, { type });
  if (how === 'share') {
    const file = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return true;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return false; // the person closed the share sheet
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

function begin(label: string): boolean {
  if (app.exporting || app.recording || !app.song) return false;
  if (transport.playing) transport.stop();
  app.exporting = { label, progress: 0 };
  return true;
}

function step(label: string, progress: number): void {
  if (app.exporting) { app.exporting.label = label; app.exporting.progress = progress; }
}

const sizeOf = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The whole mix, as you hear it (muted tracks left out), through the limiter. */
export async function exportMix(format: 'mp3' | 'wav', how: Delivery): Promise<void> {
  const song = app.song;
  if (!song) return;
  if (!song.tracks.some((t) => t.clips.length && audible(song, t))) { toast('Nothing to export yet: record something, or unmute a track.'); return; }
  if (!begin('Mixing…')) return;
  try {
    const plain = snapshot(song);
    const mp3 = format === 'mp3';
    const mix = await renderMix(plain, { ceiling: app.ceiling, onProgress: (p) => step('Mixing…', p * (mp3 ? 0.5 : 1)) });
    let bytes: ArrayBuffer;
    if (mp3) {
      step('Making the MP3…', 0.5);
      bytes = await encodeMp3(mix, (p) => step('Making the MP3…', 0.5 + p * 0.5));
    } else {
      bytes = encodeWav16(mix);
    }
    step('Done', 1);
    const name = `${safeName(song.name)}.${format}`;
    const sent = await deliver([bytes], name, mp3 ? 'audio/mpeg' : 'audio/wav', how, song.name);
    if (sent) {
      if (!song.exported) { song.exported = true; scheduleSave(); }
      toast(how === 'share' ? `Shared ${name}` : `Saved ${name} (${sizeOf(bytes.byteLength)}) to your downloads`, { kind: 'ok' });
    }
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, { kind: 'error' });
  } finally {
    app.exporting = null;
  }
}

/** Every track on its own (no mute/solo, no master limiter), zipped. */
export async function exportStems(how: Delivery): Promise<void> {
  const song = app.song;
  if (!song) return;
  const tracks = song.tracks.filter((t) => t.clips.length);
  if (!tracks.length) { toast('No tracks with audio to export.'); return; }
  if (!begin('Stems…')) return;
  try {
    const plain = snapshot(song);
    const folder = safeName(song.name);
    const entries: { name: string; data: Uint8Array }[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = plain.tracks.find((x) => x.id === tracks[i].id)!;
      const label = `Stem ${i + 1} of ${tracks.length}: ${t.name}`;
      step(label, i / tracks.length);
      const audio = await renderMix(plain, { tracks: [t], isolate: true, onProgress: (p) => step(label, (i + p) / tracks.length) });
      entries.push({ name: `${folder} stems/${String(i + 1).padStart(2, '0')} ${safeName(t.name, 'track')}.wav`, data: new Uint8Array(encodeWav16(audio)) });
    }
    step('Done', 1);
    const name = `${folder} stems.zip`;
    const parts = zipStore(entries);
    const sent = await deliver(parts as BlobPart[], name, 'application/zip', how, song.name);
    if (sent) toast(how === 'share' ? `Shared ${name}` : `Saved ${tracks.length} stems as ${name}`, { kind: 'ok' });
  } catch (e) {
    toast(`Stem export failed: ${(e as Error).message}`, { kind: 'error' });
  } finally {
    app.exporting = null;
  }
}

/** The whole project as one .tape file: opens here, in TAPE and in the old PLAYTAPE. */
export async function exportProject(how: Delivery): Promise<void> {
  const song = app.song;
  if (!song) return;
  if (!begin('Packing the project…')) return;
  try {
    const plain = snapshot(song);
    const audio = new Map<string, AudioData>();
    for (const id of usedBufIds(plain)) { const a = engine.bufferData(id); if (a) audio.set(id, a); }
    // Let the progress bar paint before the (synchronous) encoding.
    await new Promise((r) => setTimeout(r, 30));
    const parts = buildTapeParts(plain, audio);
    step('Done', 1);
    const name = `${safeName(song.name)}.tape`;
    const sent = await deliver(parts, name, 'application/json', how, song.name);
    if (sent) toast(how === 'share' ? `Shared ${name}` : `Saved ${name} to your downloads`, { kind: 'ok' });
  } catch (e) {
    toast(`Could not pack the project: ${(e as Error).message}`, { kind: 'error' });
  } finally {
    app.exporting = null;
  }
}

/* ---------- songs from the single-file TAPE / PLAYTAPE ---------- */

let oldRecents: OldRecent[] = [];

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Look (read-only) for things the old app left in this browser, to offer them in the Library. */
export async function checkOldData(): Promise<void> {
  try {
    const snap = await readOldSnapshot();
    oldRecents = await listOldRecents();
    const done = new Set<string>(JSON.parse(lsGet('playtape_old_imported') ?? '[]'));
    app.old = {
      snapshot: snap && !done.has(`snapshot:${snap.when}`) ? snap.when : null,
      recents: oldRecents.filter((r) => !done.has(`folder:${r.name}`)).map((r) => ({ name: r.name, when: r.when })),
    };
  } catch { /* nothing to offer */ }
}

function markImported(key: string): void {
  const done = new Set<string>(JSON.parse(lsGet('playtape_old_imported') ?? '[]'));
  done.add(key);
  lsSet('playtape_old_imported', JSON.stringify([...done]));
}

/** Convert an old project and put it in the Library. Returns the new song id. */
async function storeOldProject(old: OldProject): Promise<string> {
  await engine.ensure();
  const audio = new Map<string, AudioData>();
  let unreadable = old.missing.length;
  for (const m of old.media) {
    const decoded = decodeWav(m.bytes) ?? (await engine.decodeFile(m.bytes).catch(() => null));
    if (decoded) audio.set(m.bufId, decoded); else unreadable++;
  }
  const now = Date.now();
  const id = `s${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const song = songFromLegacy(old.project, { id, now, fallbackName: old.name, color: nextSongColor() });
  const durations = new Map<string, number>();
  for (const [bufId, a] of audio) durations.set(bufId, a.channels[0].length / a.sampleRate);
  fitClipsToBuffers(song, durations);
  // The old app marked songs that had a mixdown with a sticker; keep it.
  try { if ((JSON.parse(lsGet('playtape_stickers') ?? '[]') as string[]).includes(song.name)) song.exported = true; } catch { /* no stickers */ }
  await saveImportedSong(song, audio);
  await refreshLibrary();
  if (unreadable) toast(`“${song.name}”: ${unreadable} take(s) could not be read and were left out.`, { kind: 'error' });
  toast(`Imported “${song.name}”`, { kind: 'ok', action: { label: 'Open', run: () => void openSong(id) } });
  return id;
}

async function runImport(work: () => Promise<void>): Promise<void> {
  if (app.busy) return;
  app.busy = true;
  try {
    await work();
  } catch (e) {
    toast(`Could not import: ${(e as Error).message}`, { kind: 'error' });
  } finally {
    app.busy = false;
  }
}

export { canPickFolders };

/** Pick a TAPE / PLAYTAPE project folder anywhere on disk and bring it into the Library. */
export async function importOldFolder(): Promise<void> {
  const dir = await pickFolder();
  if (!dir) return;
  await runImport(async () => { await storeOldProject(await readProjectFolder(dir)); });
}

/** Import a folder the old app remembered (the browser asks for permission to read it). */
export async function importOldRecent(name: string): Promise<void> {
  const r = oldRecents.find((x) => x.name === name);
  if (!r) return;
  if (!(await allowRead(r.handle))) { toast('The browser was not allowed to read that folder.', { kind: 'error' }); return; }
  await runImport(async () => {
    await storeOldProject(await readProjectFolder(r.handle));
    markImported(`folder:${name}`);
    await checkOldData();
  });
}

/** Import the old app's unsaved-session backup. */
export async function importOldSnapshot(): Promise<void> {
  await runImport(async () => {
    const snap = await readOldSnapshot();
    if (!snap) { await checkOldData(); return; }
    // An unsaved session was called "Untitled": give it a name that says what it is.
    const named = snap.project.name && snap.project.name !== 'Untitled';
    const name = named ? snap.project.name! : `Recovered · ${new Date(snap.when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    await storeOldProject({ ...snap, name, project: { ...snap.project, name } });
    markImported(`snapshot:${snap.when}`);
    await checkOldData();
  });
}

/** Stop offering an item without importing it. */
export function dismissOld(kind: 'snapshot' | 'folder', name?: string): void {
  if (kind === 'snapshot' && app.old.snapshot != null) markImported(`snapshot:${app.old.snapshot}`);
  if (kind === 'folder' && name) markImported(`folder:${name}`);
  void checkOldData();
}

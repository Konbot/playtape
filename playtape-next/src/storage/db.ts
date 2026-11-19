/* The song library, kept in IndexedDB so it works in every browser (phones,
   Firefox, Safari) without a folder picker or a save prompt.
   - meta:  one small record per song, enough to draw its cassette
   - songs: the song JSON
   - audio: one record per take, raw float samples, written once when the take
            ends and never rewritten (the old app re-encoded every take to WAV
            on each 45-second backup). */

import type { Song, SongMeta } from '../model/types';
import type { AudioData } from './wav';

const DB_NAME = 'playtape-library';
const DB_VERSION = 1;

interface AudioRecord extends AudioData {
  key: string;
  songId: string;
  bufId: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('meta', { keyPath: 'id' });
      db.createObjectStore('songs', { keyPath: 'id' });
      db.createObjectStore('audio', { keyPath: 'key' }).createIndex('songId', 'songId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

/** For tests: forget the cached connection. */
export function resetConnection(): void {
  dbPromise?.then((db) => db.close()).catch(() => {});
  dbPromise = null;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listSongs(): Promise<SongMeta[]> {
  const db = await open();
  const all = await request(db.transaction('meta').objectStore('meta').getAll() as IDBRequest<SongMeta[]>);
  return all.sort((a, b) => b.modified - a.modified);
}

export async function loadSong(id: string): Promise<Song | null> {
  const db = await open();
  return (await request(db.transaction('songs').objectStore('songs').get(id) as IDBRequest<Song | undefined>)) ?? null;
}

export async function saveSong(song: Song, meta: SongMeta): Promise<void> {
  const db = await open();
  const tx = db.transaction(['songs', 'meta'], 'readwrite');
  tx.objectStore('songs').put(song);
  tx.objectStore('meta').put(meta);
  await done(tx);
}

/* Ask the browser, once per visit, not to evict the library when the disk
   gets tight. Chrome grants it silently to installed or often-used sites;
   a refusal changes nothing. */
let askedPersist = false;
function askPersist(): void {
  if (askedPersist) return;
  askedPersist = true;
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    void storage?.persist?.().catch(() => {});
  } catch { /* not available here */ }
}

export async function putAudio(songId: string, bufId: string, audio: AudioData): Promise<void> {
  askPersist();
  const db = await open();
  const tx = db.transaction('audio', 'readwrite');
  const rec: AudioRecord = { key: `${songId}/${bufId}`, songId, bufId, sampleRate: audio.sampleRate, channels: audio.channels };
  tx.objectStore('audio').put(rec);
  await done(tx);
}

export async function getAudio(songId: string, bufId: string): Promise<AudioData | null> {
  const db = await open();
  const rec = await request(db.transaction('audio').objectStore('audio').get(`${songId}/${bufId}`) as IDBRequest<AudioRecord | undefined>);
  return rec ? { sampleRate: rec.sampleRate, channels: rec.channels } : null;
}

export async function listAudioIds(songId: string): Promise<string[]> {
  const db = await open();
  const keys = await request(db.transaction('audio').objectStore('audio').index('songId').getAllKeys(songId));
  return keys.map((k) => String(k).slice(songId.length + 1));
}

export async function deleteAudio(songId: string, bufIds: string[]): Promise<void> {
  if (!bufIds.length) return;
  const db = await open();
  const tx = db.transaction('audio', 'readwrite');
  for (const b of bufIds) tx.objectStore('audio').delete(`${songId}/${b}`);
  await done(tx);
}

export async function deleteSong(id: string): Promise<void> {
  const db = await open();
  const ids = await listAudioIds(id);
  const tx = db.transaction(['songs', 'meta', 'audio'], 'readwrite');
  tx.objectStore('songs').delete(id);
  tx.objectStore('meta').delete(id);
  for (const b of ids) tx.objectStore('audio').delete(`${id}/${b}`);
  await done(tx);
}

/** Ask the browser not to evict the library under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

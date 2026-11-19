/* Reading what the single-file TAPE / PLAYTAPE left behind:
   - project folders (project.json + media/), from anywhere on disk;
   - on the same origin only: the crash-recovery snapshot ('tape-autosave')
     and the list of recently opened folders ('tape-recent').
   Read-only: nothing here writes to or deletes the old app's data. */

import { legacyBufferList, type LegacyProject } from '../model/legacy';

export interface OldMedia { bufId: string; name: string; bytes: ArrayBuffer }
export interface OldProject { name: string; project: LegacyProject; media: OldMedia[]; missing: string[] }
export interface OldRecent { name: string; when: number; handle: FileSystemDirectoryHandle }

export const canPickFolders = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Opening a database that does not exist would create it, so look first. */
async function hasDatabase(name: string): Promise<boolean> {
  try {
    const list = await indexedDB.databases?.();
    return !!list?.some((d) => d.name === name);
  } catch {
    return false;
  }
}

function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => { req.transaction?.abort(); resolve(null); };
  });
}

function getAll<T>(db: IDBDatabase, store: string, key?: IDBValidKey): Promise<T[]> {
  return new Promise((resolve) => {
    try {
      const os = db.transaction(store).objectStore(store);
      const req = key === undefined ? os.getAll() : os.get(key);
      req.onsuccess = () => resolve(key === undefined ? (req.result as T[]) : req.result ? [req.result as T] : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** The old app's unsaved-session backup, if there is one with anything in it. */
export async function readOldSnapshot(): Promise<(OldProject & { when: number }) | null> {
  if (!(await hasDatabase('tape-autosave'))) return null;
  const db = await openExisting('tape-autosave');
  if (!db) return null;
  try {
    const [snap] = await getAll<{ when: number; json: LegacyProject; media?: OldMedia[] }>(db, 'snap', 'latest');
    if (!snap?.json?.tracks?.length) return null;
    return { when: snap.when, name: snap.json.name || 'Recovered session', project: snap.json, media: snap.media ?? [], missing: [] };
  } finally {
    db.close();
  }
}

/** Project folders the old app remembered (their handles still need permission to read). */
export async function listOldRecents(): Promise<OldRecent[]> {
  if (!(await hasDatabase('tape-recent'))) return [];
  const db = await openExisting('tape-recent');
  if (!db) return [];
  try {
    const rows = await getAll<OldRecent>(db, 'recent');
    return rows.filter((r) => r?.handle && r.name).sort((a, b) => b.when - a.when);
  } finally {
    db.close();
  }
}

/** Read a TAPE / PLAYTAPE project folder: project.json plus the takes in media/. */
export async function readProjectFolder(dir: FileSystemDirectoryHandle): Promise<OldProject> {
  let file: File;
  try {
    file = await (await dir.getFileHandle('project.json')).getFile();
  } catch {
    throw new Error(`“${dir.name}” is not a TAPE project folder (no project.json inside).`);
  }
  const project = JSON.parse(await file.text()) as LegacyProject;
  let mediaDir: FileSystemDirectoryHandle | null = null;
  try { mediaDir = await dir.getDirectoryHandle('media'); } catch { /* a project with no takes yet */ }
  const media: OldMedia[] = [];
  const missing: string[] = [];
  for (const b of legacyBufferList(project)) {
    try {
      if (!mediaDir) throw new Error('no media folder');
      const f = await (await mediaDir.getFileHandle(b.mediaFile)).getFile();
      media.push({ bufId: b.bufId, name: b.mediaFile, bytes: await f.arrayBuffer() });
    } catch {
      missing.push(b.mediaFile);
    }
  }
  return { name: project.name || dir.name, project, media, missing };
}

/** Ask for read access to a remembered folder (must be called from a click). */
export async function allowRead(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & { requestPermission?: (o: { mode: 'read' }) => Promise<PermissionState> };
  try {
    return !h.requestPermission || (await h.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (window as unknown as { showDirectoryPicker: (o?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'read' });
  } catch {
    return null; // cancelled
  }
}

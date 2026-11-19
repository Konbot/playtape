/* One undo/redo history for everything in a song. Snapshot based: song JSON is
   small (audio lives elsewhere, referenced by buffer id), so this stays cheap
   and cannot get out of sync the way per-action inverse commands can. */

export class History<T> {
  private undoStack: { label: string; state: string }[] = [];
  private redoStack: { label: string; state: string }[] = [];

  constructor(private limit = 100) {}

  /** Call with the state as it is *before* a change. */
  push(label: string, before: T): void {
    this.undoStack.push({ label, state: JSON.stringify(before) });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string | null { return this.undoStack.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.redoStack.at(-1)?.label ?? null; }

  /** Returns the state to restore, or null when there is nothing to undo. */
  undo(current: T): { label: string; state: T } | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ label: entry.label, state: JSON.stringify(current) });
    return { label: entry.label, state: JSON.parse(entry.state) as T };
  }

  redo(current: T): { label: string; state: T } | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ label: entry.label, state: JSON.stringify(current) });
    return { label: entry.label, state: JSON.parse(entry.state) as T };
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

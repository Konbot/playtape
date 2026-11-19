/* Toasts replace the old grey status line. Errors stay until dismissed and
   can carry a fix; destructive actions carry Undo instead of a confirm box. */

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'ok' | 'error';
  action?: { label: string; run: () => void };
}

let seq = 0;
export const toasts = $state<Toast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
  const tm = timers.get(id);
  if (tm) { clearTimeout(tm); timers.delete(id); }
}

export function toast(
  message: string,
  opts: { kind?: Toast['kind']; action?: Toast['action']; timeout?: number } = {},
): number {
  const id = ++seq;
  const kind = opts.kind ?? 'info';
  toasts.push({ id, message, kind, action: opts.action });
  while (toasts.length > 3) dismiss(toasts[0].id);
  const ms = opts.timeout ?? (kind === 'error' ? 0 : opts.action ? 6000 : 3200);
  if (ms > 0) timers.set(id, setTimeout(() => dismiss(id), ms));
  return id;
}

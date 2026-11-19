/* One shared animation-frame loop for playhead, meters and the live take. */

const subs = new Set<(now: number) => void>();
let running = false;

function loop(t: number): void {
  for (const f of subs) f(t);
  if (subs.size) requestAnimationFrame(loop); else running = false;
}

/** Subscribe; returns the unsubscribe function (usable as an effect cleanup). */
export function onFrame(fn: (now: number) => void): () => void {
  subs.add(fn);
  if (!running) { running = true; requestAnimationFrame(loop); }
  return () => { subs.delete(fn); };
}

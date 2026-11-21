/* Svelte's own transitions (sheets and toasts sliding in) are run by script,
   so the Calm-mode stylesheet rule cannot stop them. They ask here instead. */

import { app } from '../state.svelte';

/** A transition length in ms: none in Calm mode or when the device asks for reduced motion. */
export function dur(ms: number): number {
  if (app.calm) return 0;
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  } catch { /* no matchMedia: keep the motion */ }
  return ms;
}

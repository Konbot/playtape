/* Clip scheduling shared by live playback and offline export, so both place
   and fade clips identically. */

import { clipDur, type Track } from '../model/types';

/** De-click fade at clip edges, seconds. */
export const FADE = 0.003;

/** Schedule the parts of a track's clips that fall inside song range [h0, h1),
    where song position h0 sounds at context time `ctxStart`. */
export function scheduleTrackClips(
  actx: BaseAudioContext,
  track: Track,
  input: AudioNode,
  buffers: Map<string, AudioBuffer>,
  ctxStart: number,
  h0: number,
  h1: number,
  onSource?: (src: AudioBufferSourceNode, gain: GainNode) => void,
): void {
  for (const c of track.clips) {
    const buf = buffers.get(c.bufId);
    if (!buf) continue;
    const cs = c.offset + track.nudge;
    const ce = cs + clipDur(c);
    if (ce <= h0 || cs >= h1) continue;
    const from = Math.max(cs, h0);
    const to = Math.min(ce, h1);
    const dur = to - from;
    if (dur <= 0.001) continue;
    const when = ctxStart + (from - h0);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const g = actx.createGain();
    if (dur > FADE * 4) {
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(1, when + FADE);
      g.gain.setValueAtTime(1, when + dur - FADE);
      g.gain.linearRampToValueAtTime(0, when + dur);
    }
    src.connect(g);
    g.connect(input);
    src.start(when, c.trimStart + (from - cs), dur);
    onSource?.(src, g);
  }
}

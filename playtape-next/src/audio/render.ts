/* Offline mixdown. Builds the same chains, limiter, reverb and clip
   scheduling as live playback in an OfflineAudioContext, so the file is what
   you heard. `isolate` renders the given tracks as stems: mute/solo ignored,
   no master gain or limiter. */

import { addWorklets, CEILING, createLimiter, engine, reverbBuffer } from './engine';
import { TrackChain } from './graph';
import { scheduleTrackClips } from './schedule';
import { audible, clipEnd, type Song, type Track } from '../model/types';
import type { AudioData } from '../storage/wav';

export async function renderMix(
  song: Song,
  opts: { tracks?: Track[]; isolate?: boolean; ceiling?: number; onProgress?: (p: number) => void } = {},
): Promise<AudioData> {
  const tracks = opts.tracks ?? song.tracks;
  const isolate = !!opts.isolate;
  const plays = (t: Track) => t.clips.length > 0 && (isolate || audible(song, t));
  let end = 0;
  for (const t of tracks) if (plays(t)) for (const c of t.clips) end = Math.max(end, clipEnd(c) + t.nudge);
  end = Math.max(0.5, end);
  const rate = engine.ctx?.sampleRate ?? 48000;
  const total = end + 0.3;
  const off = new OfflineAudioContext(2, Math.ceil(total * rate), rate);
  const master = off.createGain();
  master.gain.value = isolate ? 1 : song.masterVol;
  if (isolate) {
    master.connect(off.destination);
  } else {
    const lim = createLimiter(off, await addWorklets(off), CEILING * (opts.ceiling ?? 1));
    master.connect(lim.node);
    lim.node.connect(off.destination);
  }
  // A convolver costs full render time even when silent, so the bus exists only if something sends to it.
  let reverb: ConvolverNode | null = null;
  if (tracks.some((t) => plays(t) && t.verb > 0)) {
    reverb = off.createConvolver();
    reverb.buffer = reverbBuffer(off, song.reverbType);
    const ret = off.createGain();
    ret.gain.value = 0.9;
    reverb.connect(ret);
    ret.connect(master);
  }
  for (const t of tracks) {
    if (!plays(t)) continue;
    const chain = new TrackChain(off, master, reverb);
    chain.apply(t, true, song.bpm, true);
    scheduleTrackClips(off, t, chain.input, engine.buffers, 0, 0, Infinity);
  }
  if (opts.onProgress) {
    const step = Math.max(0.5, total / 100);
    for (let tm = step; tm < total; tm += step) {
      const at = tm;
      off.suspend(at).then(() => { opts.onProgress!(Math.min(1, at / total)); void off.resume(); }).catch(() => {});
    }
  }
  const out = await off.startRendering();
  return { sampleRate: out.sampleRate, channels: [out.getChannelData(0), out.getChannelData(1)] };
}

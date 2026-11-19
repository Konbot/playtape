/* Transport: plays the song through the persistent track chains.
   Playback is a list of segments (ctx time ↔ song position). When looping,
   the next pass is scheduled ahead of time on the audio clock, so the loop
   wraps sample-accurately (the old app stopped and restarted playback from a
   100 ms timer, leaving a gap every cycle). */

import { stepDur, triggerStep } from './drums';
import { engine } from './engine';
import { scheduleTrackClips } from './schedule';
import { songDuration, type DrumPattern, type Song } from '../model/types';

const LEAD = 0.06;        // seconds between "play" and first sound
const LOOKAHEAD = 0.3;    // how far ahead loop passes and clicks are scheduled

interface Segment { ctxStart: number; headStart: number; ctxEnd: number }

export const loopValid = (song: Song) => song.loop.b > song.loop.a + 0.1;

function makeClock(onTick: () => void): { stop: () => void } {
  // A Worker timer keeps ticking when the tab is in the background.
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),25)'], { type: 'application/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = onTick;
    return { stop: () => w.terminate() };
  } catch {
    const id = setInterval(onTick, 25);
    return { stop: () => clearInterval(id) };
  }
}

class Transport {
  song: Song | null = null;
  playing = false;
  /** Song position while stopped. */
  head = 0;
  metronome = false;
  /** ctx time and song position where the current run began (for placing takes). */
  playStartCtx = 0;
  playStartHead = 0;
  /** While counting in: ctx times of the count-in beats. */
  countInBeats: number[] = [];
  /** Keep rolling past the end of the song (recording). */
  holdOpen = false;
  /** Do not stop at the end of the song (drum machine playing on its own). */
  openEnded = false;
  onStop: (() => void) | null = null;
  /** When set and it returns a pattern, the drum machine plays along on the song grid. */
  liveDrums: (() => DrumPattern | null) | null = null;

  private segments: Segment[] = [];
  private sources = new Set<AudioBufferSourceNode>();
  private clock: { stop: () => void } | null = null;
  private clickUntil = 0;
  private drumUntil = 0;
  private endAt = Infinity;

  /** Current song position in seconds. */
  position(): number {
    if (!this.playing || !engine.ctx) return this.head;
    const now = engine.ctx.currentTime;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      if (now >= s.ctxStart) return s.headStart + Math.min(now, s.ctxEnd) - s.ctxStart;
    }
    return this.segments[0]?.headStart ?? this.head;
  }

  /** True between pressing record/play and the downbeat. */
  get countingIn(): boolean {
    return this.playing && !!engine.ctx && engine.ctx.currentTime < this.playStartCtx;
  }

  seek(pos: number): void {
    const p = Math.max(0, pos);
    if (this.playing) { this.haltSources(); this.head = p; this.begin(false); } else this.head = p;
  }

  /** Start playback from the current head. Returns the ctx time of the downbeat. */
  play(opts: { countIn?: boolean; holdOpen?: boolean; openEnded?: boolean } = {}): number {
    if (!engine.ctx || !this.song) return 0;
    if (this.playing) this.haltSources();
    this.holdOpen = !!opts.holdOpen;
    this.openEnded = !!opts.openEnded;
    if (!this.holdOpen && !this.openEnded && this.head >= songDuration(this.song) - 0.02) this.head = 0;
    return this.begin(!!opts.countIn);
  }

  private begin(countIn: boolean): number {
    const ctx = engine.ctx!;
    const song = this.song!;
    const beat = 60 / song.bpm;
    const start = ctx.currentTime + LEAD + (countIn ? beat * 4 : 0);
    this.playStartCtx = start;
    this.playStartHead = this.head;
    this.countInBeats = countIn ? [0, 1, 2, 3].map((i) => start - (4 - i) * beat) : [];
    this.countInBeats.forEach((t, i) => this.click(t, i === 0));
    const looping = song.loop.on && loopValid(song) && this.head < song.loop.b - 0.01 && !this.holdOpen;
    const seg: Segment = { ctxStart: start, headStart: this.head, ctxEnd: looping ? start + (song.loop.b - this.head) : Infinity };
    this.segments = [seg];
    this.scheduleSegment(seg);
    for (const t of song.tracks) engine.chains.get(t.id)?.retrigger(t, start);
    this.endAt = looping || this.holdOpen || this.openEnded ? Infinity : start + Math.max(0, songDuration(song) - this.head) + 0.4;
    this.clickUntil = start;
    this.drumUntil = start;
    this.playing = true;
    this.clock ??= makeClock(() => this.tick());
    return start;
  }

  private scheduleSegment(seg: Segment): void {
    const ctx = engine.ctx!;
    const song = this.song!;
    const h0 = seg.headStart;
    const h1 = seg.ctxEnd === Infinity ? Infinity : h0 + (seg.ctxEnd - seg.ctxStart);
    for (const t of song.tracks) {
      const chain = engine.chains.get(t.id);
      if (!chain) continue;
      scheduleTrackClips(ctx, t, chain.input, engine.buffers, seg.ctxStart, h0, h1, (src, g) => {
        this.sources.add(src);
        src.onended = () => { this.sources.delete(src); try { g.disconnect(); } catch { /* fine */ } };
      });
    }
  }

  private tick(): void {
    if (!this.playing || !engine.ctx || !this.song) return;
    const now = engine.ctx.currentTime;
    const song = this.song;
    // Queue the next loop pass before the current one runs out.
    const last = this.segments[this.segments.length - 1];
    if (last.ctxEnd !== Infinity && last.ctxEnd - now < LOOKAHEAD) {
      if (song.loop.on && loopValid(song)) {
        const next: Segment = { ctxStart: last.ctxEnd, headStart: song.loop.a, ctxEnd: last.ctxEnd + (song.loop.b - song.loop.a) };
        this.segments.push(next);
        this.scheduleSegment(next);
        if (this.segments.length > 3) this.segments.shift();
      } else {
        last.ctxEnd = Infinity; // loop was switched off mid-pass: this pass's sources end at the old boundary
        this.endAt = now + 0.2;
      }
    }
    if (this.metronome) this.scheduleClicks(now + LOOKAHEAD);
    const pattern = this.liveDrums?.();
    if (pattern) this.scheduleDrums(pattern, now + LOOKAHEAD); else this.drumUntil = now;
    if (now >= this.endAt) this.stop();
  }

  private scheduleClicks(until: number): void {
    const beat = 60 / this.song!.bpm;
    for (const s of this.segments) {
      const from = Math.max(this.clickUntil, s.ctxStart);
      const to = Math.min(until, s.ctxEnd);
      if (to <= from) continue;
      // Beats sit on the song grid: beat k is at song position k * beat.
      let k = Math.ceil((s.headStart + (from - s.ctxStart)) / beat - 1e-6);
      for (;;) {
        const t = s.ctxStart + (k * beat - s.headStart);
        if (t >= to) break;
        if (t >= from) this.click(t, k % 4 === 0);
        k++;
      }
    }
    this.clickUntil = Math.max(this.clickUntil, until);
  }

  private scheduleDrums(pattern: DrumPattern, until: number): void {
    const sd = stepDur(this.song!.bpm);
    for (const s of this.segments) {
      const from = Math.max(this.drumUntil, s.ctxStart);
      const to = Math.min(until, s.ctxEnd);
      if (to <= from) continue;
      let k = Math.ceil((s.headStart + (from - s.ctxStart)) / sd - 1e-6);
      for (;;) {
        const t = s.ctxStart + (k * sd - s.headStart);
        if (t >= to) break;
        if (t >= from) triggerStep(engine.ctx!, engine.drumBus, pattern, ((k % 16) + 16) % 16, t);
        k++;
      }
    }
    this.drumUntil = Math.max(this.drumUntil, until);
  }

  private click(time: number, accent: boolean): void {
    const ctx = engine.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1500 : 900;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g); g.connect(engine.master);
    o.start(time); o.stop(time + 0.06);
  }

  private haltSources(): void {
    for (const s of this.sources) { try { s.onended = null; s.stop(); s.disconnect(); } catch { /* fine */ } }
    this.sources.clear();
  }

  /** Stop and leave the head where playback got to. */
  stop(): void {
    if (!this.playing) return;
    const pos = this.position();
    this.haltSources();
    this.playing = false;
    this.head = pos;
    this.segments = [];
    this.countInBeats = [];
    this.holdOpen = false;
    this.openEnded = false;
    this.clock?.stop();
    this.clock = null;
    this.onStop?.();
  }

  /** Re-plan what is sounding after an edit made during playback. */
  refresh(): void {
    // Never while recording: the take is placed relative to this run's start.
    if (!this.playing || this.countingIn || this.holdOpen) return;
    this.head = this.position();
    this.haltSources();
    this.begin(false);
  }
}

export const transport = new Transport();

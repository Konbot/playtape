<!-- A clip: a solid block of its track's colour with the waveform drawn as
     chunky bars, at device pixel ratio so it stays sharp on phones.
     Mouse: drag to move (also to another track), drag the edges to trim.
     Touch: tap to select, then drag the clip or its edge handles; an
     unselected clip lets the timeline scroll under your finger. -->
<script lang="ts">
  import { app, beginEdit, endEdit, moveClip, moveClipToTrack, snapper } from '../state.svelte';
  import { engine } from '../audio/engine';
  import { clipDur, type Clip, type Track } from '../model/types';
  import { viewport } from './viewport.svelte';

  let {
    clip, track, trackIndex, trackCount, pps, height, laneH,
  }: { clip: Clip; track: Track; trackIndex: number; trackCount: number; pps: number; height: number; laneH: number } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  const width = $derived(Math.max(10, clipDur(clip) * pps));
  const selected = $derived(app.selected?.clipId === clip.id && app.selected?.trackId === track.id);

  $effect(() => {
    void app.peaksVersion;
    void app.theme;
    const cv = canvas;
    if (!cv) return;
    const w = width;
    const h = height;
    // Only the stretch that is on screen (plus a margin) gets a canvas, at full
    // sharpness. The viewport is read in coarse steps so scrolling redraws
    // a clip only every STEP pixels, not on every scroll event.
    const MARGIN = 320, STEP = 160;
    const left = clip.offset * pps;
    const vl = Math.floor(viewport.left / STEP) * STEP;
    const x0 = Math.max(0, Math.min(w, vl - left - MARGIN));
    const x1 = Math.max(0, Math.min(w, vl + viewport.width - left + MARGIN + STEP));
    const cw = x1 - x0;
    cv.style.left = `${x0}px`;
    cv.style.width = `${cw}px`;
    if (cw < 1) { cv.width = 1; return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, -x0 * dpr, 0);
    const peaks = engine.peaks.get(clip.bufId);
    const buf = engine.buffers.get(clip.bufId);
    if (!peaks || !buf) return;
    g.fillStyle = getComputedStyle(cv).color;
    const a = clip.trimStart / buf.duration;
    const b = clip.trimEnd / buf.duration;
    const mid = h / 2;
    const step = 3;
    for (let x = Math.max(1, Math.ceil((x0 - 1) / step) * step + 1); x < Math.min(w - 1, x1); x += step) {
      const i0 = Math.floor((a + (b - a) * (x / w)) * peaks.length);
      const i1 = Math.max(i0 + 1, Math.floor((a + (b - a) * ((x + step) / w)) * peaks.length));
      let p = 0;
      for (let i = i0; i < i1 && i < peaks.length; i++) if (peaks[i] > p) p = peaks[i];
      const bar = Math.max(2, Math.min(1, p * 1.15) * (h - 10));
      g.beginPath();
      g.roundRect(x, mid - bar / 2, 2, bar, 1);
      g.fill();
    }
  });

  /* ---- drag to move / trim ---- */
  type Mode = 'move' | 'l' | 'r';
  let mode: Mode | null = null;
  let moved = false;
  let wasSelected = false;
  let suppressClick = false;
  let startX = 0;
  let startY = 0;
  let orig = { offset: 0, trimStart: 0, trimEnd: 0 };
  let snap: (t: number, free: boolean) => number = (t) => t;
  let dTracks = $state(0);
  let dragging = $state(false);

  function down(e: PointerEvent, m: Mode) {
    if (app.recording || e.button > 0) return;
    wasSelected = selected;
    // On touch an unselected clip must not swallow the scroll gesture: tap selects, then drag.
    if (e.pointerType === 'touch' && !selected) return;
    e.stopPropagation();
    mode = m;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    orig = { offset: clip.offset, trimStart: clip.trimStart, trimEnd: clip.trimEnd };
    snap = snapper(clip.id);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already gone: the drag still works without capture */ }
    if (!selected) app.selected = { trackId: track.id, clipId: clip.id };
  }

  function move(e: PointerEvent) {
    if (!mode) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      moved = true;
      dragging = true;
      beginEdit(mode === 'move' ? 'Move clip' : 'Trim clip');
    }
    const d = dx / pps;
    const free = e.altKey;
    const dur = orig.trimEnd - orig.trimStart;
    if (mode === 'move') {
      let off = orig.offset + d;
      const s1 = snap(off, free);
      if (s1 !== off) off = s1;
      else {
        const e1 = snap(off + dur, free);
        if (e1 !== off + dur) off = e1 - dur;
      }
      moveClip(clip, off);
      dTracks = Math.max(-trackIndex, Math.min(trackCount - 1 - trackIndex, Math.round(dy / laneH)));
    } else if (mode === 'l') {
      const want = snap(orig.offset + d, free);
      let ts = orig.trimStart + (want - orig.offset);
      ts = Math.max(Math.max(0, orig.trimStart - orig.offset), Math.min(orig.trimEnd - 0.05, ts));
      clip.trimStart = ts;
      clip.offset = orig.offset + (ts - orig.trimStart);
    } else {
      const bufDur = engine.buffers.get(clip.bufId)?.duration ?? orig.trimEnd;
      const want = snap(orig.offset + dur + d, free);
      clip.trimEnd = Math.max(orig.trimStart + 0.05, Math.min(bufDur, orig.trimEnd + (want - (orig.offset + dur))));
    }
  }

  function up() {
    if (!mode) return;
    const m = mode;
    mode = null;
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const to = trackIndex + dTracks;
    dTracks = 0;
    dragging = false;
    if (m === 'move' && to !== trackIndex) moveClipToTrack(clip.id, track.id, to);
    endEdit();
  }

  function click(e: MouseEvent) {
    e.stopPropagation();
    if (app.recording || suppressClick) return;
    // A press on an unselected clip selects it; a plain click on a selected one lets go.
    // detail 0 means the keyboard (Enter), which has no press before it: toggle.
    const letGo = selected && (wasSelected || e.detail === 0);
    app.selected = letGo ? null : { trackId: track.id, clipId: clip.id };
    wasSelected = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="clip"
  class:selected
  class:dragging
  style:left="{clip.offset * pps}px"
  style:width="{width}px"
  style:height="{height}px"
  style:transform={dTracks ? `translateY(${dTracks * laneH}px)` : undefined}
  onpointerdown={(e) => down(e, 'move')}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
>
  <button class="body" aria-label="Clip, {clipDur(clip).toFixed(1)} seconds{clip.takes ? `, take ${(clip.take ?? 0) + 1} of ${clip.takes.length}` : ''}" aria-pressed={selected} onclick={click}>
    <canvas bind:this={canvas}></canvas>
  </button>
  {#if clip.takes}<span class="pill mono">{(clip.take ?? clip.takes.length - 1) + 1}/{clip.takes.length}</span>{/if}
  <span class="h l" onpointerdown={(e) => down(e, 'l')}></span>
  <span class="h r" onpointerdown={(e) => down(e, 'r')}></span>
</div>

<style>
  .clip {
    position: absolute;
    top: 8px;
    background: var(--c);
    border: var(--line-w) solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    cursor: grab;
    transition: box-shadow 0.2s var(--ease-out);
  }
  .clip.selected {
    z-index: 3;
    box-shadow: 4px 4px 0 var(--shadow), 0 0 0 3px var(--blue);
    touch-action: none;
  }
  .clip.dragging {
    z-index: 8;
    cursor: grabbing;
    opacity: 0.92;
  }
  .body {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: inherit;
  }
  .body {
    position: relative;
  }
  canvas {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    height: 100%;
    color: var(--on-track);
    opacity: 0.82;
  }
  .pill {
    position: absolute;
    top: 4px;
    left: 16px;
    padding: 1px 6px;
    font-size: var(--t-12);
    font-weight: 700;
    color: var(--on-track);
    background: oklch(0.99 0.008 85);
    border: var(--line-w) solid var(--line);
    border-radius: 99px;
    pointer-events: none;
  }
  /* trim handles: always there for the mouse, shown as grips once selected */
  .h {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 12px;
    cursor: ew-resize;
    touch-action: none;
  }
  .h.l { left: 0; }
  .h.r { right: 0; }
  .selected .h {
    background: var(--blue);
  }
  .selected .h::after {
    content: '';
    position: absolute;
    inset: 30% 4px;
    border-radius: 2px;
    background: var(--on-blue);
  }
  @media (hover: hover) {
    .h:hover {
      background: color-mix(in oklch, var(--line) 30%, transparent);
    }
  }
  @media (pointer: coarse) {
    .selected .h {
      width: 22px;
    }
    .selected .h::after {
      inset: 30% 9px;
    }
  }
</style>

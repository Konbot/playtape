<!-- The take being recorded, growing in real time. The old app showed nothing
     until you pressed stop. When punching into a loop it only grows inside
     the region that will be kept. -->
<script lang="ts">
  import { LIVE_PEAK_RATE, recorder } from '../audio/recorder';
  import { transport } from '../audio/transport';
  import { onFrame } from '../lib/raf';
  import { app } from '../state.svelte';

  let { pps, height }: { pps: number; height: number } = $props();

  const MAX_W = 2400;
  let box: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() =>
    onFrame(() => {
      const el = box;
      const cv = canvas;
      if (!el || !cv) return;
      const punch = app.punch;
      const start = punch ? punch.a : transport.playStartHead;
      let elapsed = Math.max(0, transport.position() - start);
      if (punch) elapsed = Math.min(elapsed, punch.b - punch.a);
      const fullW = elapsed * pps;
      const w = Math.min(fullW, MAX_W);
      el.style.left = `${start * pps + (fullW - w)}px`;
      el.style.width = `${Math.max(6, w)}px`;
      el.style.opacity = punch && elapsed === 0 ? '0.35' : '1';
      if (w < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(w * dpr);
      const ch = Math.round(height * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, height);
      const peaks = recorder.state === 'recording' ? recorder.livePeaks : null;
      if (!peaks) return; // Keys: no input waveform, the block itself shows progress
      g.fillStyle = getComputedStyle(cv).color;
      // Capture begins a little before the downbeat (scheduling lead, count-in, roll-in): skip that part.
      const captureStart = recorder.captureStartTime;
      const pre = (captureStart == null ? 0 : Math.max(0, transport.playStartCtx - captureStart)) + (start - transport.playStartHead);
      const t0 = elapsed - w / pps;
      const mid = height / 2;
      for (let x = 1; x < w - 1; x += 3) {
        const i = Math.floor((t0 + x / pps + pre) * LIVE_PEAK_RATE);
        if (i >= peaks.length) break;
        const p = Math.max(peaks[i] ?? 0, peaks[i + 1] ?? 0);
        const bar = Math.max(2, Math.min(1, p * 1.15) * (height - 10));
        g.beginPath();
        g.roundRect(x, mid - bar / 2, 2, bar, 1);
        g.fill();
      }
    }),
  );
</script>

<div class="ghost" bind:this={box} style:height="{height}px">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .ghost {
    position: absolute;
    top: 8px;
    width: 6px;
    background: var(--tomato);
    border: var(--line-w) solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    z-index: 4;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    color: var(--on-tomato);
  }
</style>

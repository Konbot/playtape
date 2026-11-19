<!-- Capture view: fat lanes that fill the screen. Track heads stick to the
     left and the ruler to the top inside one scroller, so there is nothing to
     keep in sync by hand. -->
<script lang="ts">
  import { addTrack, app, beginEdit, deleteTrack, endEdit, loopValid, mutate, renameTrack, seek, setZoom, snapper } from '../state.svelte';
  import { engine, meterLevel } from '../audio/engine';
  import { transport } from '../audio/transport';
  import { onFrame } from '../lib/raf';
  import { songDuration, type Track } from '../model/types';
  import ClipView from './ClipView.svelte';
  import Icon from './Icon.svelte';
  import Key from './Key.svelte';
  import Menu from './Menu.svelte';
  import RecGhost from './RecGhost.svelte';
  import { viewport } from './viewport.svelte';

  const RULER_H = 36;

  let winW = $state(window.innerWidth);
  const narrow = $derived(winW < 700);
  const headW = $derived(narrow ? 104 : 184);
  const laneH = $derived(narrow ? 92 : 100);
  const clipH = $derived(laneH - 16);

  let scroller: HTMLDivElement | undefined = $state();
  let ruler: HTMLCanvasElement | undefined = $state();
  let playheadEl: HTMLDivElement | undefined = $state();
  let capEl: HTMLDivElement | undefined = $state();
  let viewW = $state(800);
  /** Grows while a long take runs past the current end of the lane. */
  let minLen = $state(0);

  const song = $derived(app.song!);
  const pps = $derived(app.pps);
  const laneW = $derived(Math.max(viewW - headW, (Math.max(songDuration(song), minLen, song.loop.b) + 30) * pps));
  const beatPx = $derived((60 / song.bpm) * pps);
  const hasLoop = $derived(loopValid(song));
  const meterEls = new Map<number, HTMLElement>();
  let lastPos = -1;

  function meter(node: HTMLElement, id: number) {
    meterEls.set(id, node);
    return { destroy: () => { if (meterEls.get(id) === node) meterEls.delete(id); } };
  }

  function drawRuler() {
    const cv = ruler;
    const sc = scroller;
    if (!cv || !sc) return;
    const w = Math.max(10, viewW - headW);
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = `${w}px`;
    if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
    if (cv.height !== Math.round(RULER_H * dpr)) cv.height = Math.round(RULER_H * dpr);
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, RULER_H);
    const cs = getComputedStyle(cv);
    const ink = cs.color;
    const sl = sc.scrollLeft;
    let step = 300;
    for (const s of [1, 2, 5, 10, 15, 30, 60, 120]) if (s * pps >= 64) { step = s; break; }
    const minor = step % 5 === 0 ? step / 5 : step / 2;
    g.font = `600 12px ${cs.fontFamily}`;
    g.textBaseline = 'middle';
    g.fillStyle = ink;
    for (let t = Math.floor(sl / pps / minor) * minor; t * pps < sl + w; t += minor) {
      const x = Math.round(t * pps - sl);
      const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      g.globalAlpha = major ? 0.9 : 0.35;
      g.fillRect(x, major ? RULER_H - 14 : RULER_H - 8, major ? 2 : 1, major ? 14 : 8);
      if (major) {
        const s = Math.round(t);
        g.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x + 6, 13);
      }
    }
    g.globalAlpha = 1;
  }

  $effect(() => {
    void pps; void viewW; void headW; void app.theme;
    drawRuler();
  });

  // Tell the clips which part of the lane is visible (see viewport.svelte.ts).
  function syncViewport() {
    if (!scroller) return;
    viewport.left = scroller.scrollLeft;
    viewport.width = Math.max(100, viewW - headW);
  }
  $effect(() => { void viewW; void headW; void pps; syncViewport(); });
  function onScroll() {
    drawRuler();
    syncViewport();
  }

  $effect(() =>
    onFrame(() => {
      const pos = transport.position();
      const x = pos * app.pps;
      if (playheadEl) playheadEl.style.transform = `translateX(${x}px)`;
      if (capEl) capEl.style.transform = `translateX(${x}px)`;
      // Keep the playhead in view whenever it moves (playing, seeking, or
      // jumping back to the start of a take), but leave manual scrolling alone while it is still.
      const sc = scroller;
      if (sc && pos !== lastPos && !pinch) {
        const vis = sc.clientWidth - headW;
        if (x < sc.scrollLeft || x > sc.scrollLeft + vis - 56) sc.scrollLeft = Math.max(0, x - vis * 0.2);
      }
      lastPos = pos;
      if (app.recording && pos > minLen - 10) minLen = pos + 60;
      for (const [id, el] of meterEls) {
        const lvl = transport.playing ? meterLevel(engine.chains.get(id)?.analyser) : 0;
        el.style.setProperty('--lvl', lvl.toFixed(3));
      }
    }),
  );

  /* ruler: tap to jump, drag to scrub */
  let scrubbing = false;
  function rulerTime(e: PointerEvent): number {
    const r = ruler!.getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left + scroller!.scrollLeft) / pps);
  }
  function rulerDown(e: PointerEvent) {
    if (app.recording) return;
    scrubbing = true;
    try { ruler!.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    seek(rulerTime(e));
  }
  function rulerMove(e: PointerEvent) {
    if (scrubbing && !transport.playing) seek(rulerTime(e));
  }
  function rulerUp(e: PointerEvent) {
    if (!scrubbing) return;
    scrubbing = false;
    if (transport.playing) seek(rulerTime(e));
  }

  /* loop region: drag its ends or the bar itself */
  let loopDrag: { mode: 'a' | 'b' | 'move'; x: number; a: number; b: number; moved: boolean; snap: (t: number, free: boolean) => number } | null = null;
  function loopDown(e: PointerEvent, mode: 'a' | 'b' | 'move') {
    if (app.recording) return;
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already gone: the drag still works without capture */ }
    loopDrag = { mode, x: e.clientX, a: song.loop.a, b: song.loop.b, moved: false, snap: snapper(null) };
  }
  function loopMove(e: PointerEvent) {
    const d = loopDrag;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 3) return;
      d.moved = true;
      beginEdit('Move loop');
    }
    const dt = dx / pps;
    if (d.mode === 'a') song.loop.a = Math.max(0, Math.min(d.b - 0.2, d.snap(d.a + dt, e.altKey)));
    else if (d.mode === 'b') song.loop.b = Math.max(d.a + 0.2, d.snap(d.b + dt, e.altKey));
    else {
      const a = Math.max(0, d.snap(d.a + dt, e.altKey));
      song.loop.a = a;
      song.loop.b = a + (d.b - d.a);
    }
  }
  function loopUp() {
    const d = loopDrag;
    loopDrag = null;
    if (d?.moved) endEdit();
    else if (d?.mode === 'move') mutate(song.loop.on ? 'Loop off' : 'Loop on', (s) => { s.loop.on = !s.loop.on; });
  }

  /* click, not pointerdown: dragging to scroll the timeline must not move the playhead */
  function laneDown(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    app.selected = null;
    if (!app.recording) seek(e.offsetX / pps);
  }

  function zoomAround(newPps: number, x: number, tAt: number) {
    setZoom(newPps);
    requestAnimationFrame(() => { if (scroller) scroller.scrollLeft = Math.max(0, tAt * app.pps - x); });
  }

  function onWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey) || !scroller) return;
    e.preventDefault();
    const r = scroller.getBoundingClientRect();
    const x = e.clientX - r.left - headW;
    zoomAround(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), x, (scroller.scrollLeft + x) / pps);
  }

  /* two-finger pinch zooms the timeline around the midpoint */
  let pinch: { d0: number; pps0: number; x: number; tAt: number } | null = null;
  $effect(() => {
    const sc = scroller;
    if (!sc) return;
    const spread = (e: TouchEvent) => Math.max(24, Math.abs(e.touches[0].clientX - e.touches[1].clientX));
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) { pinch = null; return; }
      const r = sc.getBoundingClientRect();
      const x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left - headW;
      pinch = { d0: spread(e), pps0: app.pps, x, tAt: (sc.scrollLeft + x) / app.pps };
    };
    const moveT = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomAround(pinch.pps0 * (spread(e) / pinch.d0), pinch.x, pinch.tAt);
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    sc.addEventListener('touchstart', start, { passive: true });
    sc.addEventListener('touchmove', moveT, { passive: false });
    sc.addEventListener('touchend', end);
    sc.addEventListener('touchcancel', end);
    return () => {
      sc.removeEventListener('touchstart', start);
      sc.removeEventListener('touchmove', moveT);
      sc.removeEventListener('touchend', end);
      sc.removeEventListener('touchcancel', end);
    };
  });

  function toggleMute(t: Track) { mutate(t.mute ? `Unmute ${t.name}` : `Mute ${t.name}`, () => { t.mute = !t.mute; }, { replan: false }); }
  function toggleSolo(t: Track) { mutate(t.solo ? `Unsolo ${t.name}` : `Solo ${t.name}`, () => { t.solo = !t.solo; }, { replan: false }); }
  function toggleTarget(t: Track) { app.target = app.target === t.id ? null : t.id; }
</script>

<svelte:window bind:innerWidth={winW} />

<div
  class="tl"
  class:rec={app.recording}
  bind:this={scroller}
  bind:clientWidth={viewW}
  onscroll={onScroll}
  onwheel={onWheel}
  style:--head-w="{headW}px"
  style:--lane-h="{laneH}px"
  style:--lane-w="{laneW}px"
  style:--beat="{beatPx}px"
  style:--bar="{beatPx * 4}px"
>
  <div class="inner" style:width="{headW + laneW}px">
    <div class="ruler-row" style:height="{RULER_H}px">
      <div class="corner">
        <Key icon="zoomOut" label="Zoom out" size="sm" tone="plain" onclick={() => setZoom(pps / 1.3)} />
        <Key icon="zoomIn" label="Zoom in" size="sm" tone="plain" onclick={() => setZoom(pps * 1.3)} />
      </div>
      <canvas class="ruler" bind:this={ruler} onpointerdown={rulerDown} onpointermove={rulerMove} onpointerup={rulerUp} onpointercancel={rulerUp}></canvas>
      {#if hasLoop}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="loopbar"
          class:off={!song.loop.on}
          style:left="{headW + song.loop.a * pps}px"
          style:width="{(song.loop.b - song.loop.a) * pps}px"
          title="Loop: drag to move, drag the ends to resize, click to switch {song.loop.on ? 'off' : 'on'}"
          onpointerdown={(e) => loopDown(e, 'move')}
          onpointermove={loopMove}
          onpointerup={loopUp}
          onpointercancel={loopUp}
        >
          <span class="lh a" onpointerdown={(e) => loopDown(e, 'a')}></span>
          <span class="lh b" onpointerdown={(e) => loopDown(e, 'b')}></span>
        </div>
      {/if}
      <div class="cap" bind:this={capEl}></div>
    </div>

    {#each song.tracks as t, i (t.id)}
      <div class="row" style:--c="var(--tc-{t.color % 8})" class:muted={t.mute} class:target={app.target === t.id}>
        <div class="head">
          <div class="who">
            <span class="num mono">{i + 1}</span>
            <input
              class="tname tape"
              style:--tilt="{i % 2 ? 0.8 : -1}deg"
              value={t.name}
              aria-label="Track {i + 1} name"
              onchange={(e) => renameTrack(t, e.currentTarget.value)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
            />
          </div>
          <div class="btns">
            <Key size="sm" icon={t.mute ? 'speakerOff' : 'speaker'} label={t.mute ? `Unmute ${t.name}` : `Mute ${t.name}`} pressed={t.mute} onclick={() => toggleMute(t)} />
            {#if !narrow}
              <Key size="sm" icon="record" label="Record onto {t.name}" pressed={app.target === t.id} onclick={() => toggleTarget(t)} />
            {/if}
            <Menu
              size="sm"
              label="More for {t.name}"
              align="start"
              items={[
                { label: app.target === t.id ? 'Stop recording onto this' : 'Record onto this track', icon: 'record', checked: app.target === t.id, run: () => toggleTarget(t) },
                { label: t.solo ? 'Unsolo' : 'Solo', icon: 'headphones', checked: t.solo, run: () => toggleSolo(t) },
                { label: 'Delete track', icon: 'trash', danger: true, run: () => deleteTrack(t.id) },
              ]}
            />
          </div>
          <div class="meter"><i use:meter={t.id}></i></div>
        </div>
        <div class="lane" onclick={laneDown} role="presentation">
          {#each t.clips as c (c.id)}
            <ClipView clip={c} track={t} trackIndex={i} trackCount={song.tracks.length} {pps} height={clipH} {laneH} />
          {/each}
          {#if app.recording && app.target === t.id}<RecGhost {pps} height={clipH} />{/if}
        </div>
      </div>
    {/each}

    {#if app.recording && !song.tracks.some((t) => t.id === app.target)}
      <div class="row new">
        <div class="head"><div class="who"><span class="num rec-dot"><Icon name="record" size={14} /></span><span class="tname as-text">New take</span></div></div>
        <div class="lane"><RecGhost {pps} height={clipH} /></div>
      </div>
    {/if}

    {#if !app.recording}
      <div class="row add">
        <div class="head">
          {#if narrow}
            <Key icon="plus" tone="blue" label="Add a track" onclick={addTrack} />
          {:else}
            <Key icon="plus" tone="blue" label="Add a track" onclick={addTrack}>Track</Key>
          {/if}
        </div>
        <div class="lane"></div>
      </div>
    {/if}

    {#if !song.tracks.length && !app.recording}
      <div class="empty" style:width="{viewW}px">
        <p class="notepaper"><b>Empty tape.</b><br />Press the red key, then sing, strum or clap.</p>
      </div>
    {/if}

    {#if hasLoop}
      <div class="loopband" class:off={!song.loop.on} style:left="{headW + song.loop.a * pps}px" style:width="{(song.loop.b - song.loop.a) * pps}px" style:top="{RULER_H}px"></div>
    {/if}
    <div class="playhead" bind:this={playheadEl}></div>
  </div>
</div>

<style>
  .tl {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--bg-sunk);
    overscroll-behavior: contain;
  }
  .tl.rec {
    background: color-mix(in oklch, var(--bg-sunk), var(--tomato) 9%);
  }
  .inner {
    position: relative;
    min-height: 100%;
  }
  .ruler-row {
    position: sticky;
    top: 0;
    z-index: 6;
    display: flex;
    background: var(--bg);
    border-bottom: var(--line-w) solid var(--line);
  }
  .corner {
    position: sticky;
    left: 0;
    z-index: 3;
    flex: none;
    width: var(--head-w);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 var(--s-1);
    background: var(--bg);
    border-right: var(--line-w) solid var(--line);
  }
  .corner :global(.key) {
    --h: 30px;
  }
  .ruler {
    position: sticky;
    left: var(--head-w);
    flex: none;
    height: 100%;
    display: block;
    cursor: pointer;
    touch-action: none;
    color: var(--text);
    font-family: var(--font-mono);
  }
  .loopbar {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 1;
    background: color-mix(in oklch, var(--blue) 34%, transparent);
    border-inline: 3px solid var(--blue);
    cursor: grab;
    touch-action: none;
  }
  .loopbar.off {
    background: color-mix(in oklch, var(--text) 12%, transparent);
    border-color: color-mix(in oklch, var(--text) 45%, transparent);
  }
  .lh {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 16px;
    cursor: ew-resize;
    touch-action: none;
  }
  .lh.a { left: -8px; }
  .lh.b { right: -8px; }
  @media (pointer: coarse) {
    .lh { width: 32px; }
    .lh.a { left: -16px; }
    .lh.b { right: -16px; }
  }
  .loopband {
    position: absolute;
    bottom: 0;
    z-index: 1;
    background: color-mix(in oklch, var(--blue) 9%, transparent);
    border-inline: 2px solid color-mix(in oklch, var(--blue) 70%, transparent);
    pointer-events: none;
  }
  .loopband.off {
    background: none;
    border-inline: 2px dashed color-mix(in oklch, var(--text) 30%, transparent);
  }
  .cap {
    position: absolute;
    left: var(--head-w);
    bottom: -2px;
    z-index: 2;
    width: 14px;
    height: 12px;
    margin-left: -7px;
    background: var(--text);
    clip-path: polygon(0 0, 100% 0, 50% 100%);
    pointer-events: none;
    will-change: transform;
  }
  /* rows are separated by an engraved groove, like channels on a panel */
  .row {
    display: flex;
    height: var(--lane-h);
    border-bottom: 1px solid var(--groove-d);
    box-shadow: 0 1px 0 var(--groove-l);
  }
  .head {
    position: sticky;
    left: 0;
    z-index: 5;
    flex: none;
    width: var(--head-w);
    padding: 8px 12px 8px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: var(--bg);
    border-right: var(--line-w) solid var(--line);
  }
  /* the "+ Track" row: always the last one, never coloured like a track */
  .row.add {
    height: 68px;
    border-bottom: 0;
  }
  .row.add .head {
    justify-content: center;
    align-items: flex-start;
  }
  .row.add .head::before {
    display: none;
  }
  .row.add .lane {
    background-image: none;
  }
  /* an open menu must sit above the heads of the rows below it */
  .head:has(:global(.pop)) {
    z-index: 7;
  }
  .head::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 6px;
    background: var(--c, var(--tomato));
    border-right: var(--line-w) solid var(--line);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  /* the channel number, printed on the panel */
  .num {
    flex: none;
    min-width: 1ch;
    font-size: var(--t-16);
    font-weight: 700;
    line-height: 1;
    color: var(--text);
  }
  .num.rec-dot {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    background: var(--tomato);
    color: var(--on-tomato);
    border: var(--line-w) solid var(--line);
    border-radius: 7px;
  }
  /* the name: marker on a strip of tape in the track's colour (.tape in base.css) */
  .tname {
    flex: 1;
    min-width: 0;
    width: 100%;
    text-overflow: ellipsis;
    cursor: text;
  }
  @media (hover: hover) {
    .row:not(.muted) .tname:hover:not(:focus) {
      filter: brightness(1.06);
    }
  }
  .tname.as-text {
    font-weight: var(--w-bold);
    font-size: var(--t-14);
    white-space: nowrap;
    overflow: hidden;
  }
  .btns {
    display: flex;
    gap: 6px;
  }
  .btns :global(.key.on) {
    --fill: var(--tomato);
    --ink: var(--on-tomato);
  }
  .btns :global(.key[aria-label^='Mute'].on),
  .btns :global(.key[aria-label^='Unmute'].on) {
    --fill: var(--text);
    --ink: var(--bg);
  }
  .row.target .head {
    background: color-mix(in oklch, var(--bg), var(--tomato) 14%);
  }
  /* LED meter: green is fine, amber is hot, tomato is too loud */
  .meter {
    position: absolute;
    right: 3px;
    top: 8px;
    bottom: 8px;
    width: 5px;
    border-radius: 2px;
    background: var(--knob);
    overflow: hidden;
  }
  .meter i {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, var(--led-green) 0 70%, var(--led-amber) 70% 90%, var(--tomato) 90%);
    -webkit-mask: repeating-linear-gradient(to top, #000 0 4px, transparent 4px 6px);
    mask: repeating-linear-gradient(to top, #000 0 4px, transparent 4px 6px);
    clip-path: inset(calc((1 - var(--lvl, 0)) * 100%) 0 0 0);
  }
  .lane {
    position: relative;
    z-index: 2;
    flex: none;
    width: var(--lane-w);
    background-image: linear-gradient(90deg, var(--grid-bar) 0 2px, transparent 2px), linear-gradient(90deg, var(--grid) 0 1px, transparent 1px);
    background-size: var(--bar) 100%, var(--beat) 100%;
  }
  /* a clip being dragged to another track must pass over the lanes below */
  .lane:has(:global(.clip.dragging)) {
    z-index: 3;
  }
  /* a muted track's tape loses its colour: grey means silent */
  .row.muted .tname:not(:focus) {
    filter: grayscale(1);
  }
  .row.muted .lane :global(.clip) {
    opacity: 0.4;
  }
  .empty {
    position: sticky;
    left: 0;
    display: grid;
    place-items: center;
    padding: var(--s-7) var(--s-5);
    text-align: center;
    color: var(--text-2);
  }
  /* the hint is a paper note held on with two bits of tape */
  .notepaper {
    position: relative;
    padding: var(--s-4) var(--s-5) var(--s-4);
    font-family: var(--font-hand);
    font-size: var(--t-16);
    line-height: 1.5;
    color: var(--on-track);
    background: var(--note);
    box-shadow: 2px 3px 0 oklch(0 0 0 / 0.18);
    transform: rotate(-1.5deg);
  }
  .notepaper::before,
  .notepaper::after {
    content: '';
    position: absolute;
    top: -9px;
    width: 46px;
    height: 18px;
    background: color-mix(in oklab, var(--tape) 82%, transparent);
    clip-path: polygon(0 14%, 2px 0, calc(100% - 3px) 0, 100% 20%, calc(100% - 2px) 60%, 100% 100%, 3px 100%, 0 70%, 2px 40%);
  }
  .notepaper::before {
    left: 14px;
    transform: rotate(-7deg);
  }
  .notepaper::after {
    right: 14px;
    transform: rotate(5deg);
  }
  .empty b {
    font-size: var(--t-20);
    font-weight: 400;
    color: var(--on-track);
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--head-w);
    width: 2px;
    margin-left: -1px;
    background: var(--text);
    z-index: 4;
    pointer-events: none;
    will-change: transform;
  }
  .rec .playhead,
  .rec .cap {
    background: var(--tomato);
  }
  @media (max-width: 699px) {
    .head {
      padding: 6px 8px 6px 12px;
    }
    .btns :global(.key.sm) {
      --h: 40px;
    }
    .corner :global(.key) {
      --h: 36px;
    }
  }
</style>

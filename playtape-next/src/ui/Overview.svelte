<!-- The whole song in one thin strip: where you are, and a place to tap to
     jump, while the timeline is out of sight in the Mix view. -->
<script lang="ts">
  import { transport } from '../audio/transport';
  import { onFrame } from '../lib/raf';
  import { clipDur, songDuration } from '../model/types';
  import { app, loopValid, seek } from '../state.svelte';

  const song = $derived(app.song!);
  const dur = $derived(Math.max(4, songDuration(song), loopValid(song) ? song.loop.b : 0));
  let box: HTMLDivElement | undefined = $state();
  let head: HTMLSpanElement | undefined = $state();
  let down = false;

  $effect(() =>
    onFrame(() => {
      if (head) head.style.left = `${Math.min(100, (transport.position() / dur) * 100)}%`;
    }),
  );

  function at(e: PointerEvent): number {
    const r = box!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="ov"
  bind:this={box}
  title="Tap to jump"
  onpointerdown={(e) => { if (app.recording) return; down = true; try { box!.setPointerCapture(e.pointerId); } catch { /* fine */ } seek(at(e)); }}
  onpointermove={(e) => { if (down && !transport.playing) seek(at(e)); }}
  onpointerup={(e) => { if (down && transport.playing) seek(at(e)); down = false; }}
  onpointercancel={() => (down = false)}
>
  {#each song.tracks as t (t.id)}
    <div class="r" style:--c="var(--tc-{t.color % 8})" class:muted={t.mute}>
      {#each t.clips as c (c.id)}
        <i style:left="{(c.offset / dur) * 100}%" style:width="{(clipDur(c) / dur) * 100}%"></i>
      {/each}
    </div>
  {/each}
  {#if loopValid(song)}
    <span class="loop" class:off={!song.loop.on} style:left="{(song.loop.a / dur) * 100}%" style:width="{((song.loop.b - song.loop.a) / dur) * 100}%"></span>
  {/if}
  <span class="ph" bind:this={head}></span>
</div>

<style>
  .ov {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-height: 40px;
    padding: 6px 0;
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    overflow: hidden;
    cursor: pointer;
    touch-action: none;
  }
  .r {
    position: relative;
    height: 6px;
    flex: none;
  }
  .r i {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 2px;
    background: var(--c);
    border-radius: 2px;
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--line) 55%, transparent);
  }
  .r.muted i {
    opacity: 0.35;
  }
  .loop {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in oklch, var(--blue) 16%, transparent);
    border-inline: 2px solid var(--blue);
    pointer-events: none;
  }
  .loop.off {
    background: none;
    border-inline: 2px dashed color-mix(in oklch, var(--text) 35%, transparent);
  }
  .ph {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--text);
    pointer-events: none;
  }
</style>

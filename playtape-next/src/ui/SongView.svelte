<!-- A song: top bar, one of two views (Capture or Mix), then the instrument
     panel (when Keys or Drums is the source) and the transport dock. -->
<script lang="ts">
  import {
    app, closeSong, deleteSelectedClip, duplicateSelected, loopSelected, renameSong, revoiceSelected, selectedClip, splitSelected, stepTake,
  } from '../state.svelte';
  import { engine } from '../audio/engine';
  import { PRESET_ORDER, PRESETS } from '../audio/synth';
  import { transport } from '../audio/transport';
  import { onFrame } from '../lib/raf';
  import { clipDur } from '../model/types';
  import DrumsPanel from './DrumsPanel.svelte';
  import Icon from './Icon.svelte';
  import Key from './Key.svelte';
  import KeysPanel from './KeysPanel.svelte';
  import Menu from './Menu.svelte';
  import MixView from './MixView.svelte';
  import PedalsPanel from './PedalsPanel.svelte';
  import { openSheet } from '../tools.svelte';
  import Timeline from './Timeline.svelte';
  import TransportDock from './TransportDock.svelte';

  const song = $derived(app.song!);
  /** 0 = not counting in, else the beat number 1..4. */
  let count = $state(0);
  let bottom: HTMLDivElement | undefined = $state();

  $effect(() =>
    onFrame(() => {
      let n = 0;
      if (transport.countingIn) {
        const now = engine.now;
        for (const t of transport.countInBeats) if (now >= t) n++;
      }
      if (n !== count) count = n;
    }),
  );

  // Tell the toasts how tall the bottom area is so they sit above it.
  $effect(() => {
    const el = bottom;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--dock-h'); };
  });

  const sel = $derived(app.selected ? selectedClip() : null);
</script>

<div class="song" class:rec={app.recording} style:--song-c="var(--tc-{song.color % 8})">
  <header class="bar">
    <Key icon="back" label="Back to Library" onclick={() => void closeSong()} />
    <div class="title-wrap">
      <span class="swatch"></span>
      <input
        class="title"
        value={song.name}
        aria-label="Song name"
        onchange={(e) => { renameSong(e.currentTarget.value); e.currentTarget.value = song.name; }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
      />
      <span class="saved" class:err={app.saveState === 'error'} role="status">
        {#if app.saveState === 'error'}<Icon name="warning" size={14} /> Not saved{:else if app.saveState === 'saving'}Saving…{:else}<Icon name="check" size={14} /> <span class="wide">Saved</span>{/if}
      </span>
    </div>
    <div class="seg" role="tablist" aria-label="View">
      <button role="tab" aria-selected={app.view === 'capture'} onclick={() => (app.view = 'capture')}><Icon name="waveform" size={18} /><span class="wide">Capture</span></button>
      <button role="tab" aria-selected={app.view === 'mix'} onclick={() => (app.view = 'mix')}><Icon name="faders" size={18} /><span class="wide">Mix</span></button>
    </div>
    <Key icon="share" tone="blue" label="Share or export this song" onclick={() => openSheet('share')}><span class="wide">Share</span></Key>
    <Key icon="gear" label="Settings" onclick={() => openSheet('settings')} />
  </header>

  <div class="main">
    {#if app.view === 'capture'}
      <Timeline />
    {:else}
      <MixView />
    {/if}

    {#if sel && app.view === 'capture' && !app.recording}
      {@const c = sel.clip}
      <div class="clipbar" role="toolbar" aria-label="Selected clip">
        <span class="len mono">{clipDur(c).toFixed(1)}s</span>
        {#if c.takes}
          <span class="takes">
            <Key icon="back" size="sm" tone="plain" label="Previous take" onclick={() => stepTake(-1)} />
            <span class="mono">Take {(c.take ?? c.takes.length - 1) + 1}/{c.takes.length}</span>
            <Key icon="forward" size="sm" tone="plain" label="Next take (T)" onclick={() => stepTake(1)} />
          </span>
        {/if}
        {#if c.midi}
          <Menu
            size="sm"
            tone="surface"
            icon="piano"
            text={PRESETS[c.midi.preset]?.label ?? 'Sound'}
            label="Change this clip's sound"
            up
            align="start"
            items={PRESET_ORDER.map((id) => ({ label: PRESETS[id].label, checked: c.midi?.preset === id, run: () => void revoiceSelected(id) }))}
          />
        {/if}
        <Key icon="scissors" size="sm" onclick={splitSelected} label="Split at the playhead (S)"><span class="wide">Split</span></Key>
        <Key icon="copy" size="sm" onclick={duplicateSelected} label="Duplicate (Ctrl+D)"><span class="wide">Duplicate</span></Key>
        <Key icon="loop" size="sm" onclick={loopSelected} label="Loop this clip"><span class="wide">Loop this</span></Key>
        <Key icon="trash" size="sm" onclick={deleteSelectedClip} label="Delete clip (Delete)"><span class="wide">Delete</span></Key>
        <Key icon="close" size="sm" tone="plain" label="Deselect (Esc)" onclick={() => (app.selected = null)} />
      </div>
    {/if}

    {#if count > 0}
      {#key count}
        <div class="countin mono" aria-live="assertive">{count}</div>
      {/key}
    {/if}
  </div>

  <div class="bottom" bind:this={bottom}>
    {#if app.view === 'mix' && app.fxTrack != null}
      <PedalsPanel />
    {:else if app.source === 'keys'}
      <KeysPanel />
    {:else if app.source === 'drums'}
      <DrumsPanel />
    {/if}
    <TransportDock />
  </div>
</div>

<style>
  .song {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .bar {
    flex: none;
    position: relative;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: calc(var(--s-2) + env(safe-area-inset-top)) var(--s-3) var(--s-2);
    background: var(--bg);
    border-bottom: var(--line-w) solid var(--line);
  }
  .title-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }
  .swatch {
    flex: none;
    width: 14px;
    height: 28px;
    background: var(--song-c);
    border: var(--line-w) solid var(--line);
    border-radius: 5px;
  }
  .title {
    flex: 0 1 auto;
    min-width: 0;
    width: 100%;
    max-width: 420px;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    font-size: var(--t-16);
    font-weight: var(--w-black);
    text-overflow: ellipsis;
  }
  .title:hover {
    background: color-mix(in oklch, var(--text) 8%, transparent);
  }
  .title:focus {
    background: var(--surface);
    outline: 2px solid var(--blue);
  }
  .saved {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    color: var(--text-2);
    white-space: nowrap;
  }
  .saved.err {
    color: var(--tomato-text);
  }
  .seg {
    flex: none;
    display: flex;
    padding: 3px;
    gap: 3px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    background: var(--surface);
  }
  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    font-size: var(--t-14);
    font-weight: var(--w-bold);
  }
  .seg button[aria-selected='true'] {
    background: var(--blue);
    color: var(--on-blue);
  }
  .seg button:not([aria-selected='true']):hover {
    background: color-mix(in oklch, var(--text) 10%, transparent);
  }
  .main {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* The panel above the transport gives way (and scrolls) before the screen runs out. */
  .bottom {
    flex: none;
    position: relative;
    z-index: 20;
    display: flex;
    flex-direction: column;
    max-height: calc(100% - 104px);
  }
  .bottom > :global(.panel) {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .clipbar {
    position: absolute;
    left: 50%;
    bottom: var(--s-3);
    transform: translateX(-50%);
    z-index: 25;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    max-width: calc(100% - 2 * var(--s-2));
    padding: var(--s-2);
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
    font-size: var(--t-14);
    font-weight: 600;
    white-space: nowrap;
  }
  .len {
    padding: 0 var(--s-1) 0 var(--s-2);
    color: var(--text-2);
  }
  .takes {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 2px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    background: var(--bg);
  }
  .takes :global(.key) {
    --h: 32px;
  }
  .countin {
    position: absolute;
    left: 50%;
    top: 42%;
    z-index: 40;
    display: grid;
    place-items: center;
    width: 168px;
    height: 168px;
    margin: -84px 0 0 -84px;
    font-size: 6rem;
    font-weight: 700;
    color: var(--on-tomato);
    background: var(--tomato);
    border: 4px solid var(--line);
    border-radius: 50%;
    box-shadow: 6px 6px 0 var(--shadow);
    pointer-events: none;
    animation: pop 0.32s var(--spring) both;
  }
  @keyframes pop {
    from { transform: scale(0.6); }
    to { transform: scale(1); }
  }
  @media (max-width: 899px) {
    .clipbar .wide {
      display: none;
    }
  }
  @media (max-width: 699px) {
    .wide {
      display: none;
    }
    /* every pixel here goes to the song's name */
    .bar {
      gap: 6px;
      padding-inline: var(--s-2);
    }
    .seg button {
      padding: 0 7px;
      height: 36px;
    }
    .swatch,
    .saved:not(.err) {
      display: none;
    }
    .title {
      padding: 6px 4px;
    }
    .clipbar {
      gap: 4px;
      padding: 6px;
    }
    .clipbar :global(.key.sm) {
      --h: 40px;
      padding: 0;
      width: 40px;
    }
    .len {
      display: none;
    }
  }
  /* A phone on its side: height is what is scarce. */
  @media (orientation: landscape) and (max-height: 520px) {
    .bar {
      padding-block: calc(4px + env(safe-area-inset-top)) 4px;
    }
    .bar :global(.key) {
      --h: 38px;
    }
    .seg button {
      height: 30px;
    }
    .title {
      padding-block: 3px;
    }
    .bottom {
      max-height: calc(100% - 84px);
    }
    .countin {
      width: 120px;
      height: 120px;
      margin: -60px 0 0 -60px;
      font-size: 4rem;
    }
    .clipbar {
      bottom: 6px;
      padding: 5px;
    }
  }
</style>

<!-- Transport, anchored at the bottom where thumbs are. A status row (the
     counter, tempo, loop, what Record records) and the keys: three tape keys
     in a well with Record the widest, then the round function keys. Every key
     has its name printed above it, and Play and Record have a light. -->
<script lang="ts">
  import {
    app, catchThat, fmtTime, loopValid, redo, rewind, setBpm, setClick, setSource, toggleLoop, toggleRecord, togglePlay, undo,
    type Source,
  } from '../state.svelte';
  import { recorder } from '../audio/recorder';
  import { transport } from '../audio/transport';
  import { onFrame } from '../lib/raf';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import Key from './Key.svelte';

  let timeEl: HTMLSpanElement | undefined = $state();
  let barEl: HTMLSpanElement | undefined = $state();
  let levelEl: HTMLElement | undefined = $state();
  let tempoOpen = $state(false);
  let tempoBox: HTMLDivElement | undefined = $state();
  let clipLight = $state(false);
  let shown = 0;
  let lastText = '';

  const song = $derived(app.song!);
  const loopOn = $derived(song.loop.on && loopValid(song));
  const sources: { id: Source; icon: IconName; label: string }[] = [
    { id: 'mic', icon: 'microphone', label: 'Mic' },
    { id: 'keys', icon: 'piano', label: 'Keys' },
    { id: 'drums', icon: 'drum', label: 'Drums' },
  ];
  const recLabel = $derived(
    app.recording ? 'Stop recording (R)'
    : app.source === 'drums' ? 'Add the drum pattern to the song (R)'
    : loopOn ? `Record ${app.source === 'keys' ? 'Keys' : ''} into the loop (R)`
    : `Record ${app.source === 'keys' ? 'Keys ' : ''}(R)`,
  );

  $effect(() =>
    onFrame(() => {
      const pos = transport.position();
      const txt = fmtTime(pos);
      if (txt !== lastText && timeEl) {
        timeEl.textContent = txt;
        lastText = txt;
        const beat = Math.floor(pos / (60 / song.bpm));
        if (barEl) barEl.textContent = `${Math.floor(beat / 4) + 1}.${(beat % 4) + 1}`;
      }
      // peak meter with a fall-back so it reads as a level, not a flicker
      shown = Math.max(recorder.level, shown * 0.9);
      recorder.level = 0;
      if (levelEl) levelEl.style.transform = `scaleX(${Math.min(1, Math.sqrt(shown)).toFixed(3)})`;
      if (recorder.clipped !== clipLight) clipLight = recorder.clipped;
    }),
  );

  /* tap tempo: average of the last few taps */
  let taps: number[] = [];
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  }

  function docDown(e: PointerEvent) {
    if (tempoOpen && tempoBox && !tempoBox.contains(e.target as Node)) tempoOpen = false;
  }
</script>

<svelte:document onpointerdown={docDown} />

<footer class="dock" class:rec={app.recording}>
  <div class="status">
    <div class="clock mono" aria-label="Position">
      <span class="time" bind:this={timeEl}>00:00.0</span>
      <span class="bar" bind:this={barEl}>1.1</span>
    </div>

    <div class="tempo" bind:this={tempoBox}>
      <button class="chip mono" aria-haspopup="dialog" aria-expanded={tempoOpen} aria-label="Tempo, {song.bpm} beats per minute" onclick={() => (tempoOpen = !tempoOpen)}>
        <b>{song.bpm}</b><span class="unit">bpm</span>
      </button>
      {#if tempoOpen}
        <div class="pop" role="dialog" aria-label="Tempo">
          <Key icon="minus" label="Slower" size="sm" onclick={() => setBpm(song.bpm - 1)} />
          <input
            class="bpm mono"
            type="number"
            min="40"
            max="240"
            value={song.bpm}
            aria-label="Beats per minute"
            onchange={(e) => { setBpm(parseInt(e.currentTarget.value, 10) || song.bpm); e.currentTarget.value = String(song.bpm); }}
          />
          <Key icon="plus" label="Faster" size="sm" onclick={() => setBpm(song.bpm + 1)} />
          <Key icon="tap" tone="blue" onpointerdown={tap} label="Tap the tempo">Tap</Key>
        </div>
      {/if}
    </div>

    <button class="chip toggle" class:on={loopOn} aria-pressed={loopOn} aria-label={loopOn ? 'Loop on (L)' : 'Loop off (L)'} title={loopOn ? 'Loop on: Record redoes just this part (L)' : 'Loop (L)'} onclick={toggleLoop} disabled={app.recording}>
      <Icon name="loop" size={18} /><span class="wide">Loop</span>
    </button>

    <div class="seg" role="radiogroup" aria-label="What Record records">
      {#each sources as s}
        <button
          role="radio"
          aria-checked={app.source === s.id}
          aria-label={s.label}
          title={s.id === 'mic' && clipLight ? 'The input clipped on the last take' : s.label}
          class:clip={s.id === 'mic' && clipLight}
          disabled={app.recording}
          onclick={() => setSource(s.id)}
        >
          <Icon name={s.icon} size={18} />
          {#if s.id === 'mic'}
            <span class="lvl" class:dead={app.mic === 'off'}><i bind:this={levelEl}></i></span>
          {:else}
            <span class="wide">{s.label}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="keys">
    <div class="deck" role="group" aria-label="Tape keys">
      <div class="kcol">
        <span class="silk cap" aria-hidden="true">Start</span>
        <button class="tkey" aria-label="Back to start (Home)" title="Back to start (Home)" onclick={rewind} disabled={app.recording}>
          <Icon name="skipBack" size={24} />
        </button>
      </div>
      <div class="kcol">
        <span class="silk cap" aria-hidden="true"><i class="led" class:lit={app.playing && !app.recording}></i>Play</span>
        <button class="tkey play" aria-label={app.playing ? 'Stop (Space)' : 'Play (Space)'} title={app.playing ? 'Stop (Space)' : 'Play (Space)'} onclick={() => void togglePlay()} disabled={app.recording}>
          <Icon name={app.playing && !app.recording ? 'pause' : 'play'} size={28} />
        </button>
      </div>
      <div class="kcol">
        <span class="silk cap" aria-hidden="true"><i class="led" class:lit={app.recording} style:--led="var(--tomato)"></i>{app.source === 'drums' && !app.recording ? 'Add' : 'Record'}</span>
        <button class="tkey rec-key" class:on={app.recording} class:add={app.source === 'drums' && !app.recording} aria-label={recLabel} title={recLabel} aria-pressed={app.recording} onclick={toggleRecord}>
          {#if app.source === 'drums' && !app.recording}<Icon name="plus" size={30} />{:else}<span class="glyph"></span>{/if}
        </button>
      </div>
    </div>
    <div class="kcol">
      <span class="silk cap" aria-hidden="true">Undo</span>
      <Key icon="undo" label="Undo (Ctrl+Z)" round onclick={undo} disabled={!app.canUndo || app.recording} />
    </div>
    <div class="kcol desk">
      <span class="silk cap" aria-hidden="true">Redo</span>
      <Key icon="redo" label="Redo (Ctrl+Shift+Z)" round onclick={redo} disabled={!app.canRedo || app.recording} />
    </div>
    <div class="kcol">
      <span class="silk cap" aria-hidden="true"><i class="led" class:lit={app.click} style:--led="var(--led-amber)"></i>Click</span>
      <Key icon="metronome" label={app.click ? 'Click on: count-in before recording (C)' : 'Click off (C)'} round pressed={app.click} onclick={() => setClick(!app.click)} />
    </div>
    {#if app.catchOn}
      <div class="kcol">
        <span class="silk cap" aria-hidden="true">Catch</span>
        <Key icon="catchBack" label="Catch that! Keep the last 30 seconds you played" round onclick={() => void catchThat()} disabled={app.recording || app.mic === 'off'} />
      </div>
    {/if}
  </div>
</footer>

<style>
  .dock {
    position: relative;
    z-index: 20;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--s-3) var(--s-6);
    padding: var(--s-3) var(--s-4) calc(var(--s-3) + env(safe-area-inset-bottom));
    background: var(--bg);
    border-top: var(--line-w) solid var(--line);
    box-shadow: inset 0 1px 0 var(--groove-l);
  }
  .dock.rec {
    background: color-mix(in oklch, var(--bg), var(--tomato) 16%);
  }
  .status {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    min-width: 0;
  }
  /* the counter: a grey-green LCD set into the panel */
  .clock {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 12px 4px;
    background: var(--lcd);
    color: var(--on-lcd);
    border: var(--line-w) solid var(--line);
    border-radius: 8px;
    box-shadow: inset 0 3px 0 oklch(0 0 0 / 0.14);
  }
  .time {
    font-size: var(--t-20);
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .rec .clock {
    background: var(--tomato);
    color: var(--on-tomato);
  }
  .bar {
    font-size: var(--t-12);
    font-weight: 700;
    opacity: 0.75;
    min-width: 3ch;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 12px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-full);
    background: var(--surface);
    font-size: var(--t-14);
    font-weight: var(--w-bold);
    white-space: nowrap;
  }
  .chip b {
    font-weight: 700;
  }
  .chip:hover:not(:disabled) {
    background: color-mix(in oklch, var(--surface), var(--blue) 14%);
  }
  .chip.on {
    background: var(--blue);
    color: var(--on-blue);
  }
  .chip:disabled {
    opacity: 0.4;
  }
  .tempo {
    position: relative;
  }
  .pop {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3);
    background: var(--surface);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
    z-index: 30;
  }
  .bpm {
    width: 68px;
    height: 36px;
    text-align: center;
    font-weight: 700;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    background: var(--bg);
  }
  .seg {
    display: flex;
    padding: 2px;
    gap: 2px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-full);
    background: var(--surface);
  }
  .seg button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 40px;
    height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-full);
    background: transparent;
    font-size: var(--t-14);
    font-weight: var(--w-bold);
  }
  .seg button[aria-checked='true'] {
    background: var(--text);
    color: var(--bg);
  }
  .seg button:not([aria-checked='true']):hover:not(:disabled) {
    background: color-mix(in oklch, var(--text) 10%, transparent);
  }
  .seg button:disabled {
    opacity: 0.5;
  }
  .lvl {
    position: relative;
    width: 36px;
    height: 8px;
    border-radius: 4px;
    background: color-mix(in oklch, currentColor 22%, transparent);
    overflow: hidden;
  }
  .lvl i {
    position: absolute;
    inset: 0;
    background: currentColor;
    transform-origin: left;
    transform: scaleX(0);
  }
  .lvl.dead {
    opacity: 0.4;
  }
  .seg button.clip {
    color: var(--tomato-text);
  }
  .seg button.clip[aria-checked='true'] {
    background: var(--tomato);
    color: var(--on-tomato);
  }
  .keys {
    display: flex;
    align-items: flex-end;
    gap: var(--s-3);
  }
  /* a key with its name printed above it */
  .kcol {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }
  /* centred on its key and never wider than it as far as layout goes */
  .cap {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 0;
    line-height: 1;
    white-space: nowrap;
  }
  .cap .led {
    width: 8px;
    height: 8px;
  }
  /* the round function keys are olive rubber, like the tape keys */
  .keys :global(.key:not(.on)) {
    --fill: var(--olive);
    --ink: var(--on-olive);
  }
  /* The three tape keys sit together in a dark well. */
  .deck {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 7px 8px 8px;
    margin-right: var(--s-1);
    background: var(--knob);
    border: var(--line-w) solid var(--line);
    border-radius: 14px;
  }
  .deck .cap {
    color: oklch(0.9 0.01 85);
  }
  .tkey {
    position: relative;
    display: grid;
    place-items: center;
    width: 58px;
    height: 52px;
    flex: none;
    border: var(--line-w) solid var(--line);
    border-radius: 9px;
    background: var(--olive);
    color: var(--on-olive);
    /* the front face of the key */
    box-shadow: inset 0 -6px 0 oklch(0 0 0 / 0.22);
    transition: transform 0.2s var(--spring), box-shadow 0.2s var(--spring), background-color 0.15s;
  }
  .tkey.play {
    width: 70px;
  }
  .tkey :global(svg) {
    transform: translateY(-3px);
  }
  @media (hover: hover) {
    .tkey:hover:not(:disabled) {
      background: color-mix(in oklab, var(--olive), white 14%);
    }
  }
  .tkey:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: inset 0 -2px 0 oklch(0 0 0 / 0.22);
    transition-duration: 0.04s;
  }
  .tkey:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .tkey.rec-key {
    width: 92px;
    background: var(--tomato);
    color: var(--on-tomato);
  }
  /* Adding drums is not recording, so the key is not tomato. */
  .rec-key.add {
    background: var(--blue);
    color: var(--on-blue);
  }
  .tkey.rec-key :global(svg) {
    transform: translateY(-3px);
  }
  .glyph {
    width: 26px;
    height: 26px;
    margin-top: -6px;
    border-radius: 50%;
    background: oklch(0.99 0.008 85);
    border: 3px solid var(--line);
    transition: border-radius 0.2s var(--ease-out), transform 0.2s var(--ease-out);
  }
  .rec-key.on .glyph {
    border-radius: 6px;
    transform: scale(0.86);
  }
  .rec-key.on::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 11px;
    border: 3px solid var(--tomato);
    animation: ring 1.2s ease-out infinite;
  }
  @media (hover: hover) {
    .tkey.rec-key:hover:not(:disabled) {
      background: color-mix(in oklab, var(--tomato), white 12%);
    }
  }
  @keyframes ring {
    from { transform: scale(1); opacity: 0.9; }
    to { transform: scale(1.25, 1.4); opacity: 0; }
  }
  @media (max-width: 699px) {
    .dock {
      flex-direction: column;
      gap: var(--s-2);
      padding: var(--s-2) var(--s-3) calc(var(--s-2) + env(safe-area-inset-bottom));
    }
    .status {
      width: 100%;
      justify-content: space-between;
      gap: 6px;
    }
    .desk,
    .wide,
    .bar,
    .unit {
      display: none;
    }
    .time {
      font-size: var(--t-16);
    }
    .clock {
      padding: 8px 10px;
    }
    .chip {
      padding: 0 10px;
    }
    .seg button {
      min-width: 44px;
      height: 36px;
    }
    .lvl {
      width: 22px;
    }
    .keys {
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .deck {
      gap: 5px;
      padding: 6px 6px 7px;
      margin-right: 0;
    }
    .cap {
      letter-spacing: 0.02em;
      gap: 3px;
    }
    .tkey {
      width: 44px;
      height: 48px;
    }
    .tkey.play {
      width: 54px;
    }
    .tkey.rec-key {
      width: 74px;
    }
  }
</style>

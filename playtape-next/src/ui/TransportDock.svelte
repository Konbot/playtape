<!-- Transport, anchored at the bottom where thumbs are. A status row (time,
     tempo, loop, what Record records) and a row of keys with Record the largest. -->
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
    <Key icon="skipBack" label="Back to start (Home)" round onclick={rewind} disabled={app.recording} />
    <Key icon={app.playing && !app.recording ? 'pause' : 'play'} label={app.playing ? 'Stop (Space)' : 'Play (Space)'} size="lg" round onclick={() => void togglePlay()} disabled={app.recording} />
    <button class="rec-key" class:on={app.recording} class:add={app.source === 'drums' && !app.recording} aria-label={recLabel} title={recLabel} aria-pressed={app.recording} onclick={toggleRecord}>
      {#if app.source === 'drums' && !app.recording}<Icon name="plus" size={30} />{:else}<span class="glyph"></span>{/if}
    </button>
    <Key icon="undo" label="Undo (Ctrl+Z)" round onclick={undo} disabled={!app.canUndo || app.recording} />
    <span class="desk"><Key icon="redo" label="Redo (Ctrl+Shift+Z)" round onclick={redo} disabled={!app.canRedo || app.recording} /></span>
    <Key icon="metronome" label={app.click ? 'Click on: count-in before recording (C)' : 'Click off (C)'} round pressed={app.click} onclick={() => setClick(!app.click)} />
    {#if app.catchOn}
      <Key icon="catchBack" label="Catch that! Keep the last 30 seconds you played" round onclick={() => void catchThat()} disabled={app.recording || app.mic === 'off'} />
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
  .clock {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 12px;
    background: var(--text);
    color: var(--bg);
    border-radius: var(--r-sm);
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
    opacity: 0.7;
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
    align-items: center;
    gap: var(--s-3);
  }
  .rec-key {
    position: relative;
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    flex: none;
    margin: 0 var(--s-1);
    border-radius: 50%;
    border: 3px solid var(--line);
    background: var(--tomato);
    color: var(--on-tomato);
    box-shadow: 4px 4px 0 var(--shadow);
    transition: transform 0.28s var(--spring), box-shadow 0.28s var(--spring), background-color 0.15s;
  }
  /* Adding drums is not recording, so the key is not tomato. */
  .rec-key.add {
    background: var(--blue);
    color: var(--on-blue);
  }
  .glyph {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: oklch(0.99 0.008 85);
    border: 3px solid var(--line);
    transition: border-radius 0.2s var(--ease-out), transform 0.2s var(--ease-out);
  }
  .rec-key.on .glyph {
    border-radius: 7px;
    transform: scale(0.86);
  }
  .rec-key.on::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 3px solid var(--tomato);
    animation: ring 1.2s ease-out infinite;
  }
  @media (hover: hover) {
    .rec-key:hover {
      transform: translate(-1px, -1px) scale(1.03);
      box-shadow: 5px 5px 0 var(--shadow);
    }
  }
  .rec-key:active {
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 var(--shadow);
    transition-duration: 0.04s;
  }
  @keyframes ring {
    from { transform: scale(1); opacity: 0.9; }
    to { transform: scale(1.45); opacity: 0; }
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
      gap: var(--s-2);
    }
  }
</style>

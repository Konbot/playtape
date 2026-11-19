<!-- Drums, docked above the transport. Tap steps to build a one-bar beat; it
     plays along with the song while this panel is open. The big key (or
     "Add to song") turns it into a track. -->
<script lang="ts">
  import { addDrumsToSong, app, beginEdit, endEdit, liveEdit, padHit, setPattern, setSource, toggleStep } from '../state.svelte';
  import { basicBeat, DRUM_LABELS, stepDur } from '../audio/drums';
  import { transport } from '../audio/transport';
  import { onFrame } from '../lib/raf';
  import { DRUM_VOICES, emptyPattern } from '../model/types';
  import Fader from './Fader.svelte';
  import Key from './Key.svelte';

  const song = $derived(app.song!);
  const pattern = $derived(song.drums?.pattern ?? emptyPattern());
  let winW = $state(window.innerWidth);
  const narrow = $derived(winW < 700);
  /** Phones show half a bar at a time so the steps stay finger-sized. */
  let page = $state(0);
  const steps = $derived(narrow ? Array.from({ length: 8 }, (_, i) => page * 8 + i) : Array.from({ length: 16 }, (_, i) => i));
  let now = $state(-1);

  $effect(() =>
    onFrame(() => {
      const s = transport.playing && !transport.countingIn ? Math.floor(transport.position() / stepDur(song.bpm) + 1e-6) % 16 : -1;
      if (s !== now) {
        now = s;
        if (narrow && s >= 0 && Math.floor(s / 8) !== page) page = Math.floor(s / 8);
      }
    }),
  );
</script>

<svelte:window bind:innerWidth={winW} />

<section class="panel" aria-label="Drums">
  <div class="top">
    <div class="pads">
      {#each DRUM_VOICES as v}
        <button class="pad" onpointerdown={() => padHit(v)} aria-label="Play {DRUM_LABELS[v]}">{DRUM_LABELS[v]}</button>
      {/each}
    </div>
    <div class="vol">
      <Fader
        label="Drum level"
        value={song.drums?.vol ?? 0.9}
        max={1.4}
        reset={0.9}
        onstart={() => beginEdit('Drum level')}
        oninput={(v) => { song.drums ??= { pattern: emptyPattern(), vol: 0.9 }; song.drums.vol = v; liveEdit(); }}
        onend={() => endEdit(false)}
      />
    </div>
    <Key size="sm" onclick={() => setPattern('Basic beat', basicBeat())}>Basic beat</Key>
    <Key size="sm" onclick={() => setPattern('Clear drums', emptyPattern())}>Clear</Key>
    <Key size="sm" tone="blue" icon="plus" onclick={() => void addDrumsToSong()} disabled={app.busy}>Add to song</Key>
    <Key icon="close" size="sm" tone="plain" label="Close Drums" onclick={() => setSource('mic')} />
  </div>

  <div class="grid" role="group" aria-label="Drum steps" style:--cols={steps.length}>
    {#each DRUM_VOICES as v}
      <div class="row">
        <span class="name">{DRUM_LABELS[v]}</span>
        {#each steps as i (i)}
          <button
            class="cell"
            class:on={pattern[v][i]}
            class:beat={i % 4 === 0}
            class:now={i === now}
            aria-pressed={pattern[v][i]}
            aria-label="{DRUM_LABELS[v]} step {i + 1}"
            onclick={() => toggleStep(v, i)}
          ></button>
        {/each}
      </div>
    {/each}
  </div>

  {#if narrow}
    <div class="pages" role="radiogroup" aria-label="Which half of the bar">
      <button role="radio" aria-checked={page === 0} onclick={() => (page = 0)}>Steps 1–8</button>
      <button role="radio" aria-checked={page === 1} onclick={() => (page = 1)}>Steps 9–16</button>
    </div>
  {/if}
</section>

<style>
  .panel {
    flex: none;
    padding: var(--s-2) var(--s-3) var(--s-3);
    background: var(--bg);
    border-top: var(--line-w) solid var(--line);
  }
  .top {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin: 0 auto var(--s-2);
    max-width: 980px;
    flex-wrap: wrap;
  }
  .pads {
    display: flex;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .pad {
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 6px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    background: var(--surface);
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    touch-action: manipulation;
  }
  .pad:active {
    background: var(--tc-4);
    color: var(--on-track);
    transform: translate(1px, 1px);
  }
  .vol {
    width: 110px;
    flex: none;
  }
  .vol :global(.fader) {
    height: 36px;
  }
  .grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 980px;
    margin: 0 auto;
    padding: var(--s-2);
    background: var(--bg-sunk);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
  }
  .row {
    display: grid;
    grid-template-columns: 52px repeat(var(--cols), 1fr);
    gap: 4px;
    align-items: center;
  }
  .name {
    font-size: var(--t-12);
    font-weight: var(--w-bold);
    color: var(--text-2);
  }
  .cell {
    height: 30px;
    padding: 0;
    border: var(--line-w) solid color-mix(in oklch, var(--line) 30%, transparent);
    border-radius: 8px;
    background: var(--surface);
    touch-action: manipulation;
  }
  .cell.beat {
    border-color: color-mix(in oklch, var(--line) 70%, transparent);
  }
  .cell.on {
    background: var(--tc-4);
    border-color: var(--line);
  }
  .cell.now {
    box-shadow: 0 0 0 2px var(--blue);
  }
  .pages {
    display: flex;
    gap: 2px;
    padding: 2px;
    margin-top: var(--s-2);
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-full);
    background: var(--surface);
  }
  .pages button {
    flex: 1;
    height: 32px;
    border: 0;
    border-radius: var(--r-full);
    background: transparent;
    font-size: var(--t-14);
    font-weight: var(--w-bold);
  }
  .pages button[aria-checked='true'] {
    background: var(--text);
    color: var(--bg);
  }
  @media (max-width: 699px) {
    .cell {
      height: 34px;
    }
    /* the level can wait for the Mix view; on a phone the steps need the room */
    .vol {
      display: none;
    }
    .pads {
      flex-basis: 100%;
    }
  }
</style>

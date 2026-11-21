<!-- Keys, docked above the transport (not a modal, so Play, Record and the
     shortcuts keep working). Play it here, on the computer keyboard or over
     MIDI; the main Record key captures it. -->
<script lang="ts">
  import { app, keyDown, keyUp, setKeysPreset, setSource, shiftOctave } from '../state.svelte';
  import { PRESET_ORDER, PRESETS } from '../audio/synth';
  import Key from './Key.svelte';

  const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  let winW = $state(window.innerWidth);
  const octaves = $derived(winW < 700 ? 1 : 2);

  const keys = $derived.by(() => {
    const whites: { midi: number; label: string | null; sharp: number | null }[] = [];
    const top = app.keysBase + octaves * 12;
    for (let m = app.keysBase; m <= top; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (SHARP[pc]) continue;
      const next = m + 1;
      whites.push({ midi: m, label: pc === 0 ? `C${Math.floor(m / 12) - 1}` : null, sharp: next <= top && SHARP[next % 12] ? next : null });
    }
    return whites;
  });

  /* Several fingers at once: each pointer holds its own note and can slide to the next key. */
  const pointers = new Map<number, number>();

  function hitTest(e: PointerEvent): { midi: number; vel: number } | null {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const midi = el?.dataset?.midi;
    if (midi == null) return null;
    const r = el!.getBoundingClientRect();
    // lower on the key is louder, like digging in
    return { midi: parseInt(midi, 10), vel: 0.45 + 0.55 * Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  function down(e: PointerEvent) {
    const hit = hitTest(e);
    if (!hit) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already gone: the drag still works without capture */ }
    pointers.set(e.pointerId, hit.midi);
    void keyDown(hit.midi, hit.vel);
  }
  function move(e: PointerEvent) {
    const cur = pointers.get(e.pointerId);
    if (cur == null) return;
    const hit = hitTest(e);
    if (!hit || hit.midi === cur) return;
    // New note first: on Stylo that makes it a slide instead of a re-attack.
    pointers.set(e.pointerId, hit.midi);
    void keyDown(hit.midi, hit.vel);
    keyUp(cur);
  }
  function up(e: PointerEvent) {
    const cur = pointers.get(e.pointerId);
    if (cur == null) return;
    pointers.delete(e.pointerId);
    keyUp(cur);
  }
</script>

<svelte:window bind:innerWidth={winW} />

<section class="panel" aria-label="Keys">
  <div class="top">
    <div class="presets" role="radiogroup" aria-label="Sound">
      {#each PRESET_ORDER as id}
        <button role="radio" aria-checked={app.keysPreset === id} onclick={() => setKeysPreset(id)}>{PRESETS[id].label}</button>
      {/each}
    </div>
    <div class="oct">
      <Key icon="minus" size="sm" label="Octave down (down arrow)" onclick={() => shiftOctave(-1)} disabled={app.keysBase <= 24} />
      <span class="mono">{NAMES[app.keysBase % 12]}{Math.floor(app.keysBase / 12) - 1}</span>
      <Key icon="plus" size="sm" label="Octave up (up arrow)" onclick={() => shiftOctave(1)} disabled={app.keysBase >= 84} />
    </div>
    <span class="hint">
      {#if app.midiDevices.length}MIDI: {app.midiDevices[0]} · {/if}Type Z–M and Q–I to play · Enter records
    </span>
    <Key icon="close" size="sm" tone="plain" label="Close Keys" onclick={() => setSource('mic')} />
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="bed" style:--n={keys.length} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
    {#each keys as k, i (k.midi)}
      <div class="white" class:held={app.held.includes(k.midi)} data-midi={k.midi}>
        {#if k.label}<span class="lbl mono">{k.label}</span>{/if}
      </div>
      {#if k.sharp != null}
        <div class="black" class:held={app.held.includes(k.sharp)} data-midi={k.sharp} style:--i={i}></div>
      {/if}
    {/each}
  </div>
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
    gap: var(--s-3);
    margin-bottom: var(--s-2);
  }
  .presets {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-full);
    background: var(--surface);
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }
  .presets button {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--r-full);
    background: transparent;
    font-size: var(--t-14);
    font-weight: var(--w-bold);
    white-space: nowrap;
  }
  .presets button[aria-checked='true'] {
    background: var(--blue);
    color: var(--on-blue);
  }
  .oct {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-14);
    font-weight: 700;
  }
  .oct span {
    min-width: 2.2ch;
    text-align: center;
  }
  .hint {
    flex: 1;
    min-width: 0;
    font-size: var(--t-12);
    color: var(--text-2);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bed {
    position: relative;
    display: flex;
    height: 132px;
    max-width: 980px;
    margin: 0 auto;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    background: var(--line);
    gap: 2px;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .white {
    position: relative;
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 6px;
    background: oklch(0.99 0.008 85);
    border-radius: 0 0 8px 8px;
    cursor: pointer;
  }
  .white.held {
    background: var(--blue);
  }
  .lbl {
    font-size: var(--t-12);
    font-weight: 600;
    color: oklch(0.44 0.04 270);
    pointer-events: none;
  }
  .white.held .lbl {
    color: var(--on-blue);
  }
  .black {
    position: absolute;
    top: 0;
    left: calc((var(--i) + 1) * 100% / var(--n) - 100% / var(--n) * 0.31);
    width: calc(100% / var(--n) * 0.62);
    height: 58%;
    background: oklch(0.22 0.045 270);
    border-radius: 0 0 7px 7px;
    z-index: 1;
    cursor: pointer;
  }
  .black.held {
    background: var(--blue);
  }
  @media (max-width: 699px) {
    .hint {
      display: none;
    }
    .top {
      gap: var(--s-2);
    }
    .presets {
      flex: 1;
    }
    .bed {
      height: 120px;
    }
  }
  @media (orientation: landscape) and (max-height: 520px) {
    .panel {
      padding-block: 4px 6px;
    }
    .hint {
      display: none;
    }
    .top {
      margin-bottom: 4px;
    }
    .bed {
      height: 96px;
    }
  }
</style>

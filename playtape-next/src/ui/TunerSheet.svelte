<!-- Tuner: the note you are playing, and how far off it is. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { recorder } from '../audio/recorder';
  import { autoCorrelate, describePitch } from '../audio/tuner';
  import { engine } from '../audio/engine';
  import { onFrame } from '../lib/raf';
  import { app } from '../state.svelte';
  import { closeSheet, turnMicOn } from '../tools.svelte';
  import Key from './Key.svelte';
  import Sheet from './Sheet.svelte';

  let note = $state('–');
  let cents = $state(0);
  let hz = $state(0);
  let heard = $state(false);
  let buf: Float32Array<ArrayBuffer> | null = null;
  let frame = 0;
  let quiet = 0;

  // Once, on opening: if the mic is refused this must not keep asking.
  onMount(() => {
    if (app.mic === 'off') void turnMicOn();
  });

  $effect(() =>
    onFrame(() => {
      if (++frame % 3) return; // 20 readings a second is plenty and keeps the needle calm
      const an = recorder.tunerAnalyser();
      if (!an || !engine.ctx) return;
      buf ??= new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      const f = autoCorrelate(buf, engine.ctx.sampleRate);
      if (f > 30 && f < 2000) {
        const p = describePitch(f);
        note = p.name;
        cents = p.cents;
        hz = f;
        heard = true;
        quiet = 0;
      } else if (++quiet > 12) heard = false;
    }),
  );

  const inTune = $derived(heard && Math.abs(cents) <= 5);
</script>

<Sheet title="Tuner" onclose={closeSheet}>
  {#if app.mic === 'off' || app.mic === 'starting'}
    <p class="hint">The tuner listens through the microphone.</p>
    <Key tone="blue" icon="microphone" onclick={() => void turnMicOn()}>Turn the mic on</Key>
  {:else}
    <div class="tuner" class:good={inTune} class:idle={!heard}>
      <div class="note mono" aria-live="polite">{heard ? note : '–'}</div>
      <div class="scale" aria-hidden="true">
        <span class="mid"></span>
        <span class="needle" style:left="{50 + Math.max(-50, Math.min(50, cents))}%"></span>
      </div>
      <div class="read mono">
        {#if heard}{cents === 0 ? 'in tune' : `${Math.abs(cents)} cents ${cents < 0 ? 'flat' : 'sharp'}`} · {hz.toFixed(1)} Hz{:else}play one note{/if}
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .hint {
    margin-bottom: var(--s-3);
    color: var(--text-2);
  }
  .tuner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-4) 0 var(--s-2);
  }
  .note {
    display: grid;
    place-items: center;
    min-width: 168px;
    height: 120px;
    padding: 0 var(--s-4);
    font-size: 4.5rem;
    font-weight: 700;
    background: var(--surface);
    border: 3px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: 4px 4px 0 var(--shadow);
  }
  .good .note {
    background: var(--tc-3);
    color: var(--on-track);
  }
  .idle .note {
    color: var(--text-2);
  }
  .scale {
    position: relative;
    width: 100%;
    height: 36px;
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-sm);
    background: var(--bg-sunk);
    overflow: hidden;
  }
  .mid {
    position: absolute;
    left: 45%;
    width: 10%;
    top: 0;
    bottom: 0;
    background: color-mix(in oklch, var(--tc-3) 55%, transparent);
    border-inline: var(--line-w) solid var(--line);
  }
  .needle {
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: 8px;
    margin-left: -4px;
    border-radius: 3px;
    background: var(--text);
    transition: left 0.08s linear;
  }
  .idle .needle {
    opacity: 0.25;
  }
  .read {
    font-size: var(--t-14);
    font-weight: 600;
    color: var(--text-2);
  }
</style>

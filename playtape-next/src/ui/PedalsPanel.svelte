<!-- A track's pedals, docked above the transport in the Mix view so you can
     keep playing while you turn things. Nothing is printed into the
     recording: pedals apply on playback and export. -->
<script lang="ts">
  import { app, beginEdit, endEdit, liveEdit, mutate } from '../state.svelte';
  import type { CabType, DelaySync, DriveType, Track, TrackParams } from '../model/types';
  import Key from './Key.svelte';
  import Knob from './Knob.svelte';
  import Seg from './Seg.svelte';
  import Switch from './Switch.svelte';

  const track = $derived(app.song?.tracks.find((t) => t.id === app.fxTrack) ?? null);

  function set(t: Track, key: keyof TrackParams, v: number) {
    (t as unknown as Record<string, number>)[key] = v;
    liveEdit();
  }
  function change<K extends keyof TrackParams>(t: Track, key: K, v: TrackParams[K], label: string) {
    mutate(label, () => { t[key] = v as Track[K]; }, { replan: false });
  }
</script>

{#snippet k(t: Track, key: keyof TrackParams, label: string, min: number, max: number, def: number, unit: string)}
  <Knob
    {label} {min} {max} {def} {unit} size={46}
    value={t[key] as number}
    onstart={() => beginEdit(`${label} on ${t.name}`)}
    oninput={(v) => set(t, key, v)}
    onend={() => endEdit(false)}
  />
{/snippet}

{#if track}
  {@const t = track}
  <section class="panel" aria-label="Pedals for {t.name}">
    <div class="top">
      <b>Pedals</b>
      <span class="for" style:--c="var(--tc-{t.color % 8})"><i></i>{t.name}</span>
      <span class="hint">Applied on playback and export, never printed into the recording.</span>
      <Key icon="close" size="sm" tone="plain" label="Close pedals" onclick={() => (app.fxTrack = null)} />
    </div>
    <div class="board">
      <div class="pedal" class:on={t.driveOn} style:--c="var(--tc-0)">
        <header><b>Drive</b><Switch on={t.driveOn} label="Drive on {t.name}" onchange={(v) => change(t, 'driveOn', v, `Drive ${v ? 'on' : 'off'}`)} /></header>
        <div class="kn">{@render k(t, 'drive', 'Gain', 0, 1, 0.4, '')}{@render k(t, 'driveLevel', 'Level', 0, 1.4, 0.8, '')}</div>
        <Seg size="sm" label="Drive type" value={t.driveType} onchange={(v: DriveType) => change(t, 'driveType', v, 'Drive type')} options={[{ value: 'clean', label: 'Clean' }, { value: 'crunch', label: 'Crunch' }, { value: 'fuzz', label: 'Fuzz' }]} />
      </div>

      <div class="pedal" class:on={t.cab !== 'off'} style:--c="var(--tc-3)">
        <header><b>Cabinet</b></header>
        <p>Makes a plugged-in guitar sound like it came out of a speaker.</p>
        <Seg size="sm" label="Speaker cabinet" value={t.cab} onchange={(v: CabType) => change(t, 'cab', v, 'Cabinet')} options={[{ value: 'off', label: 'Off' }, { value: '1x12', label: '1×12' }, { value: '4x12', label: '4×12' }]} />
      </div>

      <div class="pedal" class:on={t.delayOn} style:--c="var(--tc-1)">
        <header><b>Echo</b><Switch on={t.delayOn} label="Echo on {t.name}" onchange={(v) => change(t, 'delayOn', v, `Echo ${v ? 'on' : 'off'}`)} /></header>
        <div class="kn">{@render k(t, 'delayFb', 'Repeats', 0, 0.9, 0.3, '')}{@render k(t, 'delayMix', 'Mix', 0, 1, 0.25, '')}</div>
        <Seg size="sm" label="Echo time, in notes at the song tempo" value={t.delaySync} onchange={(v: DelaySync) => change(t, 'delaySync', v, 'Echo time')} options={[{ value: '1/4', label: '1/4' }, { value: '1/8.', label: '1/8.' }, { value: '1/8', label: '1/8' }, { value: '1/16', label: '1/16' }]} />
      </div>

      <div class="pedal" class:on={t.tremOn} style:--c="var(--tc-2)">
        <header><b>Tremolo</b><Switch on={t.tremOn} label="Tremolo on {t.name}" onchange={(v) => change(t, 'tremOn', v, `Tremolo ${v ? 'on' : 'off'}`)} /></header>
        <div class="kn">{@render k(t, 'tremRate', 'Speed', 1, 12, 5, ' Hz')}{@render k(t, 'tremDepth', 'Depth', 0, 1, 0.5, '')}</div>
      </div>
    </div>
  </section>
{/if}

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
    max-width: 980px;
    margin: 0 auto var(--s-2);
  }
  .for {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--t-14);
    font-weight: var(--w-bold);
    white-space: nowrap;
  }
  .for i {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    background: var(--c);
    border: var(--line-w) solid var(--line);
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
  .board {
    display: flex;
    gap: var(--s-3);
    max-width: 980px;
    margin: 0 auto;
    overflow-x: auto;
    padding: 0 4px 6px 0;
  }
  .pedal {
    flex: 1 0 200px;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-3);
    background: color-mix(in oklab, var(--c) 30%, var(--surface));
    border: var(--line-w) solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--lift) var(--lift) 0 var(--shadow);
  }
  .pedal.on {
    background: var(--c);
    color: var(--on-track);
  }
  .pedal :global(.lbl) {
    color: var(--text);
  }
  .pedal.on :global(.lbl) {
    color: var(--on-track);
  }
  .pedal header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 30px;
    font-weight: var(--w-black);
  }
  .pedal p {
    flex: 1;
    font-size: var(--t-12);
  }
  .kn {
    flex: 1;
    display: flex;
    justify-content: space-around;
    align-items: center;
  }
  /* on a coloured pedal the controls stay neutral so they read */
  .pedal :global(.switch.on) {
    background: var(--on-track);
  }
  .pedal :global(.knob) {
    --c: var(--on-track);
  }
  @media (max-width: 699px) {
    .hint {
      display: none;
    }
    .for {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .pedal {
      flex-basis: 176px;
    }
  }
</style>
